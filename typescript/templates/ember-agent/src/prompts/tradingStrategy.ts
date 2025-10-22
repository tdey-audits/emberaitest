import { strategyConfigDocumentation } from '../strategies/types.js';
import type { DeterministicSignal, MarketData, StrategyPrompts } from '../strategies/types.js';

function summariseRecentPrices(data: MarketData, lookback = 5): string {
  const recent = data.candles.slice(-lookback);
  if (recent.length === 0) {
    return 'No recent price data available.';
  }
  const formatted = recent
    .map(candle => `${candle.timestamp}: ${candle.close.toFixed(2)}`)
    .join(' | ');
  return `Recent closes (${lookback}): ${formatted}`;
}

function summariseVolume(data: MarketData, lookback = 5): string {
  const recent = data.candles.slice(-lookback);
  if (recent.length === 0) {
    return 'No recent volume data available.';
  }
  const averageVolume =
    recent.reduce((accumulator, candle) => accumulator + (candle.volume ?? 0), 0) /
    recent.length;
  return `Average volume (${lookback}) ${averageVolume.toFixed(2)} | Latest volume ${(recent[recent.length - 1]?.volume ?? 0).toFixed(2)}`;
}

function buildSystemPrompt(symbol: string, timeframe: string): string {
  const keyDocs = strategyConfigDocumentation
    .slice(0, 5)
    .map(entry => `- ${entry.key}: ${entry.description}`)
    .join('\n');

  return `You are an institutional trading strategy assistant. Analyse ${symbol} on the ${timeframe} timeframe.
Focus on disciplined execution:
- Respect deterministic guardrails (trend, momentum, risk)
- Output actionable JSON only when instructed
- When guardrails conflict, default to HOLD and explain why

Strategy configuration reference:
${keyDocs}`;
}

function buildMarketAssessmentPrompt(
  data: MarketData,
  deterministic: DeterministicSignal,
): string {
  return `### Market Assessment Task
1. Review deterministic summaries
   - Trend: ${deterministic.trend.details}
   - Momentum: ${deterministic.momentum.details}
   - Risk: ${deterministic.risk.details}
2. Inspect recent candles
   ${summariseRecentPrices(data)}
3. Inspect liquidity context
   ${summariseVolume(data)}
4. Identify catalysts or anomalies worth highlighting.`;
}

function buildScoringPrompt(deterministic: DeterministicSignal): string {
  const guardMessages = deterministic.guardrails.map(guard => `- (${guard.level}) ${guard.message}`).join('\n') || '- None triggered';

  return `### Signal Scoring Task
- Deterministic aggregate score: ${deterministic.aggregateScore.toFixed(2)} (base action ${deterministic.baseAction.toUpperCase()})
- Guardrails:
${guardMessages}

Rules:
- If any CRITICAL guard is active, final recommendation must not be BUY.
- If trend and momentum disagree, confidence must be below 0.65.
- Explicitly mention which guardrails impacted confidence.`;
}

function buildActionRecommendationPrompt(deterministic: DeterministicSignal): string {
  return `### Action Recommendation Task
Produce a JSON object with the following shape:
{
  "action": "buy" | "sell" | "hold",
  "confidence": number between 0 and 1,
  "rationale": "Concise narrative explaining alignment between deterministic signal and qualitative modifiers",
  "constraints": ["Optional execution guardrails like wait-for-retake" ]
}

Constraints:
- Confidence cannot exceed 0.65 if base action is HOLD.
- SELL recommendations require mentioning primary risk trigger.
- BUY requires confirmation that no critical guard is active.`;
}

export function createStrategyPrompts(
  data: MarketData,
  deterministic: DeterministicSignal,
): StrategyPrompts {
  return {
    systemPrompt: buildSystemPrompt(data.symbol, data.timeframe),
    marketAssessment: buildMarketAssessmentPrompt(data, deterministic),
    scoring: buildScoringPrompt(deterministic),
    actionSelection: buildActionRecommendationPrompt(deterministic),
  };
}
