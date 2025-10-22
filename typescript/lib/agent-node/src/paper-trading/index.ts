export {
  MarketDataPointSchema,
  ReplayDatasetSchema,
  OpenPositionRequestSchema,
  ClosePositionRequestSchema,
} from './types.js';
export type {
  MarketDataPoint,
  ReplayDataset,
  OpenPositionRequest,
  ClosePositionRequest,
  ClosePositionReason,
  SimulatedPosition,
  EquitySnapshot,
  TradeRecord,
  ReplayEngineConfig,
  ReplayRuntime,
  StrategyContext,
  StrategyLogger,
  StrategyTick,
  BacktestStrategy,
  BacktestReport,
  BacktestStatistics,
  BacktestEngineOptions,
  TradingSide,
} from './types.js';

export {
  loadReplayDataset,
  normalizeReplayDataset,
  validateReplayDataset,
  getDatasetSummary,
} from './dataset.js';
export { GmxReplayEngine } from './replayEngine.js';
export { BacktestEngine } from './backtest.js';
export { buildBacktestStatistics } from './metrics.js';
