import type { PriceData, OracleData, HistoricalDataOptions } from '../types/common.js';

export interface GMXPrice {
  token: string;
  minPrice: string;
  maxPrice: string;
  timestamp: number;
}

export interface GMXOraclePrice {
  token: string;
  price: string;
  timestamp: number;
  blockNumber: number;
  oracleDecimals: number;
}

export class GMXRESTClient {
  constructor(
    private baseUrl: string,
    private chainId: number = 42161,
  ) {}

  async getLatestPrice(token: string): Promise<PriceData> {
    const response = await fetch(
      `${this.baseUrl}/prices/latest?token=${token}&chainId=${this.chainId}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch latest price: ${response.statusText}`);
    }

    const data = (await response.json()) as GMXPrice;

    const minPrice = parseFloat(data.minPrice);
    const maxPrice = parseFloat(data.maxPrice);
    const midPrice = (minPrice + maxPrice) / 2;

    return {
      symbol: data.token,
      price: midPrice,
      timestamp: data.timestamp,
      source: 'gmx',
    };
  }

  async getLatestOracle(token: string): Promise<OracleData> {
    const response = await fetch(
      `${this.baseUrl}/oracle/latest?token=${token}&chainId=${this.chainId}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch latest oracle data: ${response.statusText}`);
    }

    const data = (await response.json()) as GMXOraclePrice;

    return {
      feedId: data.token,
      value: BigInt(data.price),
      timestamp: data.timestamp,
      decimals: data.oracleDecimals,
      source: 'gmx',
    };
  }

  async getHistoricalPrices(options: HistoricalDataOptions): Promise<PriceData[]> {
    const params = new URLSearchParams({
      token: options.feedId,
      chainId: this.chainId.toString(),
      ...(options.startTime && { startTime: options.startTime.toString() }),
      ...(options.endTime && { endTime: options.endTime.toString() }),
      ...(options.limit && { limit: options.limit.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/prices/historical?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch historical prices: ${response.statusText}`);
    }

    const data = (await response.json()) as GMXPrice[];

    return data.map((item) => {
      const minPrice = parseFloat(item.minPrice);
      const maxPrice = parseFloat(item.maxPrice);
      const midPrice = (minPrice + maxPrice) / 2;

      return {
        symbol: item.token,
        price: midPrice,
        timestamp: item.timestamp,
        source: 'gmx',
      };
    });
  }

  async getHistoricalOracles(options: HistoricalDataOptions): Promise<OracleData[]> {
    const params = new URLSearchParams({
      token: options.feedId,
      chainId: this.chainId.toString(),
      ...(options.startTime && { startTime: options.startTime.toString() }),
      ...(options.endTime && { endTime: options.endTime.toString() }),
      ...(options.limit && { limit: options.limit.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/oracle/historical?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch historical oracle data: ${response.statusText}`);
    }

    const data = (await response.json()) as GMXOraclePrice[];

    return data.map((item) => ({
      feedId: item.token,
      value: BigInt(item.price),
      timestamp: item.timestamp,
      decimals: item.oracleDecimals,
      source: 'gmx',
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
