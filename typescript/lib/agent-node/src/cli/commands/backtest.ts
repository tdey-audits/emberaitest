import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { BacktestEngine } from '../../paper-trading/backtest.js';
import { loadReplayDataset } from '../../paper-trading/dataset.js';
import type {
  BacktestEngineOptions,
  BacktestReport,
  BacktestStrategy,
  ReplayDataset,
} from '../../paper-trading/types.js';
import { cliOutput } from '../output.js';

export interface BacktestCommandOptions extends BacktestEngineOptions {
  dataset: string;
  strategy?: string;
  output?: string;
  pretty?: boolean;
}

export interface BacktestCommandResult {
  report: BacktestReport;
  outputPath?: string;
}

function isStrategy(candidate: unknown): candidate is BacktestStrategy {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as BacktestStrategy).name === 'string' &&
    typeof (candidate as BacktestStrategy).onTick === 'function'
  );
}

function createFlatStrategy(): BacktestStrategy {
  return {
    name: 'builtin:flat',
    async onTick() {
      // Intentionally empty: no trades executed
    },
  };
}

function createBuyAndHoldStrategy(): BacktestStrategy {
  return {
    name: 'builtin:buy-and-hold',
    onInit({ runtime }) {
      const initialBalance = runtime.getInitialBalance();
      const collateralUsd = initialBalance * 0.95;
      if (collateralUsd <= 0) {
        return;
      }
      runtime.openPosition({
        side: 'long',
        collateralUsd,
        sizeUsd: collateralUsd,
        leverage: 1,
        label: 'buy-and-hold',
      });
    },
    async onTick({ index, context }) {
      if (index === context.dataset.data.length - 1) {
        const openPositions = context.runtime.getOpenPositions();
        for (const position of openPositions) {
          context.runtime.closePosition(position.id, 'strategy-exit');
        }
      }
    },
  };
}

async function loadStrategyModule(
  modulePath: string,
  dataset: ReplayDataset,
): Promise<BacktestStrategy> {
  const resolvedPath = resolve(process.cwd(), modulePath);
  const moduleUrl = pathToFileURL(resolvedPath).href;
  const imported = await import(moduleUrl);

  const candidates: Array<BacktestStrategy | undefined | null> = [
    imported.default as BacktestStrategy | undefined,
    imported.strategy as BacktestStrategy | undefined,
  ];

  if (typeof imported.createStrategy === 'function') {
    const created = await imported.createStrategy({ dataset });
    candidates.push(created as BacktestStrategy);
  }

  for (const candidate of candidates) {
    if (isStrategy(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Strategy module ${modulePath} does not export a valid BacktestStrategy (expected default export, named export "strategy", or createStrategy factory).`,
  );
}

async function resolveStrategy(
  strategyRef: string | undefined,
  dataset: ReplayDataset,
): Promise<BacktestStrategy> {
  if (!strategyRef || strategyRef === 'builtin:flat') {
    return createFlatStrategy();
  }

  if (strategyRef === 'builtin:buy-and-hold') {
    return createBuyAndHoldStrategy();
  }

  return loadStrategyModule(strategyRef, dataset);
}

function resolveEngineOptions(options: BacktestCommandOptions): BacktestEngineOptions {
  const { initialBalanceUsd, feeBps, slippageBps } = options;
  const resolved: BacktestEngineOptions = {};

  if (initialBalanceUsd !== undefined) {
    if (!Number.isFinite(initialBalanceUsd) || initialBalanceUsd <= 0) {
      throw new Error('initialBalanceUsd must be a positive number');
    }
    resolved.initialBalanceUsd = initialBalanceUsd;
  }

  if (feeBps !== undefined) {
    if (!Number.isFinite(feeBps) || feeBps < 0) {
      throw new Error('feeBps must be a non-negative number');
    }
    resolved.feeBps = feeBps;
  }

  if (slippageBps !== undefined) {
    if (!Number.isFinite(slippageBps) || slippageBps < 0) {
      throw new Error('slippageBps must be a non-negative number');
    }
    resolved.slippageBps = slippageBps;
  }

  return resolved;
}

export async function backtestCommand(
  options: BacktestCommandOptions,
): Promise<BacktestCommandResult> {
  if (!options.dataset) {
    throw new Error('Dataset path is required (--dataset <path>)');
  }

  const dataset = await loadReplayDataset(options.dataset);
  const strategy = await resolveStrategy(options.strategy, dataset);
  const engineOptions = resolveEngineOptions(options);
  const engine = new BacktestEngine(dataset, engineOptions);

  cliOutput.print(`Running backtest for strategy \`${strategy.name}\`…`, 'cyan');
  const result = await engine.run(strategy);

  let outputPath: string | undefined;
  if (options.output) {
    outputPath = resolve(process.cwd(), options.output);
    const json = JSON.stringify(result, null, options.pretty === false ? undefined : 2);
    await writeFile(outputPath, `${json}\n`, 'utf-8');
    cliOutput.success(`Backtest results written to \`${outputPath}\``);
  } else {
    cliOutput.info(`Final equity: ${result.finalBalanceUsd.toFixed(2)} USD`);
    cliOutput.info(`Total return: ${result.totalReturnPct.toFixed(2)}%`);
    cliOutput.info(`Trades executed: ${result.statistics.totalTrades}`);
  }

  return { report: result, outputPath };
}
