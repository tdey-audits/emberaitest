import { defaultStrategyConfig } from './types.js';
import type { MarketData, StrategyTuningConfig, TrendResult } from './types.js';

function computeAverage(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function linearRegression(values: number[]): { slope: number; rSquared: number } {
  const n = values.length;
  const xValues = Array.from({ length: n }, (_, index) => index + 1);
  const xMean = computeAverage(xValues);
  const yMean = computeAverage(values);

  let numerator = 0;
  let denominator = 0;
  let totalSumSquares = 0;
  let residualSumSquares = 0;

  for (let index = 0; index < n; index += 1) {
    const xDiff = xValues[index]! - xMean;
    const yDiff = values[index]! - yMean;
    numerator += xDiff * yDiff;
    denominator += xDiff * xDiff;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;

  for (let index = 0; index < n; index += 1) {
    const predicted = yMean + slope * (xValues[index]! - xMean);
    totalSumSquares += (values[index]! - yMean) ** 2;
    residualSumSquares += (values[index]! - predicted) ** 2;
  }

  const rSquared = totalSumSquares === 0 ? 0 : 1 - residualSumSquares / totalSumSquares;

  return { slope, rSquared: Math.max(0, Math.min(1, rSquared)) };
}

export function evaluateTrend(
  data: MarketData,
  config: StrategyTuningConfig = defaultStrategyConfig,
): TrendResult {
  const candles = data.candles.slice(-config.longWindow);
  if (candles.length < config.shortWindow || candles.length < config.minSamples) {
    const latestClose = data.candles[data.candles.length - 1]?.close ?? 0;
    return {
      score: 0,
      slope: 0,
      shortTermAverage: latestClose,
      longTermAverage: latestClose,
      label: 'neutral',
      goodnessOfFit: 0,
      details: 'Insufficient data to evaluate trend. Returning neutral stance.',
    };
  }

  const closes = candles.map(candle => candle.close);
  const shortWindowValues = closes.slice(-config.shortWindow);
  const longWindowValues = closes.slice(-config.longWindow);

  const shortTermAverage = computeAverage(shortWindowValues);
  const longTermAverage = computeAverage(longWindowValues);
  const diffRatio = longTermAverage === 0 ? 0 : (shortTermAverage - longTermAverage) / longTermAverage;

  const { slope, rSquared } = linearRegression(longWindowValues);
  const slopeNormalised = longTermAverage === 0 ? 0 : slope / longTermAverage;

  const rawScore = diffRatio * 0.6 + slopeNormalised * 0.4 * config.shortWindow;
  const score = Math.max(-1, Math.min(1, rawScore * 3));

  let label: TrendResult['label'] = 'neutral';
  if (score > 0.25) {
    label = 'bullish';
  } else if (score < -0.25) {
    label = 'bearish';
  }

  const details = `Short-term average ${shortTermAverage.toFixed(2)}, long-term average ${longTermAverage.toFixed(2)}, slope ${slope.toExponential(2)}, R² ${rSquared.toFixed(2)}.`;

  return {
    score,
    slope,
    shortTermAverage,
    longTermAverage,
    label,
    goodnessOfFit: rSquared,
    details,
  };
}
