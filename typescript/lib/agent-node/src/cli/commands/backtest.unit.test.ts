import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { backtestCommand } from './backtest.js';
import type { BacktestReport } from '../../paper-trading/types.js';
import { cliOutput } from '../output.js';

const datasetPath = resolve(
  process.cwd(),
  'tests/fixtures/paper-trading/simple-gmx-market.json',
);

describe('backtestCommand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a flat strategy without modifying equity', async () => {
    const printSpy = vi.spyOn(cliOutput, 'print').mockImplementation(() => {});
    const infoSpy = vi.spyOn(cliOutput, 'info').mockImplementation(() => {});
    const successSpy = vi.spyOn(cliOutput, 'success').mockImplementation(() => {});

    const { report } = await backtestCommand({
      dataset: datasetPath,
      strategy: 'builtin:flat',
      initialBalanceUsd: 10_000,
      feeBps: 0,
      slippageBps: 0,
    });

    expect(report.statistics.totalTrades).toBe(0);
    expect(report.finalBalanceUsd).toBeCloseTo(10_000, 6);
    expect(report.realizedPnlUsd).toBeCloseTo(0, 6);

    expect(printSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(3);
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('writes report to file when output option is provided', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'backtest-'));
    const outputPath = join(dir, 'report.json');

    vi.spyOn(cliOutput, 'print').mockImplementation(() => {});
    vi.spyOn(cliOutput, 'info').mockImplementation(() => {});
    const successSpy = vi.spyOn(cliOutput, 'success').mockImplementation(() => {});

    const { report, outputPath: writtenPath } = await backtestCommand({
      dataset: datasetPath,
      strategy: 'builtin:buy-and-hold',
      initialBalanceUsd: 20_000,
      feeBps: 0,
      slippageBps: 0,
      output: outputPath,
      pretty: true,
    });

    expect(writtenPath).toBe(outputPath);
    expect(successSpy).toHaveBeenCalled();

    const fileContents = await readFile(outputPath, 'utf-8');
    const parsed = JSON.parse(fileContents) as BacktestReport;
    expect(parsed.strategyName).toBe(report.strategyName);
    expect(parsed.trades.length).toBeGreaterThanOrEqual(1);
  });
});
