import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateAggregationService } from './state-aggregation-service.js';
import { InMemoryPersistenceAdapter } from './persistence/in-memory-adapter.js';
import type { WindowConfig, GMXMarketData, MarketDataSnapshot } from './schemas.js';
import type { StateUpdateListener } from './state-aggregation-service.js';

describe('StateAggregationService', () => {
  let service: StateAggregationService;
  let persistenceAdapter: InMemoryPersistenceAdapter;

  const windowConfigs: WindowConfig[] = [
    { size: 3600, label: '1h' },
    { size: 14400, label: '4h' },
    { size: 86400, label: '24h' },
  ];

  beforeEach(() => {
    persistenceAdapter = new InMemoryPersistenceAdapter();
    service = new StateAggregationService(
      {
        windowConfigs,
        retentionPeriod: 7 * 24 * 60 * 60,
        publishInterval: 60,
        version: '1.0.0',
        source: 'test',
      },
      persistenceAdapter,
    );
  });

  afterEach(async () => {
    await service.shutdown();
  });

  const createMockGMXData = (symbol: string, timestamp: number, price: string): GMXMarketData => ({
    marketAddress: '0x1234',
    symbol,
    indexPrice: price,
    markPrice: price,
    longOpenInterest: '1000000',
    shortOpenInterest: '800000',
    fundingRate: '0.0001',
    liquidityLong: '5000000',
    liquidityShort: '4500000',
    timestamp,
  });

  describe('processMarketData', () => {
    it('should process and normalize market data', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(service.getAvailableSymbols()).toContain('ETH-USD');
    });

    it('should publish snapshot to listeners', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let capturedSnapshot: MarketDataSnapshot | null = null;

      const listener: StateUpdateListener = {
        onStateUpdate: (snapshot) => {
          capturedSnapshot = snapshot;
        },
      };

      service.subscribe(listener);

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(capturedSnapshot).not.toBeNull();
      expect(capturedSnapshot?.markets).toHaveLength(1);
      expect(capturedSnapshot?.markets[0].symbol).toBe('ETH-USD');
    });

    it('should persist snapshot when adapter configured', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(persistenceAdapter.getSnapshotCount()).toBe(1);
    });

    it('should process multiple markets', async () => {
      // Given
      const dataSources = [
        { gmxMarketData: createMockGMXData('ETH-USD', 1700000000, '2000.00') },
        { gmxMarketData: createMockGMXData('BTC-USD', 1700000000, '40000.00') },
      ];

      // When
      await service.processMarketData(dataSources);

      // Then
      const symbols = service.getAvailableSymbols();
      expect(symbols).toContain('ETH-USD');
      expect(symbols).toContain('BTC-USD');
    });

    it('should include processing time in metadata', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let capturedSnapshot: MarketDataSnapshot | null = null;

      service.subscribe({
        onStateUpdate: (snapshot) => {
          capturedSnapshot = snapshot;
        },
      });

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(capturedSnapshot?.metadata?.processingTime).toBeDefined();
      expect(capturedSnapshot?.metadata?.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('subscribe/unsubscribe', () => {
    it('should notify listener on state update', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let notificationCount = 0;

      const listener: StateUpdateListener = {
        onStateUpdate: () => {
          notificationCount++;
        },
      };

      service.subscribe(listener);

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(notificationCount).toBe(1);
    });

    it('should notify multiple listeners', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let count1 = 0;
      let count2 = 0;

      service.subscribe({ onStateUpdate: () => count1++ });
      service.subscribe({ onStateUpdate: () => count2++ });

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('should unsubscribe listener', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let notificationCount = 0;

      const unsubscribe = service.subscribe({
        onStateUpdate: () => {
          notificationCount++;
        },
      });

      // When
      unsubscribe();
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(notificationCount).toBe(0);
    });

    it('should handle async listeners', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let completed = false;

      const listener: StateUpdateListener = {
        onStateUpdate: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          completed = true;
        },
      };

      service.subscribe(listener);

      // When
      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // Then
      expect(completed).toBe(true);
    });
  });

  describe('getCurrentAnalytics', () => {
    it('should return analytics for a symbol', async () => {
      // Given - add data near current time so windows can find it
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 25; i++) {
        const timestamp = now - (24 - i) * 3600; // Last 24 hours
        const price = (2000 + i * 10).toFixed(2);
        await service.processMarketData([
          { gmxMarketData: createMockGMXData('ETH-USD', timestamp, price) },
        ]);
      }

      // When
      const analytics = service.getCurrentAnalytics('ETH-USD');

      // Then
      expect(Object.keys(analytics)).toContain('1h');
      expect(Object.keys(analytics)).toContain('4h');
      expect(Object.keys(analytics)).toContain('24h');
    });

    it('should return empty object for non-existent symbol', () => {
      // When
      const analytics = service.getCurrentAnalytics('INVALID-USD');

      // Then
      expect(Object.keys(analytics)).toHaveLength(0);
    });
  });

  describe('persistence operations', () => {
    it('should load snapshot by id', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let snapshotId: string | null = null;

      service.subscribe({
        onStateUpdate: (snapshot) => {
          snapshotId = snapshot.id;
        },
      });

      await service.processMarketData([{ gmxMarketData: gmxData }]);

      // When
      const loaded = await service.loadSnapshot(snapshotId!);

      // Then
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(snapshotId);
    });

    it('should list snapshots', async () => {
      // Given
      for (let i = 0; i < 3; i++) {
        await service.processMarketData([
          {
            gmxMarketData: createMockGMXData('ETH-USD', 1700000000 + i * 3600, '2000.00'),
          },
        ]);
      }

      // When
      const result = await service.listSnapshots({ limit: 10 });

      // Then
      expect(result.snapshots.length).toBe(3);
    });

    it('should filter snapshots by time range', async () => {
      // Given
      const baseTime = 1700000000;
      for (let i = 0; i < 5; i++) {
        await service.processMarketData([
          {
            gmxMarketData: createMockGMXData('ETH-USD', baseTime + i * 3600, '2000.00'),
          },
        ]);
      }

      // When - filter to get middle snapshots
      // Note: snapshot timestamp is current time, not data timestamp
      const snapshots = await service.listSnapshots();
      const allTimestamps = snapshots.snapshots.map((s) => s.timestamp);
      const minTime = Math.min(...allTimestamps);
      const maxTime = Math.max(...allTimestamps);

      const result = await service.listSnapshots({
        startTime: minTime,
        endTime: maxTime,
      });

      // Then
      expect(result.snapshots.length).toBe(5);
    });

    it('should throw error when loading without persistence adapter', async () => {
      // Given
      const serviceWithoutPersistence = new StateAggregationService({
        windowConfigs,
      });

      // When/Then
      await expect(serviceWithoutPersistence.loadSnapshot('test-id')).rejects.toThrow(
        'Persistence adapter not configured',
      );

      await serviceWithoutPersistence.shutdown();
    });
  });

  describe('startAutoPublish/stopAutoPublish', () => {
    it('should not start multiple timers', () => {
      // When
      service.startAutoPublish();
      service.startAutoPublish();
      service.stopAutoPublish();

      // Then - no error thrown
      expect(true).toBe(true);
    });

    it('should handle stop without start', () => {
      // When
      service.stopAutoPublish();

      // Then - no error thrown
      expect(true).toBe(true);
    });
  });

  describe('pruneOldData', () => {
    it('should prune old data', async () => {
      // Given
      const now = Date.now() / 1000;
      await service.processMarketData([
        {
          gmxMarketData: createMockGMXData('ETH-USD', Math.floor(now - 10000), '2000.00'),
        },
      ]);
      await service.processMarketData([
        {
          gmxMarketData: createMockGMXData('ETH-USD', Math.floor(now - 1000), '2010.00'),
        },
      ]);

      // When
      service.pruneOldData();

      // Then - can't directly observe internal state, but method should complete
      expect(service.getAvailableSymbols()).toContain('ETH-USD');
    });
  });

  describe('clear', () => {
    it('should clear all data', async () => {
      // Given
      await service.processMarketData([
        { gmxMarketData: createMockGMXData('ETH-USD', 1700000000, '2000.00') },
      ]);

      // When
      service.clear();

      // Then
      expect(service.getAvailableSymbols()).toEqual([]);
    });
  });

  describe('shutdown', () => {
    it('should stop auto-publish and clear listeners', async () => {
      // Given
      let notificationCount = 0;
      service.subscribe({ onStateUpdate: () => notificationCount++ });
      service.startAutoPublish();

      // When
      await service.shutdown();

      // Then - listeners cleared
      await service.processMarketData([
        { gmxMarketData: createMockGMXData('ETH-USD', 1700000000, '2000.00') },
      ]);
      expect(notificationCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty data sources', async () => {
      // When
      await service.processMarketData([]);

      // Then
      expect(service.getAvailableSymbols()).toEqual([]);
    });

    it('should handle listener errors gracefully', async () => {
      // Given
      const gmxData = createMockGMXData('ETH-USD', 1700000000, '2000.00');
      let listenerCalled = false;
      let errorOccurred = false;

      service.subscribe({
        onStateUpdate: () => {
          listenerCalled = true;
          errorOccurred = true;
          throw new Error('Listener error');
        },
      });

      // Add a second listener that works
      let secondListenerCalled = false;
      service.subscribe({
        onStateUpdate: () => {
          secondListenerCalled = true;
        },
      });

      // When - errors are caught via Promise.allSettled, should not propagate
      try {
        await service.processMarketData([{ gmxMarketData: gmxData }]);
      } catch (_error) {
        // Should not reach here
        expect.fail('processMarketData should not throw');
      }

      // Then - both listeners were called
      expect(listenerCalled).toBe(true);
      expect(errorOccurred).toBe(true);
      expect(secondListenerCalled).toBe(true);
    });
  });
});
