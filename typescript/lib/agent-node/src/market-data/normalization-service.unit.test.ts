import { describe, it, expect, beforeEach } from 'vitest';
import { NormalizationService } from './normalization-service.js';
import type { OraclePrice, GMXMarketData } from './schemas.js';

describe('NormalizationService', () => {
  let service: NormalizationService;

  beforeEach(() => {
    service = new NormalizationService();
  });

  describe('normalize', () => {
    it('should normalize GMX market data without oracle price', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.symbol).toBe('ETH-USD');
      expect(result.timestamp).toBe(1700000000);
      expect(result.price.index).toBe('2000.00');
      expect(result.price.mark).toBe('2001.50');
      expect(result.price.oracle).toBe('2000.00');
      expect(result.openInterest.long).toBe('1000000');
      expect(result.openInterest.short).toBe('800000');
      expect(result.openInterest.total).toBe('1800000');
    });

    it('should use oracle price when available', () => {
      // Given
      const oraclePrice: OraclePrice = {
        symbol: 'ETH-USD',
        price: '2005.00',
        decimals: 8,
        timestamp: 1700000000,
        source: 'chainlink',
        confidence: 0.99,
      };

      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({
        oraclePrice,
        gmxMarketData: gmxData,
      });

      // Then
      expect(result.price.oracle).toBe('2005.00');
      expect(result.price.confidence).toBe(0.99);
    });

    it('should calculate open interest imbalance correctly', () => {
      // Given - more longs than shorts
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1200000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then - (1200000 - 800000) / 2000000 = 0.2
      expect(result.openInterest.imbalance).toBeCloseTo(0.2, 5);
    });

    it('should calculate open interest imbalance for short-heavy market', () => {
      // Given - more shorts than longs
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '600000',
        shortOpenInterest: '1400000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then - (600000 - 1400000) / 2000000 = -0.4
      expect(result.openInterest.imbalance).toBeCloseTo(-0.4, 5);
    });

    it('should handle zero open interest', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '0',
        shortOpenInterest: '0',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.openInterest.total).toBe('0');
      expect(result.openInterest.imbalance).toBe(0);
    });

    it('should calculate liquidity utilization ratio', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '3000000',
        liquidityShort: '2700000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then - totalOI (1800000) / totalLiquidity (5700000) = 0.3157...
      expect(result.liquidity.utilizationRatio).toBeCloseTo(0.3158, 4);
    });

    it('should handle zero liquidity', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '0',
        liquidityShort: '0',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.liquidity.utilizationRatio).toBe(0);
    });

    it('should annualize funding rate correctly', () => {
      // Given - 0.01% per hour
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then - 0.0001 * 365 * 24 = 0.876 (87.6% annualized)
      expect(result.funding.rateAnnualized).toBeCloseTo(0.876, 3);
    });

    it('should calculate derived metrics', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.derived.volumeWeightedPrice).toBeDefined();
      expect(result.derived.priceImpact).toBeDefined();
      expect(result.derived.priceImpact).toBeGreaterThanOrEqual(0);
      expect(result.derived.priceImpact).toBeLessThanOrEqual(1);
    });

    it('should calculate volatility estimate', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.volatility.realized24h).toBeGreaterThanOrEqual(0);
    });
  });

  describe('batchNormalize', () => {
    it('should normalize multiple data sources', () => {
      // Given
      const dataSources = [
        {
          gmxMarketData: {
            marketAddress: '0x1234',
            symbol: 'ETH-USD',
            indexPrice: '2000.00',
            markPrice: '2001.50',
            longOpenInterest: '1000000',
            shortOpenInterest: '800000',
            fundingRate: '0.0001',
            liquidityLong: '5000000',
            liquidityShort: '4500000',
            timestamp: 1700000000,
          },
        },
        {
          gmxMarketData: {
            marketAddress: '0x5678',
            symbol: 'BTC-USD',
            indexPrice: '40000.00',
            markPrice: '40050.00',
            longOpenInterest: '2000000',
            shortOpenInterest: '1800000',
            fundingRate: '0.00015',
            liquidityLong: '10000000',
            liquidityShort: '9500000',
            timestamp: 1700000000,
          },
        },
      ];

      // When
      const results = service.batchNormalize(dataSources);

      // Then
      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('ETH-USD');
      expect(results[1].symbol).toBe('BTC-USD');
    });

    it('should handle empty data sources array', () => {
      // Given
      const dataSources: never[] = [];

      // When
      const results = service.batchNormalize(dataSources);

      // Then
      expect(results).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very small funding rates', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '0.0000001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.funding.rate).toBe('0.0000001');
      expect(result.funding.rateAnnualized).toBeCloseTo(0.0008766, 5);
    });

    it('should handle negative funding rates', () => {
      // Given
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '1000000',
        shortOpenInterest: '800000',
        fundingRate: '-0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.funding.rate).toBe('-0.0001');
      expect(result.funding.rateAnnualized).toBeCloseTo(-0.876, 3);
    });

    it('should handle full liquidity utilization', () => {
      // Given - OI equals liquidity
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '5000000',
        shortOpenInterest: '4500000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.liquidity.utilizationRatio).toBeCloseTo(1.0, 5);
    });

    it('should cap price impact at 1.0', () => {
      // Given - over-utilized market
      const gmxData: GMXMarketData = {
        marketAddress: '0x1234',
        symbol: 'ETH-USD',
        indexPrice: '2000.00',
        markPrice: '2001.50',
        longOpenInterest: '10000000',
        shortOpenInterest: '9000000',
        fundingRate: '0.0001',
        liquidityLong: '5000000',
        liquidityShort: '4500000',
        timestamp: 1700000000,
      };

      // When
      const result = service.normalize({ gmxMarketData: gmxData });

      // Then
      expect(result.derived.priceImpact).toBeLessThanOrEqual(1.0);
    });
  });
});
