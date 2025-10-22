import { z } from 'zod';

export const RiskCircuitBreakerSchema = z
  .object({
    enabled: z.boolean().default(false),
    metricKey: z.string().min(1).default('volatility'),
    threshold: z.number().nonnegative(),
    lookbackMinutes: z.number().int().positive().default(5),
    cooldownMinutes: z.number().int().positive().default(15),
  })
  .strict();

export const RiskPositionLimitsSchema = z
  .object({
    maxPerPositionUsd: z.number().positive().optional(),
    maxGrossExposureUsd: z.number().positive().optional(),
    maxPerAssetUsd: z.record(z.string(), z.number().positive()).optional(),
    maxConcurrentPositions: z.number().int().nonnegative().optional(),
  })
  .strict();

export const RiskPortfolioLimitsSchema = z
  .object({
    maxGrossExposureUsd: z.number().positive().optional(),
    maxDrawdownPct: z.number().min(0).max(1).optional(),
    stopLossPct: z.number().min(0).max(1).optional(),
    minEquityUsd: z.number().positive().optional(),
  })
  .strict();

export const RiskProtectedSchema = z
  .object({
    workflows: z.array(z.string().min(1)).optional(),
    tools: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const RiskManualOverrideSchema = z
  .object({
    allow: z.boolean().default(true),
    maxDurationMinutes: z.number().int().positive().optional(),
  })
  .strict();

export const RiskConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    initialEquityUsd: z.number().positive(),
    positionLimits: RiskPositionLimitsSchema.default({}),
    portfolioLimits: RiskPortfolioLimitsSchema.default({}),
    circuitBreaker: RiskCircuitBreakerSchema.optional(),
    protected: RiskProtectedSchema.default({}),
    manualOverride: RiskManualOverrideSchema.default({ allow: true }),
  })
  .strict();

export type RiskCircuitBreakerConfig = z.infer<typeof RiskCircuitBreakerSchema>;
export type RiskPositionLimitsConfig = z.infer<typeof RiskPositionLimitsSchema>;
export type RiskPortfolioLimitsConfig = z.infer<typeof RiskPortfolioLimitsSchema>;
export type RiskProtectedConfig = z.infer<typeof RiskProtectedSchema>;
export type RiskManualOverrideConfig = z.infer<typeof RiskManualOverrideSchema>;
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

export interface RiskWorkflowPrecheck {
  workflowId: string;
  params: Record<string, unknown>;
  contextId?: string;
  description?: string;
}

export interface RiskWorkflowRegistration {
  workflowId: string;
  taskId: string;
  contextId: string;
  notionalUsd: number;
  asset?: string;
  leverage?: number;
  metadata?: Record<string, unknown>;
}

export type RiskPositionOutcomeStatus = 'completed' | 'failed' | 'canceled';

export interface RiskPositionOutcome {
  status: RiskPositionOutcomeStatus;
  pnlUsd?: number;
  notionalUsd?: number;
  lossPct?: number;
  metadata?: Record<string, unknown>;
}

export interface RiskToolInvocation {
  toolName: string;
  args: Record<string, unknown> | undefined;
}

export interface RiskMarketVolatilityInput {
  asset: string;
  metricKey?: string;
  volatility: number;
  lookbackMinutes?: number;
  observedAt?: Date;
}

export interface RiskStatusSummary {
  enabled: boolean;
  tradingAllowed: boolean;
  killSwitchEngaged: boolean;
  manualHaltActive: boolean;
  manualOverrideActive: boolean;
  circuitBreakerActive: boolean;
  lastViolation?: {
    invariant: string;
    reason: string;
    at: Date;
  };
  exposureUsd: number;
  openPositions: number;
  equity: {
    initial: number;
    current: number;
    peak: number;
    drawdownPct: number;
  };
  circuitBreaker?: {
    threshold: number;
    lastTriggeredAt?: Date;
    cooldownMinutes: number;
  };
  manualOverride?: {
    active: boolean;
    reason?: string;
    expiresAt?: Date;
  };
}

export interface RiskEventPayload {
  invariant: string;
  reason: string;
  timestamp: Date;
}

export type RiskEvent =
  | { type: 'kill-switch-engaged'; payload: RiskEventPayload }
  | { type: 'trading-halted'; payload: RiskEventPayload }
  | { type: 'manual-override-expired'; payload: { timestamp: Date } };
