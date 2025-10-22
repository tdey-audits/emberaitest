import type { MarketCandle, MarketData } from '../../src/strategies/index.js';

const baseTimestamps = (count: number): string[] => {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => new Date(now - (count - index) * 60_000).toISOString());
};

function buildCandles(closes: number[], volumes: number[]): MarketCandle[] {
  const timestamps = baseTimestamps(closes.length);
  return closes.map((close, index) => ({
    close,
    high: close * 1.01,
    low: close * 0.99,
    volume: volumes[index] ?? volumes[volumes.length - 1] ?? 0,
    timestamp: timestamps[index]!,
  }));
}

export const bullishBreakoutScenario: MarketData = {
  symbol: 'ETH/USDC',
  timeframe: '1h',
  candles: buildCandles(
    [2485, 2496, 2512, 2531, 2558, 2584, 2620, 2655, 2688, 2725, 2750, 2785],
    [1200, 1250, 1280, 1300, 1400, 1500, 1650, 1800, 1850, 1900, 2100, 2300],
  ),
};

export const bearishReversalScenario: MarketData = {
  symbol: 'BTC/USDT',
  timeframe: '4h',
  candles: buildCandles(
    [71_200, 70_950, 70_600, 69_980, 69_100, 68_450, 67_780, 66_900, 65_850, 65_120, 64_400, 63_750],
    [3200, 3100, 3150, 3250, 3350, 3450, 3520, 3600, 3700, 3800, 3850, 3920],
  ),
};

export const volatileSidewaysScenario: MarketData = {
  symbol: 'SOL/USDT',
  timeframe: '30m',
  candles: buildCandles(
    [182.4, 183.2, 181.6, 183.9, 182.7, 184.1, 181.9, 183.4, 182.6, 184.5, 181.8, 183.1],
    [980, 995, 1005, 990, 1010, 995, 1000, 985, 990, 1005, 1000, 990],
  ),
};
