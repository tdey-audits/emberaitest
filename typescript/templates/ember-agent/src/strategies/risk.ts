import { defaultStrategyConfig } from './types.js';
import type { Guardrail, MarketData, RiskResult, RiskAppetite, StrategyTuningConfig } from './types.js';

function computeReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1]!;
    const current = closes[index]!;
    if (previous === 0) {
      returns.push(0);
    } else {
      returns.push((current - previous) / previous);
    }
  }
  return returns;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeMaxDrawdown(closes: number[]): number {
  let maxClose = closes[0] ?? 0;
  let maxDrawdown = 0;
  for (const close of closes) {
    if (close > maxClose) {
      maxClose = close;
    }
    if (maxClose > 0) {
      const drawdown = (maxClose - close) / maxClose;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }
  return maxDrawdown;
}

function computeValueAtRisk(returns: number[], percentile = 0.05): number {
  if (returns.length === 0) {
    return 0;
  }
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(percentile * sorted.length)));
  return sorted[index] ?? 0;
}

export function evaluateRisk(
  data: MarketData,
  appetite: RiskAppetite = 'medium',
  config: StrategyTuningConfig = defaultStrategyConfig,
): RiskResult {
  const closes = data.candles
    .slice(-Math.max(config.riskVolatilityWindow + 1, config.minSamples))
    .map(candle => candle.close);

  if (closes.length < config.minSamples) {
    return {
      score: 0,
      volatility: 0,
      maxDrawdown: 0,
      valueAtRisk: 0,
      label: 'elevated',
      details: 'Insufficient samples to reliably estimate risk. Defaulting to elevated.',
      triggeredGuards: [
        {
          id: 'risk:insufficient-samples',
          level: 'caution',
          message: 'Unable to compute volatility or drawdown with limited history. Advise conservative positioning.',
        },
      ],
    };
  }

  const returns = computeReturns(closes);
  const volatility = standardDeviation(returns);
  const annualisedVolatility = volatility * Math.sqrt(Math.max(1, returns.length));
  const maxDrawdown = computeMaxDrawdown(closes);
  const valueAtRisk = computeValueAtRisk(returns);

  const guards: Guardrail[] = [];

  if (maxDrawdown >= config.guardrailThresholds.drawdownCritical) {
    guards.push({
      id: 'risk:drawdown-critical',
      level: 'critical',
      message: `Drawdown of ${(maxDrawdown * 100).toFixed(1)}% breaches critical threshold of ${(config.guardrailThresholds.drawdownCritical * 100).toFixed(1)}%.`,
    });
  } else if (maxDrawdown >= config.guardrailThresholds.drawdownCaution) {
    guards.push({
      id: 'risk:drawdown-caution',
      level: 'caution',
      message: `Drawdown of ${(maxDrawdown * 100).toFixed(1)}% exceeds caution threshold of ${(config.guardrailThresholds.drawdownCaution * 100).toFixed(1)}%.`,
    });
  }

  if (annualisedVolatility >= config.guardrailThresholds.volatilityCritical) {
    guards.push({
      id: 'risk:volatility-critical',
      level: 'critical',
      message: `Annualised volatility ${(annualisedVolatility * 100).toFixed(1)}% is above critical limit ${(config.guardrailThresholds.volatilityCritical * 100).toFixed(1)}%.`,
    });
  } else if (annualisedVolatility >= config.guardrailThresholds.volatilityCaution) {
    guards.push({
      id: 'risk:volatility-caution',
      level: 'caution',
      message: `Annualised volatility ${(annualisedVolatility * 100).toFixed(1)}% is above caution limit ${(config.guardrailThresholds.volatilityCaution * 100).toFixed(1)}%.`,
    });
  }

  const varPenalty = valueAtRisk < 0 ? Math.min(1, Math.abs(valueAtRisk) * 10) : 0;
  const volatilityPenalty = Math.min(1, annualisedVolatility / config.guardrailThresholds.volatilityCritical);
  const drawdownPenalty = Math.min(1, maxDrawdown / config.guardrailThresholds.drawdownCritical);

  const appetitePenalty = config.riskPenalty[appetite];
  const baseScore = 1 - (volatilityPenalty * 0.5 + drawdownPenalty * 0.35 + varPenalty * 0.15);
  const score = Math.max(-1, Math.min(1, baseScore - appetitePenalty));

  let label: RiskResult['label'] = 'low';
  if (volatilityPenalty > 0.7 || drawdownPenalty > 0.7) {
    label = 'high';
  } else if (volatilityPenalty > 0.4 || drawdownPenalty > 0.4) {
    label = 'elevated';
  }

  const details = `Volatility ${(annualisedVolatility * 100).toFixed(2)}%, max drawdown ${(maxDrawdown * 100).toFixed(2)}%, VaR ${(valueAtRisk * 100).toFixed(2)}%.`;

  return {
    score,
    volatility: annualisedVolatility,
    maxDrawdown,
    valueAtRisk,
    label,
    details,
    triggeredGuards: guards,
  };
}
