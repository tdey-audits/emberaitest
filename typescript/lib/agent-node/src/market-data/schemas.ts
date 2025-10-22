import { z } from 'zod';

/**
 * Oracle price data from external price feeds
 */
export const OraclePriceSchema = z.object({
  symbol: z.string().describe('Trading pair symbol (e.g., ETH-USD)'),
  price: z.string().describe('Price as decimal string for precision'),
  decimals: z.number().int().min(0).describe('Decimal precision'),
  timestamp: z.number().int().describe('Unix timestamp in seconds'),
  source: z.string().describe('Oracle source identifier (e.g., chainlink, pyth)'),
  confidence: z.number().min(0).max(1).optional().describe('Price confidence interval [0,1]'),
});

export type OraclePrice = z.infer<typeof OraclePriceSchema>;

/**
 * GMX market data snapshot
 */
export const GMXMarketDataSchema = z.object({
  marketAddress: z.string().describe('GMX market contract address'),
  symbol: z.string().describe('Market symbol (e.g., ETH-USD)'),
  indexPrice: z.string().describe('Current index price'),
  markPrice: z.string().describe('Current mark price for settlements'),
  longOpenInterest: z.string().describe('Total long open interest in USD'),
  shortOpenInterest: z.string().describe('Total short open interest in USD'),
  fundingRate: z.string().describe('Current funding rate (per hour)'),
  liquidityLong: z.string().describe('Available liquidity for longs'),
  liquidityShort: z.string().describe('Available liquidity for shorts'),
  timestamp: z.number().int().describe('Unix timestamp in seconds'),
});

export type GMXMarketData = z.infer<typeof GMXMarketDataSchema>;

/**
 * Derived metrics calculated from market data
 */
export const DerivedMetricsSchema = z.object({
  symbol: z.string().describe('Trading pair symbol'),
  volatility24h: z.number().describe('24-hour realized volatility (annualized)'),
  volumeWeightedPrice: z.string().describe('Volume-weighted average price'),
  openInterestImbalance: z.number().describe('OI imbalance ratio: (long - short) / (long + short)'),
  fundingRateAnnualized: z.number().describe('Annualized funding rate'),
  liquidityRatio: z.number().describe('Liquidity utilization ratio'),
  priceImpact: z.number().describe('Estimated price impact for standard size'),
  timestamp: z.number().int().describe('Calculation timestamp in seconds'),
});

export type DerivedMetrics = z.infer<typeof DerivedMetricsSchema>;

/**
 * Normalized market state combining all data sources
 */
export const NormalizedMarketStateSchema = z.object({
  symbol: z.string().describe('Trading pair symbol'),
  timestamp: z.number().int().describe('State snapshot timestamp in seconds'),
  price: z.object({
    oracle: z.string().describe('Oracle reference price'),
    index: z.string().describe('GMX index price'),
    mark: z.string().describe('GMX mark price'),
    confidence: z.number().optional().describe('Price confidence from oracle'),
  }),
  openInterest: z.object({
    long: z.string().describe('Long open interest in USD'),
    short: z.string().describe('Short open interest in USD'),
    total: z.string().describe('Total open interest in USD'),
    imbalance: z.number().describe('OI imbalance ratio'),
  }),
  funding: z.object({
    rate: z.string().describe('Current funding rate per hour'),
    rateAnnualized: z.number().describe('Annualized funding rate'),
    nextFundingTime: z.number().int().optional().describe('Next funding timestamp'),
  }),
  liquidity: z.object({
    long: z.string().describe('Available liquidity for longs'),
    short: z.string().describe('Available liquidity for shorts'),
    utilizationRatio: z.number().describe('Liquidity utilization ratio'),
  }),
  volatility: z.object({
    realized24h: z.number().describe('24h realized volatility (annualized)'),
    realized7d: z.number().optional().describe('7d realized volatility (annualized)'),
  }),
  derived: z.object({
    volumeWeightedPrice: z.string().describe('VWAP'),
    priceImpact: z.number().describe('Price impact estimate'),
  }),
});

export type NormalizedMarketState = z.infer<typeof NormalizedMarketStateSchema>;

/**
 * Rolling window configuration
 */
export const WindowConfigSchema = z.object({
  size: z.number().int().positive().describe('Window size in seconds'),
  label: z.string().describe('Human-readable label (e.g., "1h", "4h", "24h")'),
});

export type WindowConfig = z.infer<typeof WindowConfigSchema>;

/**
 * Window analytics result
 */
export const WindowAnalyticsSchema = z.object({
  symbol: z.string().describe('Trading pair symbol'),
  window: WindowConfigSchema,
  startTime: z.number().int().describe('Window start timestamp'),
  endTime: z.number().int().describe('Window end timestamp'),
  dataPoints: z.number().int().describe('Number of data points in window'),
  price: z.object({
    open: z.string().describe('Opening price'),
    high: z.string().describe('Highest price'),
    low: z.string().describe('Lowest price'),
    close: z.string().describe('Closing price'),
    vwap: z.string().describe('Volume-weighted average price'),
  }),
  openInterest: z.object({
    avg: z.string().describe('Average total OI'),
    max: z.string().describe('Maximum total OI'),
    min: z.string().describe('Minimum total OI'),
    change: z.number().describe('OI change percentage'),
  }),
  funding: z.object({
    avg: z.number().describe('Average funding rate'),
    max: z.number().describe('Maximum funding rate'),
    min: z.number().describe('Minimum funding rate'),
    cumulative: z.number().describe('Cumulative funding over window'),
  }),
  volatility: z.object({
    realized: z.number().describe('Realized volatility over window'),
    high: z.number().describe('Highest volatility'),
    low: z.number().describe('Lowest volatility'),
  }),
});

export type WindowAnalytics = z.infer<typeof WindowAnalyticsSchema>;

/**
 * Market data snapshot for persistence and backtesting
 */
export const MarketDataSnapshotSchema = z.object({
  id: z.string().describe('Unique snapshot identifier'),
  timestamp: z.number().int().describe('Snapshot timestamp'),
  markets: z.array(NormalizedMarketStateSchema).describe('Market states'),
  windows: z.record(z.string(), WindowAnalyticsSchema).describe('Window analytics by symbol'),
  metadata: z
    .object({
      version: z.string().describe('Schema version'),
      source: z.string().describe('Data source identifier'),
      processingTime: z.number().describe('Processing duration in ms'),
    })
    .optional(),
});

export type MarketDataSnapshot = z.infer<typeof MarketDataSnapshotSchema>;
