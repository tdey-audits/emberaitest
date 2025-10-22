# Real-Time Market & Oracle Data Feeds

This module provides real-time market and oracle data feeds integration for Chainlink Data Streams and GMX oracle feeds. It includes WebSocket clients for real-time updates, REST clients for fallback and historical data, and a caching layer for optimal performance.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Monitoring](#monitoring)

## Features

### WebSocket Clients

- **Real-time streaming**: Receive live price and oracle updates via WebSocket
- **Automatic reconnection**: Configurable reconnection logic with exponential backoff
- **Heartbeat monitoring**: Periodic ping/pong to detect stale connections
- **Subscription management**: Subscribe/unsubscribe to specific feeds dynamically

### REST Clients

- **Fallback mechanism**: Use REST APIs when WebSocket is unavailable
- **Historical data**: Fetch historical price and oracle data with time ranges
- **Health checks**: Monitor API availability
- **Rate limiting**: Built-in error handling and retries

### Caching Layer

- **In-memory cache**: Fast, local caching with automatic expiration
- **Redis support**: Optional Redis backend for distributed caching
- **Configurable TTL**: Set custom cache expiration per data type
- **Automatic updates**: Cache is updated from WebSocket streams

### Feed Manager

- **Unified interface**: Single API for both Chainlink and GMX feeds
- **State seeding**: Automatically fetch historical data on subscription
- **Event callbacks**: Register callbacks for price/oracle updates
- **Status monitoring**: Track connection status for each feed source

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FeedManager                          │
│  - Unified API for Chainlink & GMX                         │
│  - Connection management                                    │
│  - State seeding from historical data                      │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
    ┌─────────▼─────────┐       ┌────────▼─────────┐
    │   Chainlink       │       │       GMX        │
    │   Clients         │       │     Clients      │
    └─────┬───────┬─────┘       └────┬────────┬────┘
          │       │                  │        │
    ┌─────▼─┐ ┌──▼────┐       ┌─────▼─┐  ┌──▼────┐
    │  WS   │ │ REST  │       │  WS   │  │ REST  │
    │Client │ │Client │       │Client │  │Client │
    └───────┘ └───────┘       └───────┘  └───────┘
                │                    │
                └────────┬───────────┘
                         │
                   ┌─────▼─────┐
                   │   Cache   │
                   │ (In-Memory│
                   │ or Redis) │
                   └───────────┘
```

## Installation

The data feeds module is included in the `agent-node` package. No additional installation is required.

```bash
pnpm install
```

## Configuration

### Environment Variables

Add the following variables to your `.env` file:

```bash
# Chainlink Data Streams
CHAINLINK_WS_URL=wss://streams.chainlink.example.com
CHAINLINK_REST_URL=https://api.chainlink.example.com
CHAINLINK_API_KEY=your-api-key-here

# GMX Oracle Feeds
GMX_WS_URL=wss://api.gmx.io/ws
GMX_REST_URL=https://api.gmx.io
GMX_CHAIN_ID=42161

# Optional: Data feeds configuration
FEEDS_USE_WEBSOCKET=true
FEEDS_CACHE_TTL_MS=60000
FEEDS_RECONNECT_INTERVAL_MS=5000
FEEDS_MAX_RECONNECT_ATTEMPTS=10
FEEDS_HEARTBEAT_INTERVAL_MS=30000
```

### API Keys

#### Chainlink Data Streams

1. Sign up at [Chainlink Data Streams](https://chain.link/data-streams)
2. Create an API key in your dashboard
3. Add the key to `CHAINLINK_API_KEY` in your `.env` file

#### GMX

GMX public feeds do not require an API key. However, for production use, you may want to:

1. Contact GMX team for dedicated endpoints
2. Configure rate limits based on your usage
3. Use a reverse proxy for additional control

## Usage

### Basic Setup

```typescript
import { FeedManager } from './data-feeds/index.js';

const feedManager = new FeedManager({
  chainlink: {
    wsUrl: process.env.CHAINLINK_WS_URL!,
    restUrl: process.env.CHAINLINK_REST_URL!,
    apiKey: process.env.CHAINLINK_API_KEY!,
  },
  gmx: {
    wsUrl: process.env.GMX_WS_URL!,
    restUrl: process.env.GMX_REST_URL!,
    chainId: parseInt(process.env.GMX_CHAIN_ID || '42161', 10),
  },
  useWebSocket: true,
  cacheTTL: 60000,
});

await feedManager.connect();
```

### Subscribe to Feeds

```typescript
// Subscribe to Chainlink feed
await feedManager.subscribeChainlink('BTC/USD');

// Subscribe to GMX feed (use token address)
await feedManager.subscribeGMX('0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f');
```

### Listen for Updates

```typescript
// Listen for price updates
feedManager.onPrice((data) => {
  console.log(`Price update: ${data.symbol} = ${data.price} (${data.source})`);
});

// Listen for oracle updates
feedManager.onOracle((data) => {
  console.log(`Oracle update: ${data.feedId} = ${data.value} (${data.source})`);
});
```

### Fetch Latest Data

```typescript
// Get latest Chainlink price
const chainlinkPrice = await feedManager.getLatestPrice('chainlink', 'BTC/USD');
console.log(chainlinkPrice);

// Get latest GMX price
const gmxPrice = await feedManager.getLatestPrice(
  'gmx',
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
);
console.log(gmxPrice);
```

### Fetch Historical Data

```typescript
// Get historical Chainlink prices
const historicalPrices = await feedManager.getHistoricalPrices('chainlink', {
  feedId: 'BTC/USD',
  startTime: Date.now() - 3600000, // 1 hour ago
  endTime: Date.now(),
  limit: 100,
});

// Get historical GMX oracles
const historicalOracles = await feedManager.getHistoricalOracles('gmx', {
  feedId: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
  limit: 50,
});
```

### Monitor Connection Status

```typescript
// Check Chainlink connection status
const chainlinkStatus = feedManager.getStatus('chainlink');
console.log(`Chainlink status: ${chainlinkStatus}`);

// Check GMX connection status
const gmxStatus = feedManager.getStatus('gmx');
console.log(`GMX status: ${gmxStatus}`);
```

### Custom Caching

```typescript
import { RedisCache } from './data-feeds/cache/redis-cache.js';
import { createClient } from 'redis';

// Use Redis for distributed caching
const redisClient = createClient({ url: 'redis://localhost:6379' });
await redisClient.connect();

const redisCache = new RedisCache(redisClient, 60); // 60 seconds TTL

const feedManager = new FeedManager({
  chainlink: {
    /* config */
  },
  gmx: {
    /* config */
  },
  cache: redisCache,
});
```

### Cleanup

```typescript
// Disconnect when done
await feedManager.disconnect();
```

## API Reference

### FeedManager

#### Constructor

```typescript
constructor(config: FeedManagerConfig)
```

#### Methods

- `connect(): Promise<void>` - Connect to WebSocket feeds
- `disconnect(): Promise<void>` - Disconnect from all feeds
- `subscribeChainlink(feedId: string): Promise<void>` - Subscribe to Chainlink feed
- `subscribeGMX(token: string): Promise<void>` - Subscribe to GMX feed
- `getLatestPrice(source, feedId): Promise<PriceData>` - Get latest price
- `getLatestOracle(source, feedId): Promise<OracleData>` - Get latest oracle data
- `getHistoricalPrices(source, options): Promise<PriceData[]>` - Get historical prices
- `getHistoricalOracles(source, options): Promise<OracleData[]>` - Get historical oracles
- `getStatus(source): FeedStatus` - Get connection status
- `onPrice(callback): void` - Register price update callback
- `onOracle(callback): void` - Register oracle update callback

### ChainlinkWSClient

WebSocket client for Chainlink Data Streams.

#### Constructor

```typescript
constructor(wsUrl: string, apiKey: string, options?: FeedOptions)
```

#### Methods

- `connect(): Promise<void>` - Connect to WebSocket
- `disconnect(): Promise<void>` - Disconnect from WebSocket
- `subscribe(feedId: string): Promise<void>` - Subscribe to a feed
- `unsubscribe(feedId: string): Promise<void>` - Unsubscribe from a feed
- `getStatus(): FeedStatus` - Get connection status
- `onPrice(callback): void` - Register price callback
- `onOracle(callback): void` - Register oracle callback
- `onStatusChange(callback): void` - Register status change callback
- `onError(callback): void` - Register error callback

### ChainlinkRESTClient

REST client for Chainlink Data Streams fallback and historical data.

#### Constructor

```typescript
constructor(baseUrl: string, apiKey: string)
```

#### Methods

- `getLatestPrice(feedId: string): Promise<PriceData>` - Get latest price
- `getLatestOracle(feedId: string): Promise<OracleData>` - Get latest oracle data
- `getHistoricalPrices(options): Promise<PriceData[]>` - Get historical prices
- `getHistoricalOracles(options): Promise<OracleData[]>` - Get historical oracles
- `healthCheck(): Promise<boolean>` - Check API health

### GMXWSClient

WebSocket client for GMX oracle feeds.

Similar API to ChainlinkWSClient (see above).

### GMXRESTClient

REST client for GMX oracle feeds fallback and historical data.

#### Constructor

```typescript
constructor(baseUrl: string, chainId?: number)
```

Methods are similar to ChainlinkRESTClient (see above).

### CacheStore Interface

```typescript
interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}
```

### InMemoryCache

In-memory implementation of CacheStore.

#### Constructor

```typescript
constructor(defaultTTL: number = 60000)
```

#### Methods

- All methods from CacheStore interface
- `destroy(): void` - Cleanup and stop automatic expiration

### RedisCache

Redis implementation of CacheStore.

#### Constructor

```typescript
constructor(client: RedisClient, defaultTTL: number = 60)
```

Methods: All methods from CacheStore interface

## Testing

### Unit Tests

```bash
pnpm test:unit
```

Unit tests cover:

- Cache implementations (in-memory)
- Data type conversions
- Error handling

### Integration Tests

```bash
pnpm test:int
```

Integration tests cover:

- WebSocket client connection and reconnection
- REST client API calls (mocked)
- FeedManager orchestration
- Cache integration

### Mock WebSocket Server

The test suite includes a mock WebSocket server for testing WebSocket functionality:

```typescript
import { MockWebSocketServer } from '../utils/mock-websocket-server.js';

