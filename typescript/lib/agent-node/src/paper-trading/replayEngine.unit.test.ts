import { resolve } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { loadReplayDataset } from './dataset.js';
import { GmxReplayEngine } from './replayEngine.js';
import type { ReplayDataset } from './types.js';

const fixturePath = resolve(
  process.cwd(),
  'tests/fixtures/paper-trading/simple-gmx-market.json',
);

describe('GmxReplayEngine', () => {
  let dataset: ReplayDataset;

  beforeEach(async () => {
    dataset = await loadReplayDataset(fixturePath);
  });

  it('produces deterministic results for identical replays', () => {
    // Given a replay engine configured with deterministic parameters
    const config = { initialBalanceUsd: 10_000, feeBps: 0, slippageBps: 0 } as const;

    const runScenario = () => {
      const engine = new GmxReplayEngine(dataset, config);
      const position = engine.openPosition({
        side: 'long',
        collateralUsd: 2_000,
        sizeUsd: 4_000,
        leverage: 2,
        label: 'deterministic-test',
      });

      // When advancing through the dataset and closing the position
      engine.advanceTo(dataset.data[2].timestamp);
      engine.closePosition(position.id, 'strategy-exit');

      // Then return summary statistics for comparison
      return {
        realized: engine.getRealizedPnl(),
        equity: engine.getEquity(),
        history: engine.getEquityHistory(),
        trade: engine.getClosedPositions()[0],
      };
    };

    const first = runScenario();
    const second = runScenario();

    // Then both runs should produce identical outcomes
    expect(second.realized).toBeCloseTo(first.realized, 8);
    expect(second.equity).toBeCloseTo(first.equity, 8);
    expect(second.history).toEqual(first.history);
    expect(second.trade).toEqual(first.trade);
  });

  it('accurately accounts for PnL across open and closed positions', () => {
    // Given an engine without fees or slippage to isolate PnL mechanics
    const engine = new GmxReplayEngine(dataset, {
      initialBalanceUsd: 5_000,
      feeBps: 0,
      slippageBps: 0,
    });

    const initialEquity = engine.getEquity();

    // When opening a leveraged long position
    const position = engine.openPosition({
      side: 'long',
      collateralUsd: 1_000,
      sizeUsd: 2_000,
      leverage: 2,
    });

    // And advancing to a higher price snapshot before closing
    engine.advanceTo(dataset.data[dataset.data.length - 1].timestamp);
    const closed = engine.closePosition(position.id, 'strategy-exit');

    // Then realized PnL should match price move * size
    const expectedPnl = (1.08 - 1.0) * (2_000 / 1.0);
    expect(closed.realizedPnlUsd).toBeCloseTo(expectedPnl, 6);
    expect(engine.getRealizedPnl()).toBeCloseTo(expectedPnl, 6);

    // And final equity should reflect realized profit returned to balance
    const finalEquity = engine.getEquity();
    expect(finalEquity).toBeCloseTo(initialEquity + expectedPnl, 6);
    expect(engine.getOpenPositions()).toHaveLength(0);

    // Equity history should end with the final equity snapshot
    const equityHistory = engine.getEquityHistory();
    expect(equityHistory[equityHistory.length - 1]?.equityUsd).toBeCloseTo(finalEquity, 6);
  });
});
