import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { generateTradingSignalTool } from '../tools/generateTradingSignal.js';

export const tradingSignalSkillInputSchema = z.object({
  symbol: z.string().min(1).describe('Asset ticker or pair to analyse, e.g. ETH/USDC or BTC'),
  timeframe: z.string().min(1).describe('Chart timeframe such as 1h, 4h, 1d'),
  candles: z
    .array(
      z.object({
        close: z.number().finite().describe('Closing price for the interval'),
        high: z.number().finite().optional().describe('High price for the interval'),
        low: z.number().finite().optional().describe('Low price for the interval'),
        volume: z.number().finite().nonnegative().optional().describe('Executed volume during interval'),
        timestamp: z.string().describe('ISO timestamp for the candle close'),
      })
    )
    .min(8)
    .describe('Chronological list of market candles – oldest to newest.'),
  riskAppetite: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .describe('User risk appetite guiding guardrail strictness.'),
  narrativeOverride: z
    .object({
      action: z.enum(['buy', 'hold', 'sell']),
      confidence: z.number().min(0).max(1),
      rationale: z.string().min(1),
      constraints: z.array(z.string()).optional(),
    })
    .optional()
    .describe('Optional pre-computed LLM narrative allowing deterministic-only execution.'),
});

export const tradingSignalSkill = defineSkill({
  id: 'trading-signals',
  name: 'AI Trading Signal Orchestrator',
  description:
    'Generates disciplined trading signals by pairing deterministic trend/momentum/risk heuristics with LLM reasoning templates and quantitative guardrails.',
  tags: ['trading', 'signals', 'deterministic', 'risk-management'],
  examples: [
    'Analyse ETH/USDC 1h candles for actionable signal',
    'Provide momentum-aware trade recommendation for BTC daily timeframe',
    'Generate risk-scored signal for SOL/USDT on the 4h chart',
  ],
  inputSchema: tradingSignalSkillInputSchema,
  tools: [generateTradingSignalTool],
});

export type TradingSignalSkillInput = z.infer<typeof tradingSignalSkillInputSchema>;
