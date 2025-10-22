import { EventEmitter } from 'node:events';

import { z } from 'zod';

import { Logger } from '../utils/logger.js';

import { RiskViolationError } from './errors.js';
import {
  RiskConfigSchema,
  type RiskConfig,
  type RiskManualOverrideConfig,
  type RiskMarketVolatilityInput,
  type RiskPositionOutcome,
  type RiskStatusSummary,
} from './types.js';

interface PositionState {
  taskId: string;
  workflowName: string;
  pluginId: string;
  contextId: string;
  asset: string;
  notionalUsd: number;
  leverage?: number;
  openedAt: Date;
  metadata?: Record<string, unknown>;
}

interface KillSwitchState {
  engaged: boolean;
  invariant?: string;
  reason?: string;
  triggeredAt?: Date;
  details?: Record<string, unknown>;
}

interface ManualHaltState {
  active: boolean;
  reason?: string;
  activatedAt?: Date;
}

interface ManualOverrideState {
  active: boolean;
  reason?: string;
  appliedAt?: Date;
  expiresAt?: Date;
}

interface CircuitBreakerState {
  active: boolean;
  threshold?: number;
  cooldownMinutes?: number;
  lastTriggeredAt?: Date;
}

interface LastViolationState {
  invariant: string;
  reason: string;
  at: Date;
  details?: Record<string, unknown>;
}

const DEFAULT_MANUAL_OVERRIDE: ManualOverrideState = {
  active: false,
};

const DEFAULT_MANUAL_HALT: ManualHaltState = {
  active: false,
};

const CIRCUIT_BREAKER_INVARIANT = 'risk.circuit-breaker';
const POSITION_LIMIT_INVARIANT = 'risk.position-sizing';
const EXPOSURE_LIMIT_INVARIANT = 'risk.max-exposure';
const DRAWDOWN_INVARIANT = 'risk.max-drawdown';
const STOP_LOSS_INVARIANT = 'risk.stop-loss';
const EQUITY_INVARIANT = 'risk.min-equity';

const NOTIONAL_KEYS = [
  'notionalUsd',
  'notionalUSD',
  'sizeUsd',
  'valueUsd',
  'amountUsd',
  'exposureUsd',
];

const ASSET_KEYS = ['asset', 'symbol', 'pair', 'market', 'token'];

/**
 * Comprehensive risk management engine responsible for enforcing
 * guardrails defined in agent card configuration.
 */
export class RiskManager extends EventEmitter {
  public static fromGuardrails(guardrails: Record<string, unknown> | undefined): RiskManager | undefined {
    if (!guardrails || typeof guardrails !== 'object') {
      return undefined;
    }
    if (!('risk' in guardrails)) {
      return undefined;
    }
    const rawRisk = (guardrails as Record<string, unknown>)['risk'];
    if (!rawRisk || typeof rawRisk !== 'object') {
      return undefined;
    }

    try {
      const parsed = RiskConfigSchema.parse(rawRisk);
      if (!parsed.enabled) {
        return undefined;
      }
      return new RiskManager(parsed);
    } catch (error) {
      const logger = Logger.getInstance('RiskManager');
      if (error instanceof z.ZodError) {
        logger.error('Failed to parse risk guardrail configuration');
        for (const issue of error.issues) {
          logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
        }
      } else {
        logger.error('Unexpected error while parsing risk guardrails', error);
      }
      return undefined;
    }
  }

  private readonly logger: Logger;
  private readonly config: RiskConfig;
  private readonly protectedWorkflows: Set<string>;
  private readonly protectedWorkflowTools: Set<string>;
  private readonly protectedTools: Set<string>;

  private openPositions: Map<string, PositionState> = new Map();
  private exposureUsd: number = 0;
  private realizedPnLUsd: number = 0;
  private equityCurrent: number;
  private equityPeak: number;

  private killSwitch: KillSwitchState = { engaged: false };
  private manualHalt: ManualHaltState = { ...DEFAULT_MANUAL_HALT };
  private manualOverride: ManualOverrideState = { ...DEFAULT_MANUAL_OVERRIDE };
  private circuitBreaker: CircuitBreakerState = { active: false };
  private lastViolation?: LastViolationState;

