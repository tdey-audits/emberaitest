import { z } from 'zod';
import type {
  DeterministicSignal,
  Guardrail,
  LlmRecommendation,
  StrategyPrompts,
  StrategyTuningConfig,
  TradingAction,
  TradingSignalOutput,
} from './types.js';
import { defaultStrategyConfig } from './types.js';

export const llmRecommendationSchema = z.object({
  action: z.enum(['buy', 'hold', 'sell']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  constraints: z.array(z.string().min(1)).optional(),
});

export function parseLlmRecommendation(payload: string): LlmRecommendation | null {
  try {
    const parsed = JSON.parse(payload);
    const result = llmRecommendationSchema.parse(parsed);
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.warn('[TradingSignals] Failed to validate LLM recommendation:', error.issues);
      return null;
    }
    console.warn('[TradingSignals] Unable to parse LLM recommendation payload:', error);
    return null;
  }
}

const actionWeights: Record<TradingAction, number> = {
  buy: 1,
  hold: 0,
  sell: -1,
};

function resolveAction(score: number): TradingAction {
  if (score > 0.35) {
    return 'buy';
  }
  if (score < -0.35) {
    return 'sell';
  }
  return 'hold';
}

const severityRank: Record<Guardrail['level'], number> = {
  info: 0,
  caution: 1,
  critical: 2,
};

export interface CombineWithLlmOptions {
  symbol: string;
  timeframe: string;
  deterministic: DeterministicSignal;
  recommendation: LlmRecommendation;
  prompts: StrategyPrompts;
  config?: StrategyTuningConfig;
}

export function combineWithLlm(options: CombineWithLlmOptions): TradingSignalOutput {
  const { symbol, timeframe, deterministic, recommendation, prompts } = options;
  const config = options.config ?? defaultStrategyConfig;

  const deterministicScore = Math.max(-1, Math.min(1, deterministic.aggregateScore));
  const llmDirectional = actionWeights[recommendation.action];
  const llmScore = llmDirectional * (0.5 + recommendation.confidence * 0.5);
  const combinedScore = Math.max(-1, Math.min(1, deterministicScore * 0.65 + llmScore * 0.35));

  let finalAction = resolveAction(combinedScore);

  const guardMap = new Map<string, Guardrail>();
  const applyGuard = (guard: Guardrail) => {
    const existing = guardMap.get(guard.id);
    if (!existing || severityRank[guard.level] > severityRank[existing.level]) {
      guardMap.set(guard.id, guard);
    }
  };

  for (const guard of deterministic.guardrails) {
    applyGuard(guard);
  }

  const disagreementMagnitude = Math.abs(actionWeights[deterministic.baseAction] - actionWeights[recommendation.action]);
  if (disagreementMagnitude >= 1) {
    applyGuard({
      id: 'guard:llm-deterministic-disagreement',
      level: 'caution',
      message: 'LLM recommendation diverges from quantitative base plan. Prioritising guardrails.',
    });
  }

  if (recommendation.constraints && recommendation.constraints.length > 0) {
    applyGuard({
      id: 'guard:llm-constraints',
      level: 'info',
      message: recommendation.constraints.join(' | '),
    });
  }

  const guardrails = Array.from(guardMap.values());
  const hasCriticalGuard = guardrails.some(guard => guard.level === 'critical');
  if (hasCriticalGuard && finalAction === 'buy') {
    finalAction = 'hold';
  }

  if (
    disagreementMagnitude >= config.guardrailThresholds.momentumFlip &&
    finalAction === recommendation.action
  ) {
    finalAction = 'hold';
  }

  const deterministicConfidence = Math.min(1, Math.abs(deterministicScore));
  let finalConfidence = Math.min(
    1,
    (deterministicConfidence * 0.5 + recommendation.confidence * 0.5) *
      (hasCriticalGuard ? 0.7 : 1),
  );

  if (finalAction === 'hold') {
    finalConfidence = Math.min(finalConfidence, 0.65);
  }

  const reasoningChain = [
    {
      id: 'trend-assessment',
      title: 'Trend structure',
      content: deterministic.trend.details,
      category: 'analysis' as const,
      severity: deterministic.trend.label === 'neutral' ? 'info' : undefined,
    },
    {
      id: 'momentum-assessment',
      title: 'Momentum balance',
      content: deterministic.momentum.details,
      category: 'analysis' as const,
      severity: deterministic.momentum.label === 'stable' ? 'info' : undefined,
    },
    {
      id: 'risk-scan',
      title: 'Risk diagnostics',
      content: deterministic.risk.details,
      category: 'risk' as const,
      severity: deterministic.risk.triggeredGuards.some(guard => guard.level === 'critical')
        ? 'critical'
        : deterministic.risk.triggeredGuards.some(guard => guard.level === 'caution')
          ? 'caution'
          : 'info',
    },
    {
      id: 'llm-perspective',
      title: 'LLM narrative overlay',
      content: recommendation.rationale,
      category: 'narrative' as const,
      severity: disagreementMagnitude >= 1 ? 'caution' : 'info',
    },
    {
      id: 'final-decision',
      title: 'Coordinated action',
      content: `Final directive: ${finalAction.toUpperCase()} with ${Math.round(finalConfidence * 100)}% confidence. Quantitative base action was ${deterministic.baseAction.toUpperCase()} and LLM suggested ${recommendation.action.toUpperCase()}.`,
      category: 'decision' as const,
      severity: hasCriticalGuard ? 'caution' : 'info',
    },
  ];

  return {
    symbol,
    timeframe,
    deterministic,
    llmRecommendation: recommendation,
    finalAction,
    finalConfidence,
    guardrails,
    reasoningChain,
    prompts,
  };
}
