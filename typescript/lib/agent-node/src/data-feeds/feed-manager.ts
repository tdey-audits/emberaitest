import { FeedStatus } from './types/common.js';
import type { PriceData, OracleData, CacheStore, HistoricalDataOptions } from './types/common.js';
import { ChainlinkWSClient } from './chainlink/ws-client.js';
import { ChainlinkRESTClient } from './chainlink/rest-client.js';
import { GMXWSClient } from './gmx/ws-client.js';
import { GMXRESTClient } from './gmx/rest-client.js';
import { InMemoryCache } from './cache/in-memory-cache.js';

export interface FeedManagerConfig {
  chainlink?: {
    wsUrl: string;
    restUrl: string;
    apiKey: string;
  };
  gmx?: {
    wsUrl: string;
    restUrl: string;
    chainId?: number;
  };
  cache?: CacheStore;
  cacheTTL?: number;
  useWebSocket?: boolean;
}

export class FeedManager {
  private chainlinkWS?: ChainlinkWSClient;
  private chainlinkREST?: ChainlinkRESTClient;
  private gmxWS?: GMXWSClient;
  private gmxREST?: GMXRESTClient;
  private cache: CacheStore;
  private cacheTTL: number;
  private useWebSocket: boolean;

  private priceCallbacks: Array<(data: PriceData) => void> = [];
  private oracleCallbacks: Array<(data: OracleData) => void> = [];

  constructor(config: FeedManagerConfig) {
    this.cache = config.cache ?? new InMemoryCache();
    this.cacheTTL = config.cacheTTL ?? 60000;
    this.useWebSocket = config.useWebSocket ?? true;

    if (config.chainlink) {
      this.chainlinkWS = new ChainlinkWSClient(config.chainlink.wsUrl, config.chainlink.apiKey);
      this.chainlinkREST = new ChainlinkRESTClient(
        config.chainlink.restUrl,
        config.chainlink.apiKey,
      );

      if (this.useWebSocket) {
        this.chainlinkWS.onPrice((data) => this.handlePriceUpdate(data));
        this.chainlinkWS.onOracle((data) => this.handleOracleUpdate(data));
      }
    }

    if (config.gmx) {
      this.gmxWS = new GMXWSClient(config.gmx.wsUrl);
      this.gmxREST = new GMXRESTClient(config.gmx.restUrl, config.gmx.chainId);

      if (this.useWebSocket) {
        this.gmxWS.onPrice((data) => this.handlePriceUpdate(data));
        this.gmxWS.onOracle((data) => this.handleOracleUpdate(data));
      }
    }
  }

  async connect(): Promise<void> {
    const connections: Array<Promise<void>> = [];

    if (this.useWebSocket) {
      if (this.chainlinkWS) {
        connections.push(this.chainlinkWS.connect());
      }
      if (this.gmxWS) {
        connections.push(this.gmxWS.connect());
      }
    }

    await Promise.all(connections);
  }

  async disconnect(): Promise<void> {
    const disconnections: Array<Promise<void>> = [];

    if (this.chainlinkWS) {
      disconnections.push(this.chainlinkWS.disconnect());
    }
    if (this.gmxWS) {
      disconnections.push(this.gmxWS.disconnect());
    }

    await Promise.all(disconnections);
  }

  async subscribeChainlink(feedId: string): Promise<void> {
    if (!this.chainlinkWS) {
      throw new Error('Chainlink client not configured');
    }

    if (this.useWebSocket) {
      await this.chainlinkWS.subscribe(feedId);
    }

    await this.seedHistoricalData('chainlink', feedId);
  }

  async subscribeGMX(token: string): Promise<void> {
    if (!this.gmxWS) {
      throw new Error('GMX client not configured');
    }

    if (this.useWebSocket) {
      await this.gmxWS.subscribe(token);
    }

    await this.seedHistoricalData('gmx', token);
  }

