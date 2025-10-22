import { z } from 'zod';
import { streamText } from 'ai';
import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { EmberContext } from '../context/types.js';
import {
  defaultStrategyConfig,
  generateDeterministicSignal,
  combineWithLlm,
  llmRecommendationSchema,
  type DeterministicSignal,
  type LlmRecommendation,
  type MarketCandle,
  type MarketData,
  type RiskAppetite,
  type TradingSignalOutput,
} from '../strategies/index.js';
import { createStrategyPrompts } from '../prompts/tradingStrategy.js';

const candleSchema = z.object({
  close: z.number().finite(),
  high: z.number().finite().optional(),
  low: z.number().finite().optional(),
  volume: z.number().finite().nonnegative().optional(),
  timestamp: z.string().min(1),
});

const generateTradingSignalParameters = z.object({
  symbol: z.string().min(1),
  timeframe: z.string().min(1),
  candles: z.array(candleSchema).min(defaultStrategyConfig.minSamples),
  riskAppetite: z.enum(['low', 'medium', 'high']).optional(),
  narrativeOverride: llmRecommendationSchema.optional(),
});

type GenerateTradingSignalParams = z.infer<typeof generateTradingSignalParameters>;

function normaliseCandles(candles: MarketCandle[]): MarketCandle[] {
  return [...candles].sort((a, b) => {
    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);
    return aTime - bTime;
  });
}

async function requestLlmRecommendation(
  prompts: ReturnType<typeof createStrategyPrompts>,
  context: EmberContext,
): Promise<LlmRecommendation | null> {
  try {
    const { textStream } = await streamText({
      model: context.llmModel,
      system: prompts.systemPrompt,
      prompt: `${prompts.marketAssessment}\n\n${prompts.scoring}\n\n${prompts.actionSelection}`,
      temperature: 0.35,
      maxTokens: 350,
    });

    let raw = '';
    for await (const chunk of textStream) {
      raw += chunk;
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const payload = jsonMatch ? jsonMatch[0] : raw.trim();
    const parsed = llmRecommendationSchema.safeParse(JSON.parse(payload));

    if (!parsed.success) {
      console.warn('[TradingSignals] LLM response failed schema validation:', parsed.error.issues);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn('[TradingSignals] Failed to obtain LLM recommendation:', error);
    return null;
  }
}

function buildFallbackRecommendation(deterministic: DeterministicSignal): LlmRecommendation {
  return {
    action: deterministic.baseAction,
    confidence: 0.4,
    rationale: 'LLM recommendation unavailable. Defaulting to deterministic base plan with reduced confidence.',
    constraints: ['Re-run signal once model access is restored'],
  };
}

function buildSuccessTask(
  result: TradingSignalOutput,
  context: EmberContext,
): Task {
  const payload = {
    symbol: result.symbol,
    timeframe: result.timeframe,
    finalAction: result.finalAction,
    finalConfidence: Number(result.finalConfidence.toFixed(2)),
    guardrails: result.guardrails,
    deterministic: {
      aggregateScore: Number(result.deterministic.aggregateScore.toFixed(3)),
      baseAction: result.deterministic.baseAction,
      trend: result.deterministic.trend,
      momentum: result.deterministic.momentum,
      risk: result.deterministic.risk,
    },
    llmRecommendation: result.llmRecommendation,
    prompts: result.prompts,
    reasoning: result.reasoningChain,
  };

  return {
    id: `${result.symbol}-${Date.now()}`,
    contextId: `trading-signal-${Date.now()}`,
    kind: 'task',
    status: {
      state: TaskState.Completed,
      message: {
        role: 'agent',
        messageId: `msg-${Date.now()}`,
        kind: 'message',
        parts: [
          {
            kind: 'text',
            text: `Final trading signal for ${result.symbol} (${result.timeframe}): ${result.finalAction.toUpperCase()} @ ${Math.round(result.finalConfidence * 100)}% confidence.\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
    },
  };
}

export const generateTradingSignalTool: VibkitToolDefinition<
  typeof generateTradingSignalParameters,
  Task,
  EmberContext
> = {
  name: 'generate-trading-signal',
  description: 'Generate a trading signal combining deterministic heuristics with LLM reasoning guardrails.',
  parameters: generateTradingSignalParameters,
  execute: async (args, context) => {
    const params = generateTradingSignalParameters.parse(args);
    const candles = normaliseCandles(params.candles);

    const marketData: MarketData = {
      symbol: params.symbol,
      timeframe: params.timeframe,
      candles,
    };

    const deterministic = generateDeterministicSignal(marketData, {
      riskAppetite: params.riskAppetite as RiskAppetite | undefined,
    });

    const prompts = createStrategyPrompts(marketData, deterministic);

    let recommendation: LlmRecommendation | null = params.narrativeOverride ?? null;
    if (!recommendation) {
      recommendation = await requestLlmRecommendation(prompts, context);
    }
    if (!recommendation) {
      recommendation = buildFallbackRecommendation(deterministic);
    }

    const combined = combineWithLlm({
      symbol: params.symbol,
      timeframe: params.timeframe,
      deterministic,
      recommendation,
      prompts,
    });

    return buildSuccessTask(combined, context);
  },
};