const mockServer = new MockWebSocketServer(8765);

mockServer.onMessage((ws, message) => {
  // Handle incoming messages
});

mockServer.broadcast(
  JSON.stringify({
    /* data */
  }),
);

await mockServer.close();
```

## Monitoring

### Connection Status

Monitor connection status for each feed source:

```typescript
const status = feedManager.getStatus('chainlink');

switch (status) {
  case FeedStatus.CONNECTED:
    console.log('✓ Connected');
    break;
  case FeedStatus.CONNECTING:
    console.log('⋯ Connecting...');
    break;
  case FeedStatus.RECONNECTING:
    console.log('⟳ Reconnecting...');
    break;
  case FeedStatus.DISCONNECTED:
    console.log('✗ Disconnected');
    break;
  case FeedStatus.ERROR:
    console.log('⚠ Error');
    break;
}
```

### Error Tracking

Register error callbacks to track and log errors:

```typescript
const chainlinkWS = new ChainlinkWSClient(wsUrl, apiKey);

chainlinkWS.onError((error) => {
  console.error('Chainlink error:', error);

  // Send to monitoring service
  monitoring.recordError('chainlink-ws', error);
});
```

### Metrics

Track key metrics for monitoring:

- **Connection uptime**: Time connected vs. total time
- **Reconnection attempts**: Number of reconnection attempts
- **Message rate**: Messages received per second
- **Cache hit rate**: Cache hits vs. misses
- **API latency**: REST API response times

Example metrics collection:

```typescript
let messagesReceived = 0;
let cacheHits = 0;
let cacheMisses = 0;