  async getLatestPrice(source: 'chainlink' | 'gmx', feedId: string): Promise<PriceData> {
    const cacheKey = `price:${source}:${feedId}`;
    const cached = await this.cache.get<PriceData>(cacheKey);

    if (cached) {
      return cached;
    }

    let price: PriceData;

    if (source === 'chainlink') {
      if (!this.chainlinkREST) {
        throw new Error('Chainlink REST client not configured');
      }
      price = await this.chainlinkREST.getLatestPrice(feedId);
    } else {
      if (!this.gmxREST) {
        throw new Error('GMX REST client not configured');
      }
      price = await this.gmxREST.getLatestPrice(feedId);
    }

    await this.cache.set(cacheKey, price, this.cacheTTL);
    return price;
  }

  async getLatestOracle(source: 'chainlink' | 'gmx', feedId: string): Promise<OracleData> {
    const cacheKey = `oracle:${source}:${feedId}`;
    const cached = await this.cache.get<OracleData>(cacheKey);

    if (cached) {
      return cached;
    }

    let oracle: OracleData;

    if (source === 'chainlink') {
      if (!this.chainlinkREST) {
        throw new Error('Chainlink REST client not configured');
      }
      oracle = await this.chainlinkREST.getLatestOracle(feedId);
    } else {
      if (!this.gmxREST) {
        throw new Error('GMX REST client not configured');
      }
      oracle = await this.gmxREST.getLatestOracle(feedId);
    }

    await this.cache.set(cacheKey, oracle, this.cacheTTL);
    return oracle;
  }

  async getHistoricalPrices(
    source: 'chainlink' | 'gmx',
    options: HistoricalDataOptions,
  ): Promise<PriceData[]> {
    if (source === 'chainlink') {
      if (!this.chainlinkREST) {
        throw new Error('Chainlink REST client not configured');
      }
      return this.chainlinkREST.getHistoricalPrices(options);
    } else {
      if (!this.gmxREST) {
        throw new Error('GMX REST client not configured');
      }
      return this.gmxREST.getHistoricalPrices(options);
    }
  }

  async getHistoricalOracles(
    source: 'chainlink' | 'gmx',
    options: HistoricalDataOptions,
  ): Promise<OracleData[]> {
    if (source === 'chainlink') {
      if (!this.chainlinkREST) {
        throw new Error('Chainlink REST client not configured');
      }
      return this.chainlinkREST.getHistoricalOracles(options);
    } else {
      if (!this.gmxREST) {
        throw new Error('GMX REST client not configured');
      }
      return this.gmxREST.getHistoricalOracles(options);
    }
  }

  getStatus(source: 'chainlink' | 'gmx'): FeedStatus {
    if (source === 'chainlink' && this.chainlinkWS) {
      return this.chainlinkWS.getStatus();
    }
    if (source === 'gmx' && this.gmxWS) {
      return this.gmxWS.getStatus();
    }
    return FeedStatus.DISCONNECTED;
  }

  onPrice(callback: (data: PriceData) => void): void {
    this.priceCallbacks.push(callback);
  }

  onOracle(callback: (data: OracleData) => void): void {
    this.oracleCallbacks.push(callback);
  }

  private handlePriceUpdate(data: PriceData): void {
    const cacheKey = `price:${data.source}:${data.symbol}`;
    this.cache.set(cacheKey, data, this.cacheTTL).catch(() => {});

    this.priceCallbacks.forEach((cb) => cb(data));
  }

  private handleOracleUpdate(data: OracleData): void {
    const cacheKey = `oracle:${data.source}:${data.feedId}`;
    this.cache.set(cacheKey, data, this.cacheTTL).catch(() => {});

    this.oracleCallbacks.forEach((cb) => cb(data));
  }

  private async seedHistoricalData(source: 'chainlink' | 'gmx', feedId: string): Promise<void> {
    try {
      const price = await this.getLatestPrice(source, feedId);
      this.handlePriceUpdate(price);

      const oracle = await this.getLatestOracle(source, feedId);
      this.handleOracleUpdate(oracle);
    } catch (error) {
      console.error(`Failed to seed historical data for ${source}:${feedId}`, error);
    }
  }
}
