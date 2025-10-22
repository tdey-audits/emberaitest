import { describe, it, expect, beforeEach } from 'vitest';
import { GMXRESTClient } from '../../src/data-feeds/gmx/rest-client.js';
import { GMX_BASE_URL } from '../mocks/handlers/data-feeds.js';

describe('GMXRESTClient Integration', () => {
  const BASE_URL = GMX_BASE_URL;
  const CHAIN_ID = 42161;

  let client: GMXRESTClient;

  beforeEach(() => {
    client = new GMXRESTClient(BASE_URL, CHAIN_ID);
  });

  describe('getLatestPrice', () => {
    it('should fetch latest price', async () => {
      const price = await client.getLatestPrice('0x1234567890abcdef');

      expect(price).toMatchObject({
        symbol: '0x1234567890abcdef',
        source: 'gmx',
      });
      expect(price.price).toBeGreaterThan(0);
      expect(price.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getLatestOracle', () => {
    it('should fetch latest oracle data', async () => {
      const oracle = await client.getLatestOracle('0x1234567890abcdef');

      expect(oracle).toMatchObject({
        feedId: '0x1234567890abcdef',
        source: 'gmx',
        decimals: 18,
      });
      expect(oracle.value).toBeGreaterThan(0n);
      expect(oracle.timestamp).toBeGreaterThan(0);
    });
  });

  describe('getHistoricalPrices', () => {
    it('should fetch historical prices', async () => {
      const prices = await client.getHistoricalPrices({
        feedId: '0x1234567890abcdef',
        limit: 5,
      });

      expect(prices).toHaveLength(5);
      expect(prices[0]).toMatchObject({
        symbol: '0x1234567890abcdef',
        source: 'gmx',
      });
    });

    it('should fetch historical prices with time range', async () => {
      const endTime = Date.now();
      const startTime = endTime - 3600000;

      const prices = await client.getHistoricalPrices({
        feedId: '0x1234567890abcdef',
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
        feedId: '0x1234567890abcdef',
        limit: 5,
      });

      expect(oracles).toHaveLength(5);
      expect(oracles[0]).toMatchObject({
        feedId: '0x1234567890abcdef',
        source: 'gmx',
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
