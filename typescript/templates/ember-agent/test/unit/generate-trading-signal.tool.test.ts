import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateTradingSignalTool } from '../../src/tools/generateTradingSignal.js';
import { bullishBreakoutScenario } from '../fixtures/market-scenarios.js';
import type { EmberContext } from '../../src/context/types.js';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

function createContext(): EmberContext {
  return {
    mcpClient: null,
    tokenMap: {},
    llmModel: {} as any,
    config: {
      arbitrumRpcUrl: 'https://arb.rpc',
      emberMcpServerUrl: 'https://mcp.example',
      enableCaching: false,
    },
    metadata: {
      loadedAt: new Date(),
      mcpConnected: false,
      tokenCount: 0,
      availableSkills: ['trading-signals'],
      environment: 'test',
    },
  };
}

function buildParams() {
  return {
    symbol: bullishBreakoutScenario.symbol,
    timeframe: bullishBreakoutScenario.timeframe,
    candles: bullishBreakoutScenario.candles,
  };
}

describe('generateTradingSignalTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns completed task when LLM provides valid recommendation', async () => {
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockResolvedValueOnce({
      textStream: (async function* () {
        yield '{"action":"buy","confidence":0.78,"rationale":"Breakout continuation with contained risk"}';
      })(),
    } as any);

    const task = await generateTradingSignalTool.execute(buildParams(), createContext());

    expect(task.status.state).toBe(TaskState.Completed);
    const messageText = task.status.message?.parts?.[0]?.text ?? '';
    expect(messageText).toContain('BUY');
    expect(messageText).toContain('0.78');
  });

  it('falls back to deterministic recommendation when LLM fails', async () => {
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockRejectedValueOnce(new Error('provider unavailable'));

    const task = await generateTradingSignalTool.execute(buildParams(), createContext());

    const messageText = task.status.message?.parts?.[0]?.text ?? '';
    expect(messageText).toContain('Re-run signal once model access is restored');
    expect(messageText).toContain('HOLD');
  });

  it('supports deterministic-only execution through narrative override', async () => {
    const { streamText } = await import('ai');
    vi.mocked(streamText).mockClear();

    const task = await generateTradingSignalTool.execute(
      {
        ...buildParams(),
        narrativeOverride: {
          action: 'sell',
          confidence: 0.52,
          rationale: 'User supplied override',
        },
      },
      createContext(),
    );

    expect(streamText).not.toHaveBeenCalled();
    const messageText = task.status.message?.parts?.[0]?.text ?? '';
    expect(messageText).toContain('SELL');
  });
});
