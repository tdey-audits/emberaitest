import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPersistenceAdapter } from './in-memory-adapter.js';
import type { MarketDataSnapshot } from '../schemas.js';

describe('InMemoryPersistenceAdapter', () => {
  let adapter: InMemoryPersistenceAdapter;

  beforeEach(() => {
    adapter = new InMemoryPersistenceAdapter();
  });

  const createMockSnapshot = (
    id: string,
    timestamp: number,
    symbol: string,
  ): MarketDataSnapshot => ({
    id,
    timestamp,
    markets: [
      {
        symbol,
        timestamp,
        price: {
          oracle: '2000.00',
          index: '2000.00',
          mark: '2001.50',
        },
        openInterest: {
          long: '1000000',
          short: '800000',
          total: '1800000',
          imbalance: 0.1,
        },
        funding: {
          rate: '0.0001',
          rateAnnualized: 0.876,
        },
        liquidity: {
          long: '5000000',
          short: '4500000',
          utilizationRatio: 0.3,
        },
        volatility: {
          realized24h: 0.5,
        },
        derived: {
          volumeWeightedPrice: '2000.50',
          priceImpact: 0.01,
        },
      },
    ],
    windows: {},
    metadata: {
      version: '1.0.0',
      source: 'test',
      processingTime: 10,
    },
  });

  describe('save', () => {
    it('should save a snapshot', async () => {
      // Given
      const snapshot = createMockSnapshot('snap-1', 1700000000, 'ETH-USD');

      // When
      await adapter.save(snapshot);

      // Then
      expect(adapter.getSnapshotCount()).toBe(1);
    });

    it('should save multiple snapshots', async () => {
      // Given
      const snapshot1 = createMockSnapshot('snap-1', 1700000000, 'ETH-USD');
      const snapshot2 = createMockSnapshot('snap-2', 1700003600, 'ETH-USD');
      const snapshot3 = createMockSnapshot('snap-3', 1700007200, 'BTC-USD');

      // When
      await adapter.save(snapshot1);
      await adapter.save(snapshot2);
      await adapter.save(snapshot3);

      // Then
      expect(adapter.getSnapshotCount()).toBe(3);
    });

    it('should sort snapshots by timestamp descending', async () => {
      // Given - save out of order
      const snapshot2 = createMockSnapshot('snap-2', 1700003600, 'ETH-USD');
      const snapshot1 = createMockSnapshot('snap-1', 1700000000, 'ETH-USD');
      const snapshot3 = createMockSnapshot('snap-3', 1700007200, 'ETH-USD');

      // When
      await adapter.save(snapshot2);
      await adapter.save(snapshot1);
      await adapter.save(snapshot3);

      // Then
      const result = await adapter.list({ limit: 10 });
      expect(result.snapshots[0].id).toBe('snap-3');
      expect(result.snapshots[1].id).toBe('snap-2');
      expect(result.snapshots[2].id).toBe('snap-1');
    });
  });

  describe('load', () => {
    it('should load a snapshot by id', async () => {
      // Given
      const snapshot = createMockSnapshot('snap-1', 1700000000, 'ETH-USD');
      await adapter.save(snapshot);

      // When
      const loaded = await adapter.load('snap-1');

      // Then
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('snap-1');
      expect(loaded?.markets[0].symbol).toBe('ETH-USD');
    });

    it('should return null for non-existent id', async () => {
      // When
      const loaded = await adapter.load('non-existent');

      // Then
      expect(loaded).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        const snapshot = createMockSnapshot(`snap-${i}`, 1700000000 + i * 3600, 'ETH-USD');
        await adapter.save(snapshot);
      }
    });

    it('should list all snapshots with default limit', async () => {
      // When
      const result = await adapter.list();

      // Then
      expect(result.snapshots.length).toBe(10);
      expect(result.hasMore).toBe(false);
    });

    it('should paginate results', async () => {
      // When
      const result = await adapter.list({ limit: 5, offset: 0 });

      // Then
      expect(result.snapshots.length).toBe(5);
      expect(result.hasMore).toBe(true);
    });

    it('should handle second page', async () => {
      // When
      const result = await adapter.list({ limit: 5, offset: 5 });

      // Then
      expect(result.snapshots.length).toBe(5);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by start time', async () => {
      // When
      const result = await adapter.list({
        startTime: 1700018000,
      });

      // Then
      expect(result.snapshots.length).toBeLessThan(10);
      result.snapshots.forEach((snap) => {
        expect(snap.timestamp).toBeGreaterThanOrEqual(1700018000);
      });
    });

    it('should filter by end time', async () => {
      // When
      const result = await adapter.list({
        endTime: 1700018000,
      });

      // Then
      expect(result.snapshots.length).toBeLessThan(10);
      result.snapshots.forEach((snap) => {
        expect(snap.timestamp).toBeLessThanOrEqual(1700018000);
      });
    });

    it('should filter by time range', async () => {
      // When
      const result = await adapter.list({
        startTime: 1700007200,
        endTime: 1700021600,
      });

      // Then
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.snapshots.length).toBeLessThan(10);
      result.snapshots.forEach((snap) => {
        expect(snap.timestamp).toBeGreaterThanOrEqual(1700007200);
        expect(snap.timestamp).toBeLessThanOrEqual(1700021600);
      });
    });

    it('should filter by symbols', async () => {
      // Given - add BTC snapshots
      for (let i = 0; i < 3; i++) {
        const snapshot = createMockSnapshot(
          `btc-snap-${i}`,
          1700000000 + (i + 10) * 3600,
          'BTC-USD',
        );
        await adapter.save(snapshot);
      }

      // When
      const result = await adapter.list({
        symbols: ['BTC-USD'],
      });

      // Then
      expect(result.snapshots.length).toBe(3);
      result.snapshots.forEach((snap) => {
        expect(snap.markets.some((m) => m.symbol === 'BTC-USD')).toBe(true);
      });
    });

    it('should filter by multiple symbols', async () => {
      // Given - add multiple symbol types
      await adapter.save(createMockSnapshot('btc-1', 1700000000 + 11 * 3600, 'BTC-USD'));
      await adapter.save(createMockSnapshot('avax-1', 1700000000 + 12 * 3600, 'AVAX-USD'));

      // When
      const result = await adapter.list({
        symbols: ['BTC-USD', 'AVAX-USD'],
      });

      // Then
      expect(result.snapshots.length).toBe(2);
    });

    it('should combine filters', async () => {
      // When
      const result = await adapter.list({
        startTime: 1700007200,
        endTime: 1700021600,
        limit: 3,
        offset: 0,
      });

      // Then
      expect(result.snapshots.length).toBeLessThanOrEqual(3);
    });

    it('should return empty when no snapshots match', async () => {
      // When
      const result = await adapter.list({
        startTime: 1800000000,
      });

      // Then
      expect(result.snapshots.length).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('getSnapshotCount', () => {
    it('should return 0 initially', () => {
      // When
      const count = adapter.getSnapshotCount();

      // Then
      expect(count).toBe(0);
    });

    it('should return correct count after saves', async () => {
      // Given
      await adapter.save(createMockSnapshot('snap-1', 1700000000, 'ETH-USD'));
      await adapter.save(createMockSnapshot('snap-2', 1700003600, 'ETH-USD'));
      await adapter.save(createMockSnapshot('snap-3', 1700007200, 'BTC-USD'));

      // When
      const count = adapter.getSnapshotCount();

      // Then
      expect(count).toBe(3);
    });
  });

  describe('clear', () => {
    it('should clear all snapshots', async () => {
      // Given
      await adapter.save(createMockSnapshot('snap-1', 1700000000, 'ETH-USD'));
      await adapter.save(createMockSnapshot('snap-2', 1700003600, 'ETH-USD'));

      // When
      adapter.clear();

      // Then
      expect(adapter.getSnapshotCount()).toBe(0);
      const result = await adapter.list();
      expect(result.snapshots.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate ids by overwriting', async () => {
      // Given
      const snapshot1 = createMockSnapshot('snap-1', 1700000000, 'ETH-USD');
      const snapshot2 = createMockSnapshot('snap-1', 1700003600, 'BTC-USD');

      // When
      await adapter.save(snapshot1);
      await adapter.save(snapshot2);

      // Then
      expect(adapter.getSnapshotCount()).toBe(1);
      const loaded = await adapter.load('snap-1');
      expect(loaded?.markets[0].symbol).toBe('BTC-USD');
    });

    it('should handle offset beyond available snapshots', async () => {
      // Given
      await adapter.save(createMockSnapshot('snap-1', 1700000000, 'ETH-USD'));

      // When
      const result = await adapter.list({ limit: 10, offset: 100 });

      // Then
      expect(result.snapshots.length).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });
});
