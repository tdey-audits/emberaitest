export type RiskAppetite = 'low' | 'medium' | 'high';

export interface MarketCandle {
  close: number;
  high?: number;
  low?: number;
  volume?: number;
  timestamp: string;
}

export interface MarketData {
  symbol: string;
  timeframe: string;
  candles: MarketCandle[];
}

export type TradingAction = 'buy' | 'hold' | 'sell';

export interface Guardrail {
  id: string;
  level: 'info' | 'caution' | 'critical';
  message: string;
}

export interface TrendResult {
  score: number;
  slope: number;
  shortTermAverage: number;
  longTermAverage: number;
  label: 'bullish' | 'bearish' | 'neutral';
  goodnessOfFit: number;
  details: string;
}

export interface MomentumResult {
  score: number;
  rateOfChange: number;
  recentAcceleration: number;
  rsi: number;
  label: 'expanding' | 'contracting' | 'stable';
  details: string;
}

export interface RiskResult {
  score: number;
  volatility: number;
  maxDrawdown: number;
  valueAtRisk: number;
  label: 'low' | 'elevated' | 'high';
  details: string;
  triggeredGuards: Guardrail[];
}

export interface DeterministicSignal {
  trend: TrendResult;
  momentum: MomentumResult;
  risk: RiskResult;
  aggregateScore: number;
  baseAction: TradingAction;
  guardrails: Guardrail[];
  configUsed: StrategyTuningConfig;
}

export interface ReasoningStep {
  id: string;
  title: string;
  content: string;
  category: 'analysis' | 'risk' | 'narrative' | 'decision';
  severity?: 'info' | 'caution' | 'critical';
}

export interface StrategyPrompts {
  systemPrompt: string;
  marketAssessment: string;
  scoring: string;
  actionSelection: string;
}

export interface LlmRecommendation {
  action: TradingAction;
  confidence: number;
  rationale: string;
  constraints?: string[];
}

export interface TradingSignalOutput {
  symbol: string;
  timeframe: string;
  deterministic: DeterministicSignal;
  llmRecommendation: LlmRecommendation;
  finalAction: TradingAction;
  finalConfidence: number;
  guardrails: Guardrail[];
  reasoningChain: ReasoningStep[];
  prompts: StrategyPrompts;
}

export interface StrategyTuningConfig {
  shortWindow: number;
  longWindow: number;
  momentumWindow: number;
  rsiWindow: number;
  riskVolatilityWindow: number;
  minSamples: number;
  riskPenalty: Record<RiskAppetite, number>;
  guardrailThresholds: {
    drawdownCritical: number;
    drawdownCaution: number;
    volatilityCritical: number;
    volatilityCaution: number;
    momentumFlip: number;
  };
}

export const defaultStrategyConfig: StrategyTuningConfig = {
  shortWindow: 5,
  longWindow: 20,
  momentumWindow: 4,
  rsiWindow: 14,
  riskVolatilityWindow: 10,
  minSamples: 8,
  riskPenalty: {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
  },
  guardrailThresholds: {
    drawdownCritical: 0.12,
    drawdownCaution: 0.08,
    volatilityCritical: 0.045,
    volatilityCaution: 0.03,
    momentumFlip: 0.35,
  },
};

export type StrategyConfigDocumentationKey =
  | keyof StrategyTuningConfig
  | 'riskPenalty.low'
  | 'riskPenalty.medium'
  | 'riskPenalty.high'
  | 'guardrailThresholds.drawdownCritical'
  | 'guardrailThresholds.drawdownCaution'
  | 'guardrailThresholds.volatilityCritical'
  | 'guardrailThresholds.volatilityCaution'
  | 'guardrailThresholds.momentumFlip';

export interface StrategyConfigDocumentationEntry {
  key: StrategyConfigDocumentationKey;
  description: string;
  impact: string;
}

export const strategyConfigDocumentation: StrategyConfigDocumentationEntry[] = [
  {
    key: 'shortWindow',
    description: 'Number of candles used for the fast moving average in trend analysis.',
    impact:
      'Smaller values react quicker to new information but are more sensitive to noise. Larger values smooth the signal and may miss early reversals.',
  },
  {
    key: 'longWindow',
    description: 'Number of candles used for the slow moving average baseline.',
    impact:
      'Defines the structural trend reference. Increasing this requires more data but creates stronger filters for short-term volatility.',
  },
  {
    key: 'momentumWindow',
    description: 'Lookback window (in candles) for short-term momentum slope assessment.',
    impact:
      'Controls how quickly momentum oscillators react to recent changes. Smaller windows emphasize abrupt inflections, larger windows smooth them.',
  },
  {
    key: 'rsiWindow',
    description: 'Observation window for the RSI-like oscillator that powers the momentum classification.',
    impact:
      'Shorter windows produce more extreme RSI readings, while longer windows moderate the signal and reduce false positives.',
  },
  {
    key: 'riskVolatilityWindow',
    description: 'Sample window for realized volatility and value-at-risk estimation.',
    impact:
      'Smaller windows emphasize the most recent turbulence; larger windows assume regime stability and may understate fresh volatility shocks.',
  },
  {
    key: 'minSamples',
    description: 'Minimum number of candles required before the strategy will issue directional signals.',
    impact:
      'Prevents the agent from acting on insufficient context. Raising this number increases safety at the cost of responsiveness.',
  },
  {
    key: 'riskPenalty.low',
    description: 'Penalty weight applied to risk metrics when the user has low risk appetite.',
    impact:
      'Higher penalties bias the final score toward neutral or defensive positioning whenever volatility metrics rise.',
  },
  {
    key: 'riskPenalty.medium',
    description: 'Penalty weight applied under medium risk appetite.',
    impact:
      'Default balance between opportunity seeking and drawdown protection.',
  },
  {
    key: 'riskPenalty.high',
    description: 'Penalty weight applied under high risk appetite.',
    impact:
      'Lower penalties favour aggressive trades but still factor in guardrails when extreme conditions are detected.',
  },
  {
    key: 'guardrailThresholds.drawdownCaution',
    description: 'Drawdown level (relative from recent swing high) that triggers caution messaging.',
    impact:
      'Helps the agent flag weakening structure before losses become too large.',
  },
  {
    key: 'guardrailThresholds.drawdownCritical',
    description: 'Drawdown level that forces the agent to avoid long exposure unless momentum is overwhelmingly positive.',
    impact:
      'Protects against knife-catching scenarios in severe downtrends.',
  },
  {
    key: 'guardrailThresholds.volatilityCaution',
    description: 'Annualized volatility estimation above which warnings are added.',
    impact:
      'Signals choppy conditions where spread capture becomes difficult.',
  },
  {
    key: 'guardrailThresholds.volatilityCritical',
    description: 'Volatility level where offensive positions are disallowed regardless of LLM enthusiasm.',
    impact:
      'Prevents risk-seeking narratives from overriding quantitative stress signals.',
  },
  {
    key: 'guardrailThresholds.momentumFlip',
    description: 'Absolute difference between deterministic and LLM signals that triggers manual arbitration.',
    impact:
      'Ensures conflicting narratives trigger neutral positioning so the agent never issues contradictory advice.',
  },
];