  constructor(config: RiskConfig) {
    super();
    this.config = config;
    this.logger = Logger.getInstance('RiskManager');

    const workflowList = config.protected?.workflows ?? [];
    this.protectedWorkflows = new Set(workflowList.map((value) => value.trim()).filter(Boolean));
    // For convenience, also store dispatch tool equivalents
    this.protectedWorkflowTools = new Set(
      workflowList
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => (value.startsWith('dispatch_workflow_') ? value : `dispatch_workflow_${value}`)),
    );

    this.protectedTools = new Set((config.protected?.tools ?? []).map((value) => value.trim()).filter(Boolean));

    this.equityCurrent = config.initialEquityUsd;
    this.equityPeak = config.initialEquityUsd;

    if (config.circuitBreaker?.enabled) {
      this.circuitBreaker.threshold = config.circuitBreaker.threshold;
      this.circuitBreaker.cooldownMinutes = config.circuitBreaker.cooldownMinutes;
    }
  }

  /**
   * Indicates if trading operations are currently allowed.
   */
  public get tradingAllowed(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    this.refreshManualOverride();

    if (this.manualHalt.active) {
      return false;
    }

    if (this.circuitBreaker.active && !this.manualOverride.active) {
      return false;
    }

    if (this.killSwitch.engaged && !this.manualOverride.active) {
      return false;
    }

    return true;
  }

  /**
   * Attempt to register a workflow execution. Throws RiskViolationError when guardrails are breached.
   */
  public registerWorkflowExecution(args: {
    workflowName: string;
    pluginId: string;
    taskId: string;
    contextId: string;
    params: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.config.enabled) {
      return;
    }

    const { workflowName, pluginId, taskId, contextId, params, metadata } = args;
    if (!this.shouldEnforceWorkflow(workflowName, pluginId)) {
      return;
    }

    this.ensureTradingPermitted('workflow', {
      workflowName,
      pluginId,
      taskId,
    });

    const notional = this.extractNotionalUsd(params);
    if (notional === undefined) {
      throw new RiskViolationError(
        `Workflow ${workflowName} missing notional or size information required for risk evaluation`,
        {
          invariant: POSITION_LIMIT_INVARIANT,
          details: { workflowName, pluginId },
        },
      );
    }

    const asset = this.extractAsset(params);
    const leverage = this.extractLeverage(params);

    this.enforcePositionSizing({ notionalUsd: notional, asset, workflowName, pluginId });
    this.enforceExposureLimit(notional, { workflowName, pluginId });
    this.enforceConcurrentLimit({ workflowName, pluginId });

    const position: PositionState = {
      taskId,
      workflowName,
      pluginId,
      contextId,
      asset,
      notionalUsd: notional,
      leverage,
      openedAt: new Date(),
      metadata,
    };

    this.openPositions.set(taskId, position);
    this.exposureUsd += notional;
    this.logger.debug('Registered workflow exposure', {
      taskId,
      workflowName,
      pluginId,
      notionalUsd: notional,
      asset,
      exposureUsd: this.exposureUsd,
    });
  }

  /**
   * Record workflow completion, updating exposure and portfolio metrics.
   */
  public completeWorkflow(taskId: string, outcome: RiskPositionOutcome): void {
    if (!this.config.enabled) {
      return;
    }

    const position = this.openPositions.get(taskId);
    if (!position) {
      return;
    }

    this.openPositions.delete(taskId);
    this.exposureUsd = Math.max(0, this.exposureUsd - position.notionalUsd);

    const realized = this.resolvePnl(outcome, position.notionalUsd);
    this.realizedPnLUsd += realized;
    this.equityCurrent = this.config.initialEquityUsd + this.realizedPnLUsd;
    this.equityPeak = Math.max(this.equityPeak, this.equityCurrent);

    this.logger.debug('Workflow completed', {
      taskId,
      workflowName: position.workflowName,
      status: outcome.status,
      pnlUsd: realized,
      exposureUsd: this.exposureUsd,
      equity: this.equityCurrent,
    });

    this.evaluatePortfolioInvariants({ realized, outcome });
  }

  /**
   * Cancel a workflow execution and release exposure without recording PnL.
   */
  public cancelWorkflow(taskId: string, reason?: string): void {
    if (!this.config.enabled) {
      return;
    }
    const position = this.openPositions.get(taskId);
    if (!position) {
      return;
    }
    this.openPositions.delete(taskId);
    this.exposureUsd = Math.max(0, this.exposureUsd - position.notionalUsd);
    this.logger.debug('Workflow canceled', {
      taskId,
      workflowName: position.workflowName,
      reason,
      exposureUsd: this.exposureUsd,
    });
  }

  /**
   * Evaluate risk controls for tool invocation. Throws when guardrails breached.
   */
  public evaluateToolInvocation(toolName: string, args: Record<string, unknown> | undefined): void {
    if (!this.config.enabled) {
      return;
    }

    if (!this.shouldEnforceTool(toolName)) {
      return;
    }

    this.ensureTradingPermitted('tool', { toolName });

    if (!args) {
      return;
    }

    const notional = this.extractNotionalUsd(args);
    if (notional === undefined) {
      return;
    }

    const asset = this.extractAsset(args);
    this.enforcePositionSizing({ notionalUsd: notional, asset, toolName });
    this.enforceExposureLimit(notional, { toolName });
  }

  /**
   * Update market volatility metrics to feed the circuit breaker.
   */
  public updateMarketVolatility(input: RiskMarketVolatilityInput): void {
    if (!this.config.enabled || !this.config.circuitBreaker?.enabled) {
      return;
    }

    const observedAt = input.observedAt ?? new Date();
    const threshold = this.config.circuitBreaker.threshold;
    const lookback = input.lookbackMinutes ?? this.config.circuitBreaker.lookbackMinutes;

    this.refreshCircuitBreaker();

    if (input.volatility >= threshold) {
      this.circuitBreaker.active = true;
      this.circuitBreaker.lastTriggeredAt = observedAt;
      this.lastViolation = {
        invariant: CIRCUIT_BREAKER_INVARIANT,
        reason: `Volatility ${input.volatility.toFixed(4)} exceeds threshold ${threshold.toFixed(4)}`,
        at: observedAt,
        details: {
          asset: input.asset,
          metricKey: input.metricKey ?? this.config.circuitBreaker.metricKey,
          lookbackMinutes: lookback,
        },
      };
      this.logger.warn('Circuit breaker activated', {
        asset: input.asset,
        volatility: input.volatility,
        threshold,
        lookbackMinutes: lookback,
      });
      this.emit('trading-halted', {
        invariant: CIRCUIT_BREAKER_INVARIANT,
        reason: 'Circuit breaker triggered by volatility',
        timestamp: observedAt,
      });
    }
  }

  /**
   * Manually toggle emergency stop (manual halt state).
   */
  public setManualHalt(active: boolean, options?: { reason?: string }): void {
    if (!this.config.enabled) {
      return;
    }

    this.manualHalt = {
      active,
      reason: options?.reason,
      activatedAt: active ? new Date() : undefined,
    };

    if (active) {
      this.logger.warn('Manual emergency stop engaged', { reason: options?.reason });
      this.emit('trading-halted', {
        invariant: 'risk.manual-halt',
        reason: options?.reason ?? 'Manual emergency stop engaged',
        timestamp: new Date(),
      });
    } else {
      this.logger.info('Manual emergency stop cleared');
    }
  }

  /**
   * Enable or disable manual override to bypass automatic kill switch/circuit breaker.
   */
  public setManualOverride(active: boolean, options?: { reason?: string; durationMinutes?: number }): void {
    if (!this.config.enabled) {
      return;
    }

    const manualConfig: RiskManualOverrideConfig = this.config.manualOverride ?? { allow: true };
    if (!manualConfig.allow) {
      throw new Error('Manual override disabled in configuration');
    }

    if (!active) {
      this.manualOverride = { active: false };
      this.logger.info('Manual override disabled');
      return;
    }

    if (options?.durationMinutes && manualConfig.maxDurationMinutes) {
      if (options.durationMinutes > manualConfig.maxDurationMinutes) {
        throw new Error(
          `Manual override duration ${options.durationMinutes}m exceeds configured maximum of ${manualConfig.maxDurationMinutes}m`,
        );
      }
    }

    const expiresAt = options?.durationMinutes
      ? new Date(Date.now() + options.durationMinutes * 60 * 1000)
      : undefined;

    this.manualOverride = {
      active: true,
      reason: options?.reason,
      appliedAt: new Date(),
      expiresAt,
    };
    this.logger.warn('Manual override enabled', {
      reason: options?.reason,
      expiresAt,
    });
  }

  /**
   * Reset automatic kill switch (once underlying issue is addressed).
   */
  public resetKillSwitch(reason?: string): void {
    if (!this.config.enabled) {
      return;
    }

    if (this.killSwitch.engaged) {
      this.logger.info('Kill switch reset', { reason });
    }
    this.killSwitch = { engaged: false };
  }

  /**
   * Reset circuit breaker immediately (e.g. after manual review).
   */
  public clearCircuitBreaker(): void {
    if (!this.config.enabled) {
      return;
    }
    if (this.circuitBreaker.active) {
      this.logger.info('Circuit breaker manually cleared');
    }
    this.circuitBreaker.active = false;
    this.circuitBreaker.lastTriggeredAt = undefined;
  }

  /**
   * Retrieve risk control status summary.
   */
  public getStatus(): RiskStatusSummary {
    if (!this.config.enabled) {
      return {
        enabled: false,
        tradingAllowed: true,
        killSwitchEngaged: false,
        manualHaltActive: false,
        manualOverrideActive: false,
        circuitBreakerActive: false,
        exposureUsd: 0,
        openPositions: 0,
        equity: {
          initial: this.config.initialEquityUsd,
          current: this.config.initialEquityUsd,
          peak: this.config.initialEquityUsd,
          drawdownPct: 0,
        },
      };
    }

    this.refreshManualOverride();
    this.refreshCircuitBreaker();

    const drawdownPct = this.equityPeak > 0 ? (this.equityPeak - this.equityCurrent) / this.equityPeak : 0;

    return {
      enabled: true,
      tradingAllowed: this.tradingAllowed,
      killSwitchEngaged: this.killSwitch.engaged,
      manualHaltActive: this.manualHalt.active,
      manualOverrideActive: this.manualOverride.active,
      circuitBreakerActive: this.circuitBreaker.active,
      lastViolation: this.lastViolation,
      exposureUsd: this.exposureUsd,
      openPositions: this.openPositions.size,
      equity: {
        initial: this.config.initialEquityUsd,
        current: this.equityCurrent,
        peak: this.equityPeak,
        drawdownPct,
      },
      circuitBreaker: this.config.circuitBreaker?.enabled
        ? {
            threshold: this.config.circuitBreaker.threshold,
            lastTriggeredAt: this.circuitBreaker.lastTriggeredAt,
            cooldownMinutes: this.config.circuitBreaker.cooldownMinutes,
          }
        : undefined,
      manualOverride: this.manualOverride.active
        ? {
            active: true,
            reason: this.manualOverride.reason,
            expiresAt: this.manualOverride.expiresAt,
          }
        : { active: false },
    };
  }

  private ensureTradingPermitted(scope: 'workflow' | 'tool', context: Record<string, unknown>): void {
    if (!this.tradingAllowed) {
      const invariant = this.killSwitch.engaged ? 'risk.kill-switch' : CIRCUIT_BREAKER_INVARIANT;
      const reason = this.killSwitch.engaged
        ? this.killSwitch.reason ?? 'Kill switch engaged'
        : 'Circuit breaker active';
      throw new RiskViolationError(`Trading halted: ${reason}`, {
        invariant,
        details: context,
      });
    }
  }

  private enforcePositionSizing(input: {
    notionalUsd: number;
    asset: string;
    workflowName?: string;
    pluginId?: string;
    toolName?: string;
  }): void {
    const limits = this.config.positionLimits;
    if (!limits) {
      return;
    }
    const context = {
      asset: input.asset,
      workflowName: input.workflowName,
      pluginId: input.pluginId,
      toolName: input.toolName,
    };

    if (limits.maxPerPositionUsd && input.notionalUsd > limits.maxPerPositionUsd) {
      this.triggerKillSwitch(
        POSITION_LIMIT_INVARIANT,
        `Position size ${input.notionalUsd.toFixed(2)} exceeds max ${limits.maxPerPositionUsd.toFixed(2)}`,
        context,
      );
      throw new RiskViolationError('Position sizing limit exceeded', {
        invariant: POSITION_LIMIT_INVARIANT,
        details: {
          ...context,
          notionalUsd: input.notionalUsd,
          maxPerPositionUsd: limits.maxPerPositionUsd,
        },
      });
    }

    if (limits.maxPerAssetUsd) {
      const assetKey = input.asset.toUpperCase();
      const perAssetLimit = limits.maxPerAssetUsd[assetKey] ?? limits.maxPerAssetUsd.default;
      if (perAssetLimit && input.notionalUsd > perAssetLimit) {
        this.triggerKillSwitch(
          POSITION_LIMIT_INVARIANT,
          `Asset ${assetKey} position ${input.notionalUsd.toFixed(2)} exceeds limit ${perAssetLimit.toFixed(2)}`,
          context,
        );
        throw new RiskViolationError('Per-asset position limit exceeded', {
          invariant: POSITION_LIMIT_INVARIANT,
          details: {
            ...context,
            asset: assetKey,
            notionalUsd: input.notionalUsd,
            maxPerAssetUsd: perAssetLimit,
          },
        });
      }
    }
  }

  private enforceExposureLimit(additionalExposure: number, context: Record<string, unknown>): void {
    const limit = this.config.positionLimits.maxGrossExposureUsd ?? this.config.portfolioLimits.maxGrossExposureUsd;
    if (!limit) {
      return;
    }

    const projectedExposure = this.exposureUsd + additionalExposure;
    if (projectedExposure > limit) {
      this.triggerKillSwitch(
        EXPOSURE_LIMIT_INVARIANT,
        `Projected exposure ${projectedExposure.toFixed(2)} exceeds limit ${limit.toFixed(2)}`,
        context,
      );
      throw new RiskViolationError('Maximum exposure limit exceeded', {
        invariant: EXPOSURE_LIMIT_INVARIANT,
        details: {
          ...context,
          projectedExposure,
          limit,
        },
      });
    }
  }

  private enforceConcurrentLimit(context: Record<string, unknown>): void {
    const limit = this.config.positionLimits.maxConcurrentPositions;
    if (!limit) {
      return;
    }

    const projected = this.openPositions.size + 1;
    if (projected > limit) {
      this.triggerKillSwitch(
        POSITION_LIMIT_INVARIANT,
        `Concurrent positions ${projected} exceeds limit ${limit}`,
        context,
      );
      throw new RiskViolationError('Maximum concurrent positions exceeded', {
        invariant: POSITION_LIMIT_INVARIANT,
        details: {
          ...context,
          projected,
          limit,
        },
      });
    }
  }

  private triggerKillSwitch(
    invariant: string,
    reason: string,
    details?: Record<string, unknown>,
  ): void {
    this.killSwitch = {
      engaged: true,
      invariant,
      reason,
      triggeredAt: new Date(),
      details,
    };
    this.lastViolation = {
      invariant,
      reason,
      at: this.killSwitch.triggeredAt,
      details,
    };
    this.logger.error('Kill switch engaged', {
      invariant,
      reason,
      details,
    });
    this.emit('kill-switch-engaged', {
      invariant,
      reason,
      timestamp: this.killSwitch.triggeredAt,
      details,
    });
    this.emit('trading-halted', {
      invariant,
      reason,
      timestamp: this.killSwitch.triggeredAt,
      details,
    });
  }

  private evaluatePortfolioInvariants(params: { realized: number; outcome: RiskPositionOutcome }): void {
    const limits = this.config.portfolioLimits;
    if (!limits) {
      return;
    }

    const currentEquity = this.equityCurrent;
    const peakEquity = this.equityPeak;

    if (limits.minEquityUsd && currentEquity < limits.minEquityUsd) {
      this.triggerKillSwitch(
        EQUITY_INVARIANT,
        `Equity ${currentEquity.toFixed(2)} below minimum ${limits.minEquityUsd.toFixed(2)}`,
        { currentEquity, minEquityUsd: limits.minEquityUsd },
      );
      return;
    }

    if (limits.stopLossPct) {
      const lossPct = (this.config.initialEquityUsd - currentEquity) / this.config.initialEquityUsd;
      if (lossPct >= limits.stopLossPct) {
        this.triggerKillSwitch(
          STOP_LOSS_INVARIANT,
          `Loss ${lossPct.toFixed(4)} exceeds stop loss ${limits.stopLossPct.toFixed(4)}`,
          { lossPct, realized: params.realized },
        );
        return;
      }
    }

    if (limits.maxDrawdownPct && peakEquity > 0) {
      const drawdownPct = (peakEquity - currentEquity) / peakEquity;
      if (drawdownPct >= limits.maxDrawdownPct) {
        this.triggerKillSwitch(
          DRAWDOWN_INVARIANT,
          `Drawdown ${drawdownPct.toFixed(4)} exceeds max ${limits.maxDrawdownPct.toFixed(4)}`,
          { drawdownPct },
        );
      }
    }
  }

  private extractNotionalUsd(params: Record<string, unknown>): number | undefined {
    for (const key of NOTIONAL_KEYS) {
      const value = params[key];
      const numeric = this.asNumber(value);
      if (numeric !== undefined) {
        return numeric;
      }
    }

    if (typeof params['risk'] === 'object' && params['risk'] !== null) {
      const nested = params['risk'] as Record<string, unknown>;
      for (const key of NOTIONAL_KEYS) {
        const numeric = this.asNumber(nested[key]);
        if (numeric !== undefined) {
          return numeric;
        }
      }
    }

    const amount = this.asNumber(params['amount'] ?? params['size']);
    const price = this.asNumber(params['price'] ?? params['avgPrice'] ?? params['markPrice']);
    if (amount !== undefined && price !== undefined) {
      return amount * price;
    }

    return undefined;
  }

  private extractAsset(params: Record<string, unknown>): string {
    for (const key of ASSET_KEYS) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim().toUpperCase();
      }
    }
    if (typeof params['baseAsset'] === 'string' && params['baseAsset'].trim()) {
      return params['baseAsset'].trim().toUpperCase();
    }
    return 'UNKNOWN';
  }

  private extractLeverage(params: Record<string, unknown>): number | undefined {
    const leverage = this.asNumber(params['leverage'] ?? params['leverageX']);
    if (leverage && leverage > 0) {
      return leverage;
    }
    return undefined;
  }

  private resolvePnl(outcome: RiskPositionOutcome, notional: number): number {
    if (typeof outcome.pnlUsd === 'number' && Number.isFinite(outcome.pnlUsd)) {
      return outcome.pnlUsd;
    }
    if (typeof outcome.lossPct === 'number' && Number.isFinite(outcome.lossPct)) {
      return -Math.abs(outcome.lossPct) * notional;
    }
    if (outcome.status === 'failed') {
      return -notional;
    }
    return 0;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private shouldEnforceWorkflow(workflowName: string, pluginId: string): boolean {
    if (this.protectedWorkflows.size === 0 && this.protectedWorkflowTools.size === 0) {
      return true;
    }
    if (this.protectedWorkflows.has(pluginId)) {
      return true;
    }
    if (this.protectedWorkflows.has(workflowName)) {
      return true;
    }
    const normalizedPlugin = pluginId.startsWith('dispatch_workflow_')
      ? pluginId
      : `dispatch_workflow_${pluginId}`;
    if (this.protectedWorkflowTools.has(normalizedPlugin)) {
      return true;
    }
    const normalizedTool = workflowName.startsWith('dispatch_workflow_')
      ? workflowName.replace('dispatch_workflow_', '')
      : `dispatch_workflow_${workflowName}`;
    if (this.protectedWorkflows.has(normalizedTool) || this.protectedWorkflowTools.has(normalizedTool)) {
      return true;
    }
    return false;
  }

  private shouldEnforceTool(toolName: string): boolean {
    if (this.protectedTools.size === 0) {
      return true;
    }
    if (this.protectedTools.has(toolName)) {
      return true;
    }
    return false;
  }

  private refreshCircuitBreaker(): void {
    if (!this.circuitBreaker.active || !this.circuitBreaker.lastTriggeredAt) {
      return;
    }
    const cooldownMinutes = this.config.circuitBreaker?.cooldownMinutes;
    if (!cooldownMinutes) {
      return;
    }
    const resetAt = this.circuitBreaker.lastTriggeredAt.getTime() + cooldownMinutes * 60 * 1000;
    if (Date.now() >= resetAt) {
      this.circuitBreaker.active = false;
      this.circuitBreaker.lastTriggeredAt = undefined;
      this.logger.info('Circuit breaker cooled down automatically');
    }
  }

  private refreshManualOverride(): void {
    if (!this.manualOverride.active || !this.manualOverride.expiresAt) {
      return;
    }
    if (Date.now() >= this.manualOverride.expiresAt.getTime()) {
      this.manualOverride = { active: false };
      this.logger.info('Manual override expired');
      this.emit('manual-override-expired', {
        timestamp: new Date(),
      });
    }
  }
}
