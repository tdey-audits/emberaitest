import {
  ClosePositionRequestSchema,
  OpenPositionRequestSchema,
  type ClosePositionReason,
  type MarketDataPoint,
  type OpenPositionRequest,
  type ReplayDataset,
  type ReplayEngineConfig,
  type ReplayRuntime,
  type SimulatedPosition,
  type TradingSide,
} from './types.js';
import { normalizeReplayDataset } from './dataset.js';

const DEFAULT_ENGINE_CONFIG: Required<ReplayEngineConfig> = {
  initialBalanceUsd: 100_000,
  feeBps: 5,
  slippageBps: 2,
};

function clonePosition(position: SimulatedPosition): SimulatedPosition {
  return {
    ...position,
    metadata: position.metadata ? { ...position.metadata } : undefined,
  };
}

function applySlippage(
  price: number,
  side: TradingSide,
  slippageBps: number,
  mode: 'entry' | 'exit',
): number {
  if (slippageBps === 0) {
    return price;
  }

  const slip = slippageBps / 10_000;
  if (side === 'long') {
    return mode === 'entry' ? price * (1 + slip) : price * (1 - slip);
  }
  // side === 'short'
  return mode === 'entry' ? price * (1 - slip) : price * (1 + slip);
}

export class GmxReplayEngine implements ReplayRuntime {
  private readonly dataset: ReplayDataset;
  private readonly config: Required<ReplayEngineConfig>;

  private pointer = 0;
  private currentSnapshot: MarketDataPoint;
  private cashBalanceUsd: number;
  private realizedPnlUsd = 0;
  private idCounter = 0;

  private openPositions: Map<string, SimulatedPosition> = new Map();
  private closedPositions: SimulatedPosition[] = [];
  private equityHistory: {
    timestamp: number;
    equityUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
  }[] = [];

  constructor(dataset: ReplayDataset, config: ReplayEngineConfig = {}) {
    this.dataset = normalizeReplayDataset(dataset);
    this.config = {
      initialBalanceUsd: config.initialBalanceUsd ?? DEFAULT_ENGINE_CONFIG.initialBalanceUsd,
      feeBps: config.feeBps ?? DEFAULT_ENGINE_CONFIG.feeBps,
      slippageBps: config.slippageBps ?? DEFAULT_ENGINE_CONFIG.slippageBps,
    };
    this.cashBalanceUsd = this.config.initialBalanceUsd;
    this.currentSnapshot = this.dataset.data[0];
    this.reset();
  }

  getInitialBalance(): number {
    return this.config.initialBalanceUsd;
  }

  reset(): void {
    this.pointer = 0;
    this.idCounter = 0;
    this.openPositions = new Map();
    this.closedPositions = [];
    this.cashBalanceUsd = this.config.initialBalanceUsd;
    this.realizedPnlUsd = 0;
    this.currentSnapshot = this.dataset.data[0];
    this.equityHistory = [];
    this.updateUnrealized(this.currentSnapshot);
    this.recordEquity(this.currentSnapshot);
  }

  getCurrentSnapshot(): MarketDataPoint {
    return this.currentSnapshot;
  }

  jumpToIndex(index: number): MarketDataPoint {
    if (index < 0 || index >= this.dataset.data.length) {
      throw new RangeError(`Snapshot index ${index} out of range`);
    }
    this.pointer = index;
    this.currentSnapshot = this.dataset.data[index];
    this.updateUnrealized(this.currentSnapshot);
    this.recordEquity(this.currentSnapshot);
    return this.currentSnapshot;
  }

  advance(): MarketDataPoint {
    if (this.pointer >= this.dataset.data.length - 1) {
      throw new RangeError('Cannot advance beyond final snapshot');
    }
    return this.jumpToIndex(this.pointer + 1);
  }

  advanceTo(timestamp: number): MarketDataPoint {
    let targetIndex = this.pointer;
    for (let i = this.pointer + 1; i < this.dataset.data.length; i++) {
      if (this.dataset.data[i].timestamp > timestamp) {
        break;
      }
      targetIndex = i;
    }
    return this.jumpToIndex(targetIndex);
  }

  openPosition(request: OpenPositionRequest): SimulatedPosition {
    const validated = OpenPositionRequestSchema.parse(request);
    const snapshot = this.currentSnapshot;
    const entryPrice = applySlippage(
      snapshot.markPrice,
      validated.side,
      this.config.slippageBps,
      'entry',
    );
    const sizeTokens = validated.sizeUsd / entryPrice;
    const openFeeUsd = (validated.sizeUsd * this.config.feeBps) / 10_000;

    if (this.cashBalanceUsd < validated.collateralUsd + openFeeUsd) {
      throw new Error('Insufficient cash balance to open position');
    }

    this.cashBalanceUsd -= validated.collateralUsd;
    this.cashBalanceUsd -= openFeeUsd;

    const positionId = `pos-${this.idCounter + 1}`;
    this.idCounter += 1;

    const position: SimulatedPosition = {
      id: positionId,
      side: validated.side,
      sizeUsd: validated.sizeUsd,
      sizeTokens,
      collateralUsd: validated.collateralUsd,
      leverage: validated.leverage,
      entryPrice,
      entryTimestamp: snapshot.timestamp,
      takeProfitPrice: validated.takeProfitPrice,
      stopLossPrice: validated.stopLossPrice,
      status: 'open',
      feesPaidUsd: openFeeUsd,
      metadata: validated.metadata ? { ...validated.metadata } : undefined,
      label: validated.label,
    };

    this.openPositions.set(positionId, position);
    this.updateUnrealized(snapshot);
    this.recordEquity(snapshot);

    return clonePosition(position);
  }

