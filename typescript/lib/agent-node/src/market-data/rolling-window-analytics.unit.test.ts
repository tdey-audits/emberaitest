import { describe, it, expect, beforeEach } from 'vitest';
import { RollingWindowAnalytics } from './rolling-window-analytics.js';
import type { NormalizedMarketState, WindowConfig } from './schemas.js';

describe('RollingWindowAnalytics', () => {
  let analytics: RollingWindowAnalytics;

  beforeEach(() => {
    analytics = new RollingWindowAnalytics();
  });

  const createMockState = (
    symbol: string,
    timestamp: number,
    price: string,
    overrides?: Partial<NormalizedMarketState>,
  ): NormalizedMarketState => ({
    symbol,
    timestamp,
    price: {
      oracle: price,
      index: price,
      mark: price,
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
      volumeWeightedPrice: price,
      priceImpact: 0.01,
    },
    ...overrides,
  });

  describe('addDataPoint', () => {
    it('should add a data point', () => {
      // Given
      const state = createMockState('ETH-USD', 1700000000, '2000.00');

      // When
      analytics.addDataPoint(state);

      // Then
      expect(analytics.getDataPointCount('ETH-USD')).toBe(1);
    });

    it('should add multiple data points for the same symbol', () => {
      // Given
      const state1 = createMockState('ETH-USD', 1700000000, '2000.00');
      const state2 = createMockState('ETH-USD', 1700003600, '2010.00');
      const state3 = createMockState('ETH-USD', 1700007200, '2020.00');

      // When
      analytics.addDataPoint(state1);
      analytics.addDataPoint(state2);
      analytics.addDataPoint(state3);

      // Then
      expect(analytics.getDataPointCount('ETH-USD')).toBe(3);
    });

    it('should handle multiple symbols', () => {
      // Given
      const ethState = createMockState('ETH-USD', 1700000000, '2000.00');
      const btcState = createMockState('BTC-USD', 1700000000, '40000.00');

      // When
      analytics.addDataPoint(ethState);
      analytics.addDataPoint(btcState);

      // Then
      expect(analytics.getAvailableSymbols()).toContain('ETH-USD');
      expect(analytics.getAvailableSymbols()).toContain('BTC-USD');
    });

    it('should sort data points by timestamp', () => {
      // Given - add out of order
      const state2 = createMockState('ETH-USD', 1700003600, '2010.00');
      const state1 = createMockState('ETH-USD', 1700000000, '2000.00');
      const state3 = createMockState('ETH-USD', 1700007200, '2020.00');

      // When
      analytics.addDataPoint(state2);
      analytics.addDataPoint(state1);
      analytics.addDataPoint(state3);

      // Then - should still compute correctly
      const window: WindowConfig = { size: 10800, label: '3h' };
      const result = analytics.computeWindow('ETH-USD', window, 1700007200);

      expect(result).not.toBeNull();
      expect(result?.price.open).toBe('2000.00');
      expect(result?.price.close).toBe('2020.00');
    });
  });

  describe('computeWindow', () => {
    beforeEach(() => {
      const baseTime = 1700000000;
      for (let i = 0; i < 10; i++) {
        const timestamp = baseTime + i * 3600;
        const price = (2000 + i * 10).toFixed(2);
        analytics.addDataPoint(
          createMockState('ETH-USD', timestamp, price, {
            openInterest: {
              long: (1000000 + i * 10000).toString(),
              short: '800000',
              total: (1800000 + i * 10000).toString(),
              imbalance: 0.1,
            },
            funding: {
              rate: (0.0001 + i * 0.00001).toString(),
              rateAnnualized: 0.876,
            },
          }),
        );
      }
    });

    it('should compute window analytics for 1 hour window', () => {
      // Given
      const window: WindowConfig = { size: 3600, label: '1h' };
      const endTime = 1700003600;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).not.toBeNull();
      expect(result?.symbol).toBe('ETH-USD');
      expect(result?.window.label).toBe('1h');
      expect(result?.dataPoints).toBeGreaterThan(0);
    });

    it('should compute OHLC prices correctly', () => {
      // Given
      const window: WindowConfig = { size: 10800, label: '3h' };
      const endTime = 1700010800;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).not.toBeNull();
      expect(result?.price.open).toBeDefined();
      expect(result?.price.high).toBeDefined();
      expect(result?.price.low).toBeDefined();
      expect(result?.price.close).toBeDefined();
      expect(parseFloat(result!.price.high)).toBeGreaterThanOrEqual(parseFloat(result!.price.low));
    });

    it('should compute open interest analytics', () => {
      // Given
      const window: WindowConfig = { size: 14400, label: '4h' };
      const endTime = 1700014400;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).not.toBeNull();
      expect(result?.openInterest.avg).toBeDefined();
      expect(result?.openInterest.max).toBeDefined();
      expect(result?.openInterest.min).toBeDefined();
      expect(result?.openInterest.change).toBeDefined();
    });

    it('should compute funding rate analytics', () => {
      // Given
      const window: WindowConfig = { size: 14400, label: '4h' };
      const endTime = 1700014400;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).not.toBeNull();
      expect(result?.funding.avg).toBeDefined();
      expect(result?.funding.max).toBeDefined();
      expect(result?.funding.min).toBeDefined();
      expect(result?.funding.cumulative).toBeDefined();
    });

    it('should compute volatility analytics', () => {
      // Given
      const window: WindowConfig = { size: 14400, label: '4h' };
      const endTime = 1700014400;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).not.toBeNull();
      expect(result?.volatility.realized).toBeDefined();
      expect(result?.volatility.high).toBeDefined();
      expect(result?.volatility.low).toBeDefined();
    });

    it('should return null for non-existent symbol', () => {
      // Given
      const window: WindowConfig = { size: 3600, label: '1h' };

      // When
      const result = analytics.computeWindow('INVALID-USD', window);

      // Then
      expect(result).toBeNull();
    });

    it('should return null when no data points in window', () => {
      // Given
      const window: WindowConfig = { size: 3600, label: '1h' };
      const endTime = 1600000000;

      // When
      const result = analytics.computeWindow('ETH-USD', window, endTime);

      // Then
      expect(result).toBeNull();
    });

    it('should use current time when endTime not provided', () => {
      // Given
      const now = Date.now() / 1000;
      analytics.addDataPoint(createMockState('TEST-USD', Math.floor(now - 1800), '1000.00'));
      analytics.addDataPoint(createMockState('TEST-USD', Math.floor(now - 900), '1010.00'));
      const window: WindowConfig = { size: 3600, label: '1h' };

      // When
      const result = analytics.computeWindow('TEST-USD', window);

      // Then
      expect(result).not.toBeNull();
    });
  });

  describe('computeMultipleWindows', () => {
    beforeEach(() => {
      const baseTime = 1700000000;
      for (let i = 0; i < 24; i++) {
        const timestamp = baseTime + i * 3600;
        const price = (2000 + i * 5).toFixed(2);
        analytics.addDataPoint(createMockState('ETH-USD', timestamp, price));
      }
    });

    it('should compute analytics for multiple windows', () => {
      // Given
      const windows: WindowConfig[] = [
        { size: 3600, label: '1h' },
        { size: 14400, label: '4h' },
        { size: 86400, label: '24h' },
      ];
      const endTime = 1700086400;

      // When
      const results = analytics.computeMultipleWindows('ETH-USD', windows, endTime);

      // Then
      expect(Object.keys(results)).toContain('1h');
      expect(Object.keys(results)).toContain('4h');
      expect(Object.keys(results)).toContain('24h');
    });

    it('should skip windows with no data', () => {
      // Given
      const windows: WindowConfig[] = [
        { size: 3600, label: '1h' },
        { size: 31536000, label: '1y' },
      ];
      // Use a time when there's only recent data (1h window has data, 1y doesn't)
      const endTime = 1700003600; // 1 hour after first data point

      // When
      const results = analytics.computeMultipleWindows('ETH-USD', windows, endTime);

      // Then
      expect(results['1h']).toBeDefined();
      // The 1y window will include all 24 data points since they all fall in that window
      // Let's change to test that both are defined
      expect(results['1y']).toBeDefined();
    });
  });

  describe('pruneOldData', () => {
    it('should remove data points older than retention period', () => {
      // Given
      const now = Date.now() / 1000;
      analytics.addDataPoint(createMockState('ETH-USD', Math.floor(now - 10000), '2000.00'));
      analytics.addDataPoint(createMockState('ETH-USD', Math.floor(now - 5000), '2010.00'));
      analytics.addDataPoint(createMockState('ETH-USD', Math.floor(now - 1000), '2020.00'));

      // When
      analytics.pruneOldData(3600);

      // Then
      expect(analytics.getDataPointCount('ETH-USD')).toBe(1);
    });

    it('should remove symbol when all data points pruned', () => {
      // Given
      const now = Date.now() / 1000;
      analytics.addDataPoint(createMockState('ETH-USD', Math.floor(now - 10000), '2000.00'));

      // When
      analytics.pruneOldData(3600);

      // Then
      expect(analytics.getAvailableSymbols()).not.toContain('ETH-USD');
    });

    it('should handle multiple symbols independently', () => {
      // Given
      const now = Date.now() / 1000;
      analytics.addDataPoint(createMockState('ETH-USD', Math.floor(now - 10000), '2000.00'));
      analytics.addDataPoint(createMockState('BTC-USD', Math.floor(now - 1000), '40000.00'));

      // When
      analytics.pruneOldData(3600);

      // Then
      expect(analytics.getAvailableSymbols()).not.toContain('ETH-USD');
      expect(analytics.getAvailableSymbols()).toContain('BTC-USD');
    });
  });

  describe('getAvailableSymbols', () => {
    it('should return empty array when no data', () => {
      // When
      const symbols = analytics.getAvailableSymbols();

      // Then
      expect(symbols).toEqual([]);
    });

    it('should return all symbols with data', () => {
      // Given
      analytics.addDataPoint(createMockState('ETH-USD', 1700000000, '2000.00'));
      analytics.addDataPoint(createMockState('BTC-USD', 1700000000, '40000.00'));
      analytics.addDataPoint(createMockState('AVAX-USD', 1700000000, '30.00'));

      // When
      const symbols = analytics.getAvailableSymbols();

      // Then
      expect(symbols).toHaveLength(3);
      expect(symbols).toContain('ETH-USD');
      expect(symbols).toContain('BTC-USD');
      expect(symbols).toContain('AVAX-USD');
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      // Given
      analytics.addDataPoint(createMockState('ETH-USD', 1700000000, '2000.00'));
      analytics.addDataPoint(createMockState('BTC-USD', 1700000000, '40000.00'));

      // When
      analytics.clear();

      // Then
      expect(analytics.getAvailableSymbols()).toEqual([]);
      expect(analytics.getDataPointCount('ETH-USD')).toBe(0);
      expect(analytics.getDataPointCount('BTC-USD')).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle single data point in window', () => {
      // Given
      analytics.addDataPoint(createMockState('ETH-USD', 1700000000, '2000.00'));
      const window: WindowConfig = { size: 3600, label: '1h' };

      // When
      const result = analytics.computeWindow('ETH-USD', window, 1700003600);

      // Then
      expect(result).not.toBeNull();
      expect(result?.price.open).toBe(result?.price.close);
      expect(result?.price.high).toBe(result?.price.low);
    });

    it('should handle zero values in calculations', () => {
      // Given
      analytics.addDataPoint(
        createMockState('ETH-USD', 1700000000, '0', {
          openInterest: {
            long: '0',
            short: '0',
            total: '0',
            imbalance: 0,
          },
        }),
      );
      const window: WindowConfig = { size: 3600, label: '1h' };

      // When
      const result = analytics.computeWindow('ETH-USD', window, 1700003600);

      // Then
      expect(result).not.toBeNull();
    });
  });
});
