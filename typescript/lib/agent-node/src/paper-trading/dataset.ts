import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import {
  MarketDataPointSchema,
  ReplayDatasetSchema,
  type MarketDataPoint,
  type ReplayDataset,
} from './types.js';

function deduplicateSnapshots(data: MarketDataPoint[]): MarketDataPoint[] {
  const unique: MarketDataPoint[] = [];
  let lastTimestamp: number | null = null;

  for (const point of data) {
    if (lastTimestamp === point.timestamp) {
      // Skip duplicates with same timestamp to keep deterministic playback
      continue;
    }
    unique.push(point);
    lastTimestamp = point.timestamp;
  }

  return unique;
}

export function normalizeReplayDataset(dataset: ReplayDataset): ReplayDataset {
  const sorted = [...dataset.data].sort((a, b) => a.timestamp - b.timestamp);
  const normalizedData = deduplicateSnapshots(sorted).map((point) =>
    MarketDataPointSchema.parse(point),
  );

  return {
    ...dataset,
    data: normalizedData,
  };
}

export async function loadReplayDataset(source: string | ReplayDataset): Promise<ReplayDataset> {
  if (typeof source !== 'string') {
    return normalizeReplayDataset(ReplayDatasetSchema.parse(source));
  }

  const resolvedPath = resolve(process.cwd(), source);
  const raw = await readFile(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  return normalizeReplayDataset(ReplayDatasetSchema.parse(parsed));
}

export function validateReplayDataset(
  dataset: unknown,
): dataset is ReplayDataset {
  return ReplayDatasetSchema.safeParse(dataset).success;
}

export function getDatasetSummary(dataset: ReplayDataset): {
  startTimestamp: number;
  endTimestamp: number;
  totalPoints: number;
} {
  const first = dataset.data[0];
  const last = dataset.data[dataset.data.length - 1];

  return {
    startTimestamp: first.timestamp,
    endTimestamp: last.timestamp,
    totalPoints: dataset.data.length,
  };
}
