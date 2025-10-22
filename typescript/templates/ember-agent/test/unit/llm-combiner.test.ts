import { describe, it, expect } from 'vitest';
import { combineWithLlm, generateDeterministicSignal } from '../../src/strategies/index.js';
import { createStrategyPrompts } from '../../src/prompts/tradingStrategy.js';
import { bullishBreakoutScenario, bearishReversalScenario } from '../fixtures/market-scenarios.js';

describe('combineWithLlm', () => {
  it('honours aligned bullish narrative when risk permits', () => {
    const deterministic = generateDeterministicSignal(bullishBreakoutScenario, { riskAppetite: 'medium' });
    const prompts = createStrategyPrompts(bullishBreakoutScenario, deterministic);

    const result = combineWithLlm({
      symbol: bullishBreakoutScenario.symbol,
      timeframe: bullishBreakoutScenario.timeframe,
      deterministic,
      recommendation: {
        action: 'buy',
        confidence: 0.82,
        rationale: 'Momentum and risk overlay validate continuation breakout.',
      },
      prompts,
    });

    expect(result.finalAction).toBe('buy');
    expect(result.finalConfidence).toBeGreaterThan(0.6);
    expect(result.guardrails.some(guard => guard.level === 'critical')).toBeFalsy();
  });

  it('downgrades conflicting LLM enthusiasm to neutral action', () => {
    const deterministic = generateDeterministicSignal(bearishReversalScenario, { riskAppetite: 'medium' });
    const prompts = createStrategyPrompts(bearishReversalScenario, deterministic);

    const result = combineWithLlm({
      symbol: bearishReversalScenario.symbol,
      timeframe: bearishReversalScenario.timeframe,
      deterministic,
      recommendation: {
        action: 'buy',
        confidence: 0.9,
        rationale: 'Hypothetical catalyst suggests near-term bounce.',
        constraints: ['Wait for reclaim of prior swing high'],
      },
      prompts,
    });

    expect(result.finalAction).toBe('hold');
    expect(result.guardrails.some(guard => guard.id === 'guard:llm-deterministic-disagreement')).toBeTruthy();
    expect(result.finalConfidence).toBeLessThanOrEqual(0.65);
  });
});
