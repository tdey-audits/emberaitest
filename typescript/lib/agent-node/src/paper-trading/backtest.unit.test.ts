import { resolve } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { BacktestEngine } from './backtest.js';
import { loadReplayDataset } from './dataset.js';
import type { BacktestStrategy, ReplayDataset } from './types.js';

const fixturePath = resolve(
  process.cwd(),
  'tests/fixtures/paper-trading/simple-gmx-market.json',
);

describe('BacktestEngine', () => {
  let dataset: ReplayDataset;

  beforeEach(async () => {
    dataset = await loadReplayDataset(fixturePath);
  });

  it('produces a report with trade metrics for a basic strategy', async () => {
    // Given a simple strategy that opens at the first tick and exits at the last tick
    const strategy: BacktestStrategy = {
      name: 'test-long-strategy',
      onTick({ index, context }) {
        if (index === 0) {
          context.runtime.openPosition({
            side: 'long',
            collateralUsd: 1_000,
            sizeUsd: 2_000,
            leverage: 2,
            label: 'entry',
          });
        }

        if (index === context.dataset.data.length - 1) {
          context.runtime.closeAllPositions('strategy-exit');
        }
      },
    };

    const engine = new BacktestEngine(dataset, {
      initialBalanceUsd: 5_000,
      feeBps: 0,
      slippageBps: 0,
    });

    // When running the backtest
    const report = await engine.run(strategy);

    // Then the report should capture the trade and resulting PnL
    expect(report.strategyName).toBe('test-long-strategy');
    expect(report.trades).toHaveLength(1);
    const trade = report.trades[0];
    expect(trade.positionId).toMatch(/^pos-/);
    expect(trade.realizedPnlUsd).toBeCloseTo((1.08 - 1.0) * (2_000 / 1.0), 6);
    expect(report.statistics.totalTrades).toBe(1);
    expect(report.finalBalanceUsd).toBeCloseTo(5_000 + trade.realizedPnlUsd, 6);
    expect(report.totalReturnPct).toBeCloseTo((trade.realizedPnlUsd / 5_000) * 100, 6);
  });

  it('resets internal state between independent runs', async () => {
    const strategy: BacktestStrategy = {
      name: 'repeatable-strategy',
      onTick({ index, context }) {
        if (index === 0) {
          context.runtime.openPosition({
            side: 'short',
            collateralUsd: 500,
            sizeUsd: 1_500,
            leverage: 3,
          });
        }
        if (index === context.dataset.data.length - 1) {
          context.runtime.closeAllPositions('strategy-exit');
        }
      },
    };

    const engine = new BacktestEngine(dataset, {
      initialBalanceUsd: 8_000,
      feeBps: 0,
      slippageBps: 0,
    });

    const first = await engine.run(strategy);
    const second = await engine.run(strategy);

    expect(second.finalBalanceUsd).toBeCloseTo(first.finalBalanceUsd, 8);
    expect(second.realizedPnlUsd).toBeCloseTo(first.realizedPnlUsd, 8);
    expect(second.trades).toEqual(first.trades);
    expect(second.equityCurve).toEqual(first.equityCurve);
  });
});
