import { z } from 'zod';

export const TradingSideSchema = z.union([z.literal('long'), z.literal('short')]);
export type TradingSide = z.infer<typeof TradingSideSchema>;

export const PositionStatusSchema = z.union([z.literal('open'), z.literal('closed')]);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

export const MarketDataPointSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  markPrice: z.number().positive(),
  indexPrice: z.number().positive(),
  longFundingRate: z.number().optional(),
  shortFundingRate: z.number().optional(),
  openInterestLong: z.number().nonnegative().optional(),
  openInterestShort: z.number().nonnegative().optional(),
});
export type MarketDataPoint = z.infer<typeof MarketDataPointSchema>;

export const ReplayDatasetSchema = z.object({
  version: z.literal(1),
  market: z.object({
    name: z.string(),
    symbol: z.string(),
    marketAddress: z.string(),
    indexToken: z.string(),
    collateralToken: z.string(),
  }),
  timeframeSeconds: z.number().positive(),
  data: z
    .array(MarketDataPointSchema)
    .min(2, 'Replay dataset requires at least two datapoints for simulation'),
});
export type ReplayDataset = z.infer<typeof ReplayDatasetSchema>;

export const OpenPositionRequestSchema = z.object({
  side: TradingSideSchema,
  sizeUsd: z.number().positive(),
  collateralUsd: z.number().positive(),
  leverage: z.number().positive(),
  takeProfitPrice: z.number().positive().optional(),
  stopLossPrice: z.number().positive().optional(),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type OpenPositionRequest = z.infer<typeof OpenPositionRequestSchema>;

export const ClosePositionRequestSchema = z.object({
  positionId: z.string(),
  reason: z
    .union([
      z.literal('manual'),
      z.literal('take-profit'),
      z.literal('stop-loss'),
      z.literal('strategy-exit'),
      z.literal('liquidation'),
    ])
    .default('manual'),
});
export type ClosePositionRequest = z.infer<typeof ClosePositionRequestSchema>;
export type ClosePositionReason = ClosePositionRequest['reason'];

export interface SimulatedPosition {
  id: string;
  side: TradingSide;
  sizeUsd: number;
  sizeTokens: number;
  collateralUsd: number;
  leverage: number;
  entryPrice: number;
  entryTimestamp: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  status: PositionStatus;
  closePrice?: number;
  closeTimestamp?: number;
  realizedPnlUsd?: number;
  unrealizedPnlUsd?: number;
  feesPaidUsd: number;
  metadata?: Record<string, unknown>;
  label?: string;
  reason?: ClosePositionReason;
}

export interface EquitySnapshot {
  timestamp: number;
  equityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
}

export interface TradeRecord {
  positionId: string;
  side: TradingSide;
  entryTimestamp: number;
  exitTimestamp: number;
  entryPrice: number;
  exitPrice: number;
  sizeUsd: number;
  realizedPnlUsd: number;
  feesPaidUsd: number;
  label?: string;
  metadata?: Record<string, unknown>;
  reason?: ClosePositionReason;
}

export interface ReplayEngineConfig {
  initialBalanceUsd?: number;
  feeBps?: number;
  slippageBps?: number;
}

export interface ReplayRuntime {
  getInitialBalance(): number;
  getCurrentSnapshot(): MarketDataPoint;
  openPosition(request: OpenPositionRequest): SimulatedPosition;
  closePosition(positionId: string, reason?: ClosePositionReason): SimulatedPosition;
  closeAllPositions(reason?: ClosePositionReason): SimulatedPosition[];
  getOpenPositions(): SimulatedPosition[];
  getClosedPositions(): SimulatedPosition[];
  getRealizedPnl(): number;
  getUnrealizedPnl(): number;
  getEquity(): number;
  getEquityHistory(): EquitySnapshot[];
}

export interface StrategyLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface StrategyContext {
  dataset: ReplayDataset;
  runtime: ReplayRuntime;
  logger: StrategyLogger;
}

export interface StrategyTick {
  index: number;
  snapshot: MarketDataPoint;
  context: StrategyContext;
}

export interface BacktestStrategy {
  readonly name: string;
  onInit?(context: StrategyContext): Promise<void> | void;
  onTick(params: StrategyTick): Promise<void> | void;
  onComplete?(context: StrategyContext): Promise<void> | void;
}

export interface BacktestStatistics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePct: number;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  averageWinUsd: number;
  averageLossUsd: number;
  profitFactor: number | null;
  sharpeRatio: number | null;
}

export interface BacktestReport {
  strategyName: string;
  dataset: {
    name: string;
    symbol: string;
    timeframeSeconds: number;
    totalPoints: number;
    startTimestamp: number;
    endTimestamp: number;
  };
  initialBalanceUsd: number;
  finalBalanceUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalReturnPct: number;
  equityCurve: EquitySnapshot[];
  trades: TradeRecord[];
  statistics: BacktestStatistics;
}

export interface BacktestEngineOptions extends ReplayEngineConfig {}