feedManager.onPrice(() => {
  messagesReceived++;
});

// Track cache performance
const originalGet = cache.get.bind(cache);
cache.get = async function <T>(key: string): Promise<T | null> {
  const result = await originalGet<T>(key);
  if (result) {
    cacheHits++;
  } else {
    cacheMisses++;
  }
  return result;
};

// Report metrics every minute
setInterval(() => {
  console.log({
    messagesReceived,
    cacheHitRate: cacheHits / (cacheHits + cacheMisses),
    chainlinkStatus: feedManager.getStatus('chainlink'),
    gmxStatus: feedManager.getStatus('gmx'),
  });
}, 60000);
```

### Health Checks

Implement health check endpoints for monitoring:

```typescript
async function healthCheck() {
  const results = {
    chainlink: {
      ws: feedManager.getStatus('chainlink') === FeedStatus.CONNECTED,
      rest: await chainlinkREST.healthCheck(),
    },
    gmx: {
      ws: feedManager.getStatus('gmx') === FeedStatus.CONNECTED,
      rest: await gmxREST.healthCheck(),
    },
  };

  return {
    healthy: Object.values(results).every((r) => r.ws || r.rest),
    details: results,
  };
}
```

## Best Practices

### 1. Always Use Try-Catch

Wrap feed operations in try-catch blocks:

```typescript
try {
  const price = await feedManager.getLatestPrice('chainlink', 'BTC/USD');
  console.log(price);
} catch (error) {
  console.error('Failed to fetch price:', error);
  // Handle fallback or retry logic
}
```

### 2. Implement Backoff Strategy

For production use, implement exponential backoff for retries:

```typescript
async function fetchWithRetry(fn: () => Promise<unknown>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

### 3. Monitor Cache Performance

Track cache hit rates to optimize TTL settings:

```typescript
if (cacheHitRate < 0.7) {
  console.warn('Low cache hit rate, consider increasing TTL');
}
```

### 4. Graceful Shutdown

Always disconnect feeds on shutdown:

```typescript
process.on('SIGTERM', async () => {
  await feedManager.disconnect();
  process.exit(0);
});
```

### 5. Use Environment-Specific Config

Use different configurations for development, staging, and production:

```typescript
const config = {
  development: {
    useWebSocket: true,
    cacheTTL: 5000,
  },
  production: {
    useWebSocket: true,
    cacheTTL: 60000,
  },
};

const feedManager = new FeedManager(config[process.env.NODE_ENV || 'development']);
```

## Troubleshooting

### WebSocket Connection Failures

**Problem**: WebSocket fails to connect

**Solutions**:

1. Check network connectivity
2. Verify WebSocket URL is correct
3. Ensure API key is valid (for Chainlink)
4. Check firewall rules for WebSocket connections
5. Try REST fallback: `useWebSocket: false`

### High Reconnection Rate

**Problem**: Frequent reconnections

**Solutions**:

1. Increase `heartbeatInterval`
2. Check network stability
3. Verify server-side rate limits
4. Implement exponential backoff

### Cache Not Working

**Problem**: Cache misses are high

**Solutions**:

1. Verify cache TTL is appropriate
2. Check cache key generation
3. Ensure cache store is connected (for Redis)
4. Monitor cache memory usage

### Missing Historical Data

**Problem**: Historical queries return empty results

**Solutions**:

1. Verify time range parameters
2. Check feed ID is correct
3. Ensure API supports historical queries
4. Verify API key has historical data access

## Contributing

When contributing to the data feeds module:

1. Write tests for all new features
2. Update documentation for API changes
3. Follow existing code patterns
4. Run `pnpm lint` and `pnpm build` before submitting
5. Add integration tests for external API interactions

## License

See the project LICENSE file.
