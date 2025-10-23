import process from 'node:process';

import { getDatasetSummary } from './dataset.js';
import { buildBacktestStatistics } from './metrics.js';
import { GmxReplayEngine } from './replayEngine.js';
import type {
  BacktestEngineOptions,
  BacktestReport,
  BacktestStrategy,
  ReplayDataset,
  SimulatedPosition,
  StrategyContext,
  StrategyLogger,
  StrategyTick,
  TradeRecord,
} from './types.js';

class DebugAwareStrategyLogger implements StrategyLogger {
  private readonly shouldLog = Boolean(process.env['DEBUG_BACKTEST']);

  constructor(private readonly strategyName: string) {}

  private format(message: string): string {
    return `[${this.strategyName}] ${message}`;
  }

  debug(message: string): void {
    if (this.shouldLog) {
      console.debug(this.format(message));
    }
  }

  info(message: string): void {
    if (this.shouldLog) {
      console.info(this.format(message));
    }
  }

  warn(message: string): void {
    if (this.shouldLog) {
      console.warn(this.format(message));
    }
  }

  error(message: string): void {
    if (this.shouldLog) {
      console.error(this.format(message));
    }
  }
}

function positionToTradeRecord(position: SimulatedPosition): TradeRecord {
  if (
    position.status !== 'closed' ||
    position.closeTimestamp === undefined ||
    position.closePrice === undefined ||
    position.realizedPnlUsd === undefined
  ) {
    throw new Error(`Cannot convert open position ${position.id} to trade record`);
  }

  return {
    positionId: position.id,
    side: position.side,
    entryTimestamp: position.entryTimestamp,
    exitTimestamp: position.closeTimestamp,
    entryPrice: position.entryPrice,
    exitPrice: position.closePrice,
    sizeUsd: position.sizeUsd,
    realizedPnlUsd: position.realizedPnlUsd,
    feesPaidUsd: position.feesPaidUsd,
    label: position.label,
    metadata: position.metadata ? { ...position.metadata } : undefined,
    reason: position.reason,
  };
}

export class BacktestEngine {
  private readonly dataset: ReplayDataset;
  private readonly engine: GmxReplayEngine;

  constructor(dataset: ReplayDataset, options: BacktestEngineOptions = {}) {
    this.dataset = dataset;
    this.engine = new GmxReplayEngine(dataset, options);
  }

  get runtime(): GmxReplayEngine {
    return this.engine;
  }

  async run(strategy: BacktestStrategy): Promise<BacktestReport> {
    this.engine.reset();
    const logger = new DebugAwareStrategyLogger(strategy.name);
    const context: StrategyContext = {
      dataset: this.dataset,
      runtime: this.engine,
      logger,
    };

    if (strategy.onInit) {
      await strategy.onInit(context);
    }

    for (let index = 0; index < this.dataset.data.length; index++) {
      const snapshot = this.engine.jumpToIndex(index);
      const tick: StrategyTick = { index, snapshot, context };
      await strategy.onTick(tick);
    }

    if (strategy.onComplete) {
      await strategy.onComplete(context);
    }

    if (this.engine.getOpenPositions().length > 0) {
      this.engine.closeAllPositions('strategy-exit');
    }

    const closedPositions = this.engine.getClosedPositions();
    const tradeRecords = closedPositions
      .filter(
        (position) =>
          position.status === 'closed' &&
          position.closeTimestamp !== undefined &&
          position.closePrice !== undefined &&
          position.realizedPnlUsd !== undefined,
      )
      .map(positionToTradeRecord);

    const equityCurve = this.engine.getEquityHistory();
    const statistics = buildBacktestStatistics(equityCurve, closedPositions);
    const datasetSummary = getDatasetSummary(this.dataset);

    const initialBalance = this.engine.getInitialBalance();
    const finalBalance = this.engine.getEquity();
    const realizedPnlUsd = this.engine.getRealizedPnl();
    const unrealizedPnlUsd = this.engine.getUnrealizedPnl();
    const totalReturnPct =
      initialBalance > 0 ? ((finalBalance - initialBalance) / initialBalance) * 100 : 0;

    return {
      strategyName: strategy.name,
      dataset: {
        name: this.dataset.market.name,
        symbol: this.dataset.market.symbol,
        timeframeSeconds: this.dataset.timeframeSeconds,
        totalPoints: datasetSummary.totalPoints,
        startTimestamp: datasetSummary.startTimestamp,
        endTimestamp: datasetSummary.endTimestamp,
      },
      initialBalanceUsd: initialBalance,
      finalBalanceUsd: finalBalance,
      realizedPnlUsd,
      unrealizedPnlUsd,
      totalReturnPct,
      equityCurve,
      trades: tradeRecords,
      statistics,
    };
  }
}