  closePosition(positionId: string, reason: ClosePositionReason = 'manual'): SimulatedPosition {
    const validated = ClosePositionRequestSchema.parse({ positionId, reason });
    const existing = this.openPositions.get(validated.positionId);

    if (!existing) {
      throw new Error(`Position ${validated.positionId} not found`);
    }

    const snapshot = this.currentSnapshot;
    const closePrice = applySlippage(
      snapshot.markPrice,
      existing.side,
      this.config.slippageBps,
      'exit',
    );
    const closeFeeUsd = (existing.sizeUsd * this.config.feeBps) / 10_000;
    const priceDiff =
      existing.side === 'long'
        ? closePrice - existing.entryPrice
        : existing.entryPrice - closePrice;
    const pnlBeforeFees = priceDiff * existing.sizeTokens;
    const totalFeesUsd = existing.feesPaidUsd + closeFeeUsd;
    const realizedPnlUsd = pnlBeforeFees - totalFeesUsd;

    this.cashBalanceUsd += existing.collateralUsd;
    this.cashBalanceUsd += pnlBeforeFees;
    this.cashBalanceUsd -= closeFeeUsd;
    this.realizedPnlUsd += realizedPnlUsd;

    this.openPositions.delete(validated.positionId);

    const closedPosition: SimulatedPosition = {
      ...existing,
      status: 'closed',
      closePrice,
      closeTimestamp: snapshot.timestamp,
      realizedPnlUsd,
      unrealizedPnlUsd: 0,
      feesPaidUsd: totalFeesUsd,
      reason: validated.reason,
    };

    this.closedPositions.push(closedPosition);
    this.updateUnrealized(snapshot);
    this.recordEquity(snapshot);

    return clonePosition(closedPosition);
  }

  closeAllPositions(reason: ClosePositionReason = 'manual'): SimulatedPosition[] {
    const closed: SimulatedPosition[] = [];
    const openIds = Array.from(this.openPositions.keys());
    for (const id of openIds) {
      closed.push(this.closePosition(id, reason));
    }
    return closed;
  }

  getOpenPositions(): SimulatedPosition[] {
    this.updateUnrealized(this.currentSnapshot);
    return Array.from(this.openPositions.values()).map(clonePosition);
  }

  getClosedPositions(): SimulatedPosition[] {
    return this.closedPositions.map(clonePosition);
  }

  getRealizedPnl(): number {
    return this.realizedPnlUsd;
  }

  getUnrealizedPnl(): number {
    return this.computeUnrealized(this.currentSnapshot);
  }

  getEquity(): number {
    return this.cashBalanceUsd + this.computeMargin() + this.getUnrealizedPnl();
  }

  getEquityHistory(): {
    timestamp: number;
    equityUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
  }[] {
    return this.equityHistory.map((snapshot) => ({ ...snapshot }));
  }

  private computeMargin(): number {
    let margin = 0;
    for (const position of this.openPositions.values()) {
      margin += position.collateralUsd;
    }
    return margin;
  }

  private computeUnrealized(snapshot: MarketDataPoint): number {
    let total = 0;
    for (const position of this.openPositions.values()) {
      const priceDiff =
        position.side === 'long'
          ? snapshot.markPrice - position.entryPrice
          : position.entryPrice - snapshot.markPrice;
      total += priceDiff * position.sizeTokens;
    }
    return total;
  }

  private updateUnrealized(snapshot: MarketDataPoint): void {
    for (const position of this.openPositions.values()) {
      const priceDiff =
        position.side === 'long'
          ? snapshot.markPrice - position.entryPrice
          : position.entryPrice - snapshot.markPrice;
      position.unrealizedPnlUsd = priceDiff * position.sizeTokens;
    }
  }

  private recordEquity(snapshot: MarketDataPoint): void {
    const unrealized = this.computeUnrealized(snapshot);
    const equity = this.cashBalanceUsd + this.computeMargin() + unrealized;
    this.equityHistory.push({
      timestamp: snapshot.timestamp,
      equityUsd: equity,
      realizedPnlUsd: this.realizedPnlUsd,
      unrealizedPnlUsd: unrealized,
    });
  }
}
