export interface PriceData {
  symbol: string;
  price: number;
  timestamp: number;
  source: 'chainlink' | 'gmx';
  confidence?: number;
}

export interface OracleData {
  feedId: string;
  value: bigint;
  timestamp: number;
  decimals: number;
  source: 'chainlink' | 'gmx';
}

export enum FeedStatus {
  CONNECTED = 'connected',
  CONNECTING = 'connecting',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export interface FeedOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  maxReconnectAttempts?: number;
  timeout?: number;
}

export interface FeedClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(feedId: string): Promise<void>;
  unsubscribe(feedId: string): Promise<void>;
  getStatus(): FeedStatus;
  onPrice(callback: (data: PriceData) => void): void;
  onOracle(callback: (data: OracleData) => void): void;
  onStatusChange(callback: (status: FeedStatus) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface HistoricalDataOptions {
  feedId: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}
