import { describe, it, expect, beforeEach } from 'vitest';
import { ChainlinkRESTClient } from '../../src/data-feeds/chainlink/rest-client.js';
import { CHAINLINK_BASE_URL } from '../mocks/handlers/data-feeds.js';

describe('ChainlinkRESTClient Integration', () => {
  const BASE_URL = CHAINLINK_BASE_URL;
  const API_KEY = 'test-api-key';

  let client: ChainlinkRESTClient;

  beforeEach(() => {
    client = new ChainlinkRESTClient(BASE_URL, API_KEY);
  });

  describe('getLatestPrice', () => {
    it('should fetch latest price', async () => {
      const price = await client.getLatestPrice('BTC/USD');

      expect(price).toMatchObject({
        symbol: 'BTC/USD',
        source: 'chainlink',
      });
      expect(price.price).toBeGreaterThan(0);
      expect(price.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getLatestOracle', () => {
    it('should fetch latest oracle data', async () => {
      const oracle = await client.getLatestOracle('BTC/USD');

      expect(oracle).toMatchObject({
        feedId: 'BTC/USD',
        source: 'chainlink',
        decimals: 18,
      });
      expect(oracle.value).toBeGreaterThan(0n);
      expect(oracle.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getHistoricalPrices', () => {
    it('should fetch historical prices', async () => {
      const prices = await client.getHistoricalPrices({
        feedId: 'BTC/USD',
        limit: 5,
      });

      expect(prices).toHaveLength(5);
      expect(prices[0]).toMatchObject({
        symbol: 'BTC/USD',
        source: 'chainlink',
      });
    });

    it('should fetch historical prices with time range', async () => {
      const endTime = Date.now();
      const startTime = endTime - 3600000;

      const prices = await client.getHistoricalPrices({
        feedId: 'BTC/USD',
        startTime,
        endTime,
        limit: 10,
      });

      expect(Array.isArray(prices)).toBe(true);
      expect(prices.length).toBeGreaterThan(0);
    });
  });

  describe('getHistoricalOracles', () => {
    it('should fetch historical oracle data', async () => {
      const oracles = await client.getHistoricalOracles({
        feedId: 'BTC/USD',
        limit: 5,
      });

      expect(oracles).toHaveLength(5);
      expect(oracles[0]).toMatchObject({
        feedId: 'BTC/USD',
        source: 'chainlink',
        decimals: 18,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy service', async () => {
      const healthy = await client.healthCheck();

      expect(healthy).toBe(true);
    });
  });
});
