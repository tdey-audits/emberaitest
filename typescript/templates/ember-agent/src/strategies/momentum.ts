import { defaultStrategyConfig } from './types.js';
import type { MarketData, MomentumResult, StrategyTuningConfig } from './types.js';

function computeRateOfChange(values: number[], window: number): number {
  if (values.length <= window) {
    return 0;
  }
  const latest = values[values.length - 1]!;
  const reference = values[values.length - 1 - window]!;
  return reference === 0 ? 0 : (latest - reference) / reference;
}

function computeRsi(values: number[], period: number): number {
  if (values.length < period + 1) {
    return 50;
  }

  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const change = values[index]! - values[index - 1]!;
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  if (losses === 0) {
    return 100;
  }
  if (gains === 0) {
    return 0;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function computeAcceleration(values: number[]): number {
  if (values.length < 3) {
    return 0;
  }
  const latestChange = values[values.length - 1]! - values[values.length - 2]!;
  const previousChange = values[values.length - 2]! - values[values.length - 3]!;
  if (previousChange === 0) {
    return latestChange >= 0 ? latestChange : -Math.abs(latestChange);
  }
  return latestChange - previousChange;
}

export function evaluateMomentum(
  data: MarketData,
  config: StrategyTuningConfig = defaultStrategyConfig,
): MomentumResult {
  const closes = data.candles.map(candle => candle.close);
  if (closes.length < config.minSamples) {
    const lastClose = closes[closes.length - 1] ?? 0;
    return {
      score: 0,
      rateOfChange: 0,
      recentAcceleration: 0,
      rsi: 50,
      label: 'stable',
      details: `Insufficient samples for momentum window. Latest close ${lastClose.toFixed(2)}.`,
    };
  }

  const rateOfChange = computeRateOfChange(closes, config.momentumWindow);
  const rsi = computeRsi(closes, config.rsiWindow);
  const acceleration = computeAcceleration(closes.slice(-config.momentumWindow - 1));

  const rocScore = Math.max(-1, Math.min(1, rateOfChange * 4));
  const rsiScore = Math.max(-1, Math.min(1, (rsi - 50) / 25));
  const accelerationScore = Math.max(-1, Math.min(1, acceleration / (closes[closes.length - 2] || 1) * 20));

  const compositeScore = (rocScore * 0.5 + rsiScore * 0.3 + accelerationScore * 0.2);

  let label: MomentumResult['label'] = 'stable';
  if (compositeScore > 0.2) {
    label = 'expanding';
  } else if (compositeScore < -0.2) {
    label = 'contracting';
  }

  const details = `RoC ${(rateOfChange * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}, acceleration ${acceleration.toFixed(4)}.`;

  return {
    score: Math.max(-1, Math.min(1, compositeScore)),
    rateOfChange,
    recentAcceleration: acceleration,
    rsi,
    label,
    details,
  };
}
