import { describe, it, expect } from 'vitest';
import { generateDeterministicSignal } from '../../src/strategies/index.js';
import {
  bullishBreakoutScenario,
  bearishReversalScenario,
  volatileSidewaysScenario,
} from '../fixtures/market-scenarios.js';

describe('generateDeterministicSignal', () => {
  it('detects bullish breakout structure with supportive risk', () => {
    const signal = generateDeterministicSignal(bullishBreakoutScenario, { riskAppetite: 'medium' });

    expect(signal.trend.label).toBe('bullish');
    expect(signal.momentum.label).toBe('expanding');
    expect(signal.risk.label).toBe('low');
    expect(signal.baseAction).toBe('buy');
    expect(signal.aggregateScore).toBeGreaterThan(0.35);
  });

  it('flags sustained bearish reversal and recommends selling', () => {
    const signal = generateDeterministicSignal(bearishReversalScenario, { riskAppetite: 'medium' });

    expect(signal.trend.label).toBe('bearish');
    expect(signal.momentum.label).toBe('contracting');
    expect(signal.baseAction).toBe('sell');
    expect(signal.aggregateScore).toBeLessThan(-0.35);
  });

  it('keeps neutral stance when volatility undermines conviction', () => {
    const signal = generateDeterministicSignal(volatileSidewaysScenario, { riskAppetite: 'low' });

    expect(signal.baseAction).toBe('hold');
    expect(signal.aggregateScore).toBeGreaterThan(-0.35);
    expect(signal.aggregateScore).toBeLessThan(0.35);
  });
});
