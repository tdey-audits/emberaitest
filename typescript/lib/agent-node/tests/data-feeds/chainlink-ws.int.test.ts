import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ChainlinkWSClient } from '../../src/data-feeds/chainlink/ws-client.js';
import { FeedStatus } from '../../src/data-feeds/types/common.js';
import { MockWebSocketServer } from '../utils/mock-websocket-server.js';

describe('ChainlinkWSClient Integration', () => {
  const WS_PORT = 8765;
  const WS_URL = `ws://localhost:${WS_PORT}`;
  const API_KEY = 'test-api-key';

  let mockServer: MockWebSocketServer;
  let client: ChainlinkWSClient;

  beforeAll(async () => {
    mockServer = new MockWebSocketServer(WS_PORT);
  });

  afterAll(async () => {
    await mockServer.close();
  });

  beforeEach(() => {
    client = new ChainlinkWSClient(WS_URL, API_KEY, {
      reconnect: false,
      heartbeatInterval: 1000,
    });
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      await client.connect();

      expect(client.getStatus()).toBe(FeedStatus.CONNECTED);

      await client.disconnect();
    });

    it('should handle disconnection', async () => {
      await client.connect();
      await client.disconnect();

      expect(client.getStatus()).toBe(FeedStatus.DISCONNECTED);
    });

    it('should notify status changes', async () => {
      const statuses: FeedStatus[] = [];

      client.onStatusChange((status) => {
        statuses.push(status);
      });

      await client.connect();
      await client.disconnect();

      expect(statuses).toContain(FeedStatus.CONNECTING);
      expect(statuses).toContain(FeedStatus.CONNECTED);
      expect(statuses).toContain(FeedStatus.DISCONNECTED);
    });
  });

  describe('subscription', () => {
    it('should subscribe to a feed', async () => {
      let subscribeMessage: unknown = null;

      mockServer.onMessage((_ws, message) => {
        subscribeMessage = JSON.parse(message);
      });

      await client.connect();
      await client.subscribe('BTC/USD');

      expect(subscribeMessage).toEqual({
        type: 'subscribe',
        feedIds: ['BTC/USD'],
      });

      await client.disconnect();
    });

    it('should unsubscribe from a feed', async () => {
      let unsubscribeMessage: unknown = null;

      mockServer.onMessage((_ws, message) => {
        const parsed = JSON.parse(message);
        if (parsed.type === 'unsubscribe') {
          unsubscribeMessage = parsed;
        }
      });

      await client.connect();
      await client.subscribe('BTC/USD');
      await client.unsubscribe('BTC/USD');

      expect(unsubscribeMessage).toEqual({
        type: 'unsubscribe',
        feedIds: ['BTC/USD'],
      });

      await client.disconnect();
    });
  });

  describe('message handling', () => {
    it('should handle price updates', async () => {
      const priceUpdates: unknown[] = [];

      client.onPrice((data) => {
        priceUpdates.push(data);
      });

      await client.connect();

      mockServer.broadcast(
        JSON.stringify({
          feedId: 'BTC/USD',
          price: '50000000000000000000000',
          timestamp: Date.now(),
          observationsTimestamp: Date.now(),
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(priceUpdates).toHaveLength(1);
      expect(priceUpdates[0]).toMatchObject({
        symbol: 'BTC/USD',
        price: 50000,
        source: 'chainlink',
      });

      await client.disconnect();
    });

    it('should handle oracle updates', async () => {
      const oracleUpdates: unknown[] = [];

      client.onOracle((data) => {
        oracleUpdates.push(data);
      });

      await client.connect();

      mockServer.broadcast(
        JSON.stringify({
          feedId: 'BTC/USD',
          price: '50000000000000000000000',
          timestamp: Date.now(),
          observationsTimestamp: Date.now(),
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(oracleUpdates).toHaveLength(1);
      expect(oracleUpdates[0]).toMatchObject({
        feedId: 'BTC/USD',
        source: 'chainlink',
        decimals: 18,
      });

      await client.disconnect();
    });

    it('should handle multiple updates', async () => {
      const priceUpdates: unknown[] = [];

      client.onPrice((data) => {
        priceUpdates.push(data);
      });

      await client.connect();

      for (let i = 0; i < 5; i++) {
        mockServer.broadcast(
          JSON.stringify({
            feedId: 'BTC/USD',
            price: `${50000 + i}000000000000000000000`,
            timestamp: Date.now(),
            observationsTimestamp: Date.now(),
          }),
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(priceUpdates).toHaveLength(5);

      await client.disconnect();
    });
  });

  describe('error handling', () => {
    it('should handle malformed messages', async () => {
      const errors: Error[] = [];

      client.onError((error) => {
        errors.push(error);
      });

      await client.connect();

      mockServer.broadcast('invalid json');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors.length).toBeGreaterThan(0);

      await client.disconnect();
    });

    it('should throw when subscribing while disconnected', async () => {
      await expect(client.subscribe('BTC/USD')).rejects.toThrow('WebSocket not connected');
    });

    it('should throw when unsubscribing while disconnected', async () => {
      await expect(client.unsubscribe('BTC/USD')).rejects.toThrow('WebSocket not connected');
    });
  });
});
