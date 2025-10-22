export { FeedManager, type FeedManagerConfig } from './feed-manager.js';
export { ChainlinkWSClient, type ChainlinkStreamMessage } from './chainlink/ws-client.js';
export { ChainlinkRESTClient, type ChainlinkPriceFeed } from './chainlink/rest-client.js';
export { GMXWSClient, type GMXPriceUpdate, type GMXOracleUpdate } from './gmx/ws-client.js';
export { GMXRESTClient, type GMXPrice, type GMXOraclePrice } from './gmx/rest-client.js';
export { InMemoryCache } from './cache/in-memory-cache.js';
export { RedisCache } from './cache/redis-cache.js';
export type {
  PriceData,
  OracleData,
  FeedStatus,
  FeedOptions,
  FeedClient,
  HistoricalDataOptions,
  CacheEntry,
  CacheStore,
} from './types/common.js';
