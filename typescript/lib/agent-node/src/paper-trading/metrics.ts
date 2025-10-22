import type {
  BacktestStatistics,
  EquitySnapshot,
  SimulatedPosition,
} from './types.js';

function calculateMaxDrawdown(equityCurve: EquitySnapshot[]): {
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
} {
  if (equityCurve.length === 0) {
    return { maxDrawdownUsd: 0, maxDrawdownPct: 0 };
  }

  let peak = equityCurve[0].equityUsd;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  for (const snapshot of equityCurve) {
    if (snapshot.equityUsd > peak) {
      peak = snapshot.equityUsd;
    }
    const drawdownUsd = peak - snapshot.equityUsd;
    if (drawdownUsd > maxDrawdownUsd) {
      maxDrawdownUsd = drawdownUsd;
      maxDrawdownPct = peak > 0 ? drawdownUsd / peak : 0;
    }
  }

  return { maxDrawdownUsd, maxDrawdownPct };
}

function calculateTradeStatistics(trades: SimulatedPosition[]): {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  totalWinUsd: number;
  totalLossUsd: number;
  averageWinUsd: number;
  averageLossUsd: number;
} {
  const epsilon = 1e-8;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakevenTrades = 0;
  let totalWinUsd = 0;
  let totalLossUsd = 0;

  for (const trade of trades) {
    const pnl = trade.realizedPnlUsd ?? 0;
    if (pnl > epsilon) {
      winningTrades += 1;
      totalWinUsd += pnl;
    } else if (pnl < -epsilon) {
      losingTrades += 1;
      totalLossUsd += Math.abs(pnl);
    } else {
      breakevenTrades += 1;
    }
  }

  const totalTrades = trades.length;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    totalWinUsd,
    totalLossUsd,
    averageWinUsd: winningTrades > 0 ? totalWinUsd / winningTrades : 0,
    averageLossUsd: losingTrades > 0 ? totalLossUsd / losingTrades : 0,
  };
}

function calculateSharpeRatio(equityCurve: EquitySnapshot[]): number | null {
  if (equityCurve.length < 2) {
    return null;
  }

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const previous = equityCurve[i - 1].equityUsd;
    const current = equityCurve[i].equityUsd;
    if (previous <= 0) {
      continue;
    }
    returns.push((current - previous) / previous);
  }

  if (returns.length === 0) {
    return null;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return null;
  }

  // Simple Sharpe approximation without annualization (relative scale only)
  const sharpe = mean / stdDev * Math.sqrt(returns.length);
  return Number.isFinite(sharpe) ? sharpe : null;
}

export function buildBacktestStatistics(
  equityCurve: EquitySnapshot[],
  trades: SimulatedPosition[],
): BacktestStatistics {
  const { maxDrawdownUsd, maxDrawdownPct } = calculateMaxDrawdown(equityCurve);
  const {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    totalWinUsd,
    totalLossUsd,
    averageWinUsd,
    averageLossUsd,
  } = calculateTradeStatistics(trades);

  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const profitFactor =
    totalLossUsd > 0 ? totalWinUsd / totalLossUsd : winningTrades > 0 ? Number.POSITIVE_INFINITY : null;
  const sharpeRatio = calculateSharpeRatio(equityCurve);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRatePct,
    maxDrawdownUsd,
    maxDrawdownPct,
    averageWinUsd,
    averageLossUsd: averageLossUsd === 0 ? 0 : -averageLossUsd,
    profitFactor: profitFactor === Number.POSITIVE_INFINITY ? null : profitFactor,
    sharpeRatio,
  };
}
