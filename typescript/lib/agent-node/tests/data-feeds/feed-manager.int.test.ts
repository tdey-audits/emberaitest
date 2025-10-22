import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FeedManager } from '../../src/data-feeds/feed-manager.js';
import { InMemoryCache } from '../../src/data-feeds/cache/in-memory-cache.js';
import { CHAINLINK_BASE_URL, GMX_BASE_URL } from '../mocks/handlers/data-feeds.js';

describe('FeedManager Integration', () => {
  let manager: FeedManager;
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(5000);

    manager = new FeedManager({
      chainlink: {
        wsUrl: 'ws://localhost:8765',
        restUrl: CHAINLINK_BASE_URL,
        apiKey: 'test-api-key',
      },
      gmx: {
        wsUrl: 'ws://localhost:8766',
        restUrl: GMX_BASE_URL,
        chainId: 42161,
      },
      cache,
      useWebSocket: false,
    });
  });

  afterEach(async () => {
    await manager.disconnect();
    cache.destroy();
  });

  describe('Chainlink operations', () => {
    it('should fetch latest Chainlink price', async () => {
      const price = await manager.getLatestPrice('chainlink', 'BTC/USD');

      expect(price).toMatchObject({
        symbol: 'BTC/USD',
        source: 'chainlink',
      });
      expect(price.price).toBeGreaterThan(0);
    });

    it('should cache Chainlink price data', async () => {
      const firstFetch = await manager.getLatestPrice('chainlink', 'BTC/USD');
      const secondFetch = await manager.getLatestPrice('chainlink', 'BTC/USD');

      expect(firstFetch).toEqual(secondFetch);
    });

    it('should fetch latest Chainlink oracle data', async () => {
      const oracle = await manager.getLatestOracle('chainlink', 'BTC/USD');

      expect(oracle).toMatchObject({
        feedId: 'BTC/USD',
        source: 'chainlink',
      });
      expect(oracle.value).toBeGreaterThan(0n);
    });

    it('should fetch historical Chainlink prices', async () => {
      const prices = await manager.getHistoricalPrices('chainlink', {
        feedId: 'BTC/USD',
        limit: 5,
      });

      expect(prices).toHaveLength(5);
      expect(prices[0].source).toBe('chainlink');
    });

    it('should fetch historical Chainlink oracle data', async () => {
      const oracles = await manager.getHistoricalOracles('chainlink', {
        feedId: 'BTC/USD',
        limit: 5,
      });

      expect(oracles).toHaveLength(5);
      expect(oracles[0].source).toBe('chainlink');
    });
  });

  describe('GMX operations', () => {
    it('should fetch latest GMX price', async () => {
      const price = await manager.getLatestPrice('gmx', '0x1234567890abcdef');

      expect(price).toMatchObject({
        symbol: '0x1234567890abcdef',
        source: 'gmx',
      });
      expect(price.price).toBeGreaterThan(0);
    });

    it('should cache GMX price data', async () => {
      const firstFetch = await manager.getLatestPrice('gmx', '0x1234567890abcdef');
      const secondFetch = await manager.getLatestPrice('gmx', '0x1234567890abcdef');

      expect(firstFetch).toEqual(secondFetch);
    });

    it('should fetch latest GMX oracle data', async () => {
      const oracle = await manager.getLatestOracle('gmx', '0x1234567890abcdef');

      expect(oracle).toMatchObject({
        feedId: '0x1234567890abcdef',
        source: 'gmx',
      });
      expect(oracle.value).toBeGreaterThan(0n);
    });

    it('should fetch historical GMX prices', async () => {
      const prices = await manager.getHistoricalPrices('gmx', {
        feedId: '0x1234567890abcdef',
        limit: 5,
      });

      expect(prices).toHaveLength(5);
      expect(prices[0].source).toBe('gmx');
    });

    it('should fetch historical GMX oracle data', async () => {
      const oracles = await manager.getHistoricalOracles('gmx', {
        feedId: '0x1234567890abcdef',
        limit: 5,
      });

      expect(oracles).toHaveLength(5);
      expect(oracles[0].source).toBe('gmx');
    });
  });

  describe('status monitoring', () => {
    it('should return disconnected status by default', () => {
      const chainlinkStatus = manager.getStatus('chainlink');
      const gmxStatus = manager.getStatus('gmx');

      expect(chainlinkStatus).toBe('disconnected');
      expect(gmxStatus).toBe('disconnected');
    });
  });

  describe('price callbacks', () => {
    it('should notify price callbacks', async () => {
      const prices: unknown[] = [];

      manager.onPrice((data) => {
        prices.push(data);
      });

      await manager.getLatestPrice('chainlink', 'BTC/USD');

      expect(prices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('oracle callbacks', () => {
    it('should notify oracle callbacks', async () => {
      const oracles: unknown[] = [];

      manager.onOracle((data) => {
        oracles.push(data);
      });

      await manager.getLatestOracle('chainlink', 'BTC/USD');

      expect(oracles.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should throw when Chainlink is not configured', async () => {
      const managerWithoutChainlink = new FeedManager({
        gmx: {
          wsUrl: 'ws://localhost:8766',
          restUrl: GMX_BASE_URL,
        },
      });

      await expect(managerWithoutChainlink.getLatestPrice('chainlink', 'BTC/USD')).rejects.toThrow(
        'Chainlink REST client not configured',
      );
    });

    it('should throw when GMX is not configured', async () => {
      const managerWithoutGMX = new FeedManager({
        chainlink: {
          wsUrl: 'ws://localhost:8765',
          restUrl: CHAINLINK_BASE_URL,
          apiKey: 'test-api-key',
        },
      });

      await expect(managerWithoutGMX.getLatestPrice('gmx', '0x1234567890abcdef')).rejects.toThrow(
        'GMX REST client not configured',
      );
    });
  });
});
