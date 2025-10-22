import { defaultStrategyConfig } from './types.js';
import type {
  DeterministicSignal,
  Guardrail,
  MarketData,
  RiskAppetite,
  StrategyTuningConfig,
  TradingAction,
} from './types.js';
import { evaluateTrend } from './trend.js';
import { evaluateMomentum } from './momentum.js';
import { evaluateRisk } from './risk.js';

export interface DeterministicSignalOptions {
  riskAppetite?: RiskAppetite;
  config?: StrategyTuningConfig;
}

function resolveAction(score: number): TradingAction {
  if (score > 0.35) {
    return 'buy';
  }
  if (score < -0.35) {
    return 'sell';
  }
  return 'hold';
}

export function generateDeterministicSignal(
  data: MarketData,
  options: DeterministicSignalOptions = {},
): DeterministicSignal {
  const config = options.config ?? defaultStrategyConfig;
  const appetite = options.riskAppetite ?? 'medium';

  const trend = evaluateTrend(data, config);
  const momentum = evaluateMomentum(data, config);
  const risk = evaluateRisk(data, appetite, config);

  const riskAdjustment = (risk.score + 1) / 2 - 0.5; // normalise to [-0.5, 0.5]
  const aggregateScore = Math.max(
    -1,
    Math.min(1, trend.score * 0.45 + momentum.score * 0.35 + riskAdjustment * 0.4),
  );

  let baseAction = resolveAction(aggregateScore);
  const guardrails: Guardrail[] = [...risk.triggeredGuards];

  const trendMomentumDivergence = Math.abs(trend.score - momentum.score);
  if (trendMomentumDivergence >= config.guardrailThresholds.momentumFlip) {
    guardrails.push({
      id: 'guard:trend-momentum-divergence',
      level: 'caution',
      message:
        'Trend and momentum signals diverge materially. Neutral positioning preferred until signals align.',
    });
  }

  if (risk.label === 'high' && baseAction === 'buy') {
    guardrails.push({
      id: 'guard:risk-overrides-buy',
      level: 'critical',
      message: 'High risk conditions prevent long positioning despite bullish signals.',
    });
    baseAction = 'hold';
  }

  const hasCriticalGuard = guardrails.some(guard => guard.level === 'critical');
  if (hasCriticalGuard && baseAction === 'buy') {
    baseAction = 'hold';
  }

  if (aggregateScore > 0 && guardrails.some(guard => guard.id === 'guard:trend-momentum-divergence')) {
    baseAction = 'hold';
  }

  if (aggregateScore < 0 && risk.triggeredGuards.some(guard => guard.level === 'critical')) {
    baseAction = 'sell';
  }

  return {
    trend,
    momentum,
    risk,
    aggregateScore,
    baseAction,
    guardrails,
    configUsed: config,
  };
}
