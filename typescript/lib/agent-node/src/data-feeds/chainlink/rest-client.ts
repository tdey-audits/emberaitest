import type { PriceData, OracleData, HistoricalDataOptions } from '../types/common.js';

export interface ChainlinkPriceFeed {
  feedId: string;
  answer: string;
  updatedAt: number;
  decimals: number;
}

export class ChainlinkRESTClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async getLatestPrice(feedId: string): Promise<PriceData> {
    const response = await fetch(`${this.baseUrl}/feeds/${feedId}/latest`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch latest price: ${response.statusText}`);
    }

    const data = (await response.json()) as ChainlinkPriceFeed;

    return {
      symbol: data.feedId,
      price: parseFloat(data.answer) / Math.pow(10, data.decimals),
      timestamp: data.updatedAt,
      source: 'chainlink',
    };
  }

  async getLatestOracle(feedId: string): Promise<OracleData> {
    const response = await fetch(`${this.baseUrl}/feeds/${feedId}/latest`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch latest oracle data: ${response.statusText}`);
    }

    const data = (await response.json()) as ChainlinkPriceFeed;

    return {
      feedId: data.feedId,
      value: BigInt(data.answer),
      timestamp: data.updatedAt,
      decimals: data.decimals,
      source: 'chainlink',
    };
  }

  async getHistoricalPrices(options: HistoricalDataOptions): Promise<PriceData[]> {
    const params = new URLSearchParams({
      feedId: options.feedId,
      ...(options.startTime && { startTime: options.startTime.toString() }),
      ...(options.endTime && { endTime: options.endTime.toString() }),
      ...(options.limit && { limit: options.limit.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/feeds/historical?${params}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch historical prices: ${response.statusText}`);
    }

    const data = (await response.json()) as ChainlinkPriceFeed[];

    return data.map((item) => ({
      symbol: item.feedId,
      price: parseFloat(item.answer) / Math.pow(10, item.decimals),
      timestamp: item.updatedAt,
      source: 'chainlink',
    }));
  }

  async getHistoricalOracles(options: HistoricalDataOptions): Promise<OracleData[]> {
    const params = new URLSearchParams({
      feedId: options.feedId,
      ...(options.startTime && { startTime: options.startTime.toString() }),
      ...(options.endTime && { endTime: options.endTime.toString() }),
      ...(options.limit && { limit: options.limit.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/feeds/historical?${params}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch historical oracle data: ${response.statusText}`);
    }

    const data = (await response.json()) as ChainlinkPriceFeed[];

    return data.map((item) => ({
      feedId: item.feedId,
      value: BigInt(item.answer),
      timestamp: item.updatedAt,
      decimals: item.decimals,
      source: 'chainlink',
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
