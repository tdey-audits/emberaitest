import WebSocket from 'ws';
import { FeedStatus } from '../types/common.js';
import type { FeedClient, FeedOptions, PriceData, OracleData } from '../types/common.js';

export interface ChainlinkStreamMessage {
  feedId: string;
  price: string;
  timestamp: number;
  observationsTimestamp: number;
  bid?: string;
  ask?: string;
}

export class ChainlinkWSClient implements FeedClient {
  private ws: WebSocket | null = null;
  private status: FeedStatus = FeedStatus.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private subscribedFeeds = new Set<string>();

  private priceCallbacks: Array<(data: PriceData) => void> = [];
  private oracleCallbacks: Array<(data: OracleData) => void> = [];
  private statusCallbacks: Array<(status: FeedStatus) => void> = [];
  private errorCallbacks: Array<(error: Error) => void> = [];

  constructor(
    private wsUrl: string,
    private apiKey: string,
    private options: FeedOptions = {},
  ) {
    this.options = {
      reconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000,
      maxReconnectAttempts: 10,
      timeout: 30000,
      ...options,
    };
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus(FeedStatus.CONNECTING);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl, {
          headers: {
            'X-API-Key': this.apiKey,
          },
        });

        const timeout = setTimeout(() => {
          this.ws?.terminate();
          reject(new Error('Connection timeout'));
        }, this.options.timeout);

        this.ws.on('open', () => {
          clearTimeout(timeout);
          this.setStatus(FeedStatus.CONNECTED);
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          this.handleDisconnect();
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          this.handleError(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus(FeedStatus.DISCONNECTED);
    this.subscribedFeeds.clear();
  }

  async subscribe(feedId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.subscribedFeeds.add(feedId);

    this.ws.send(
      JSON.stringify({
        type: 'subscribe',
        feedIds: [feedId],
      }),
    );
  }

  async unsubscribe(feedId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.subscribedFeeds.delete(feedId);

    this.ws.send(
      JSON.stringify({
        type: 'unsubscribe',
        feedIds: [feedId],
      }),
    );
  }

  getStatus(): FeedStatus {
    return this.status;
  }

  onPrice(callback: (data: PriceData) => void): void {
    this.priceCallbacks.push(callback);
  }

  onOracle(callback: (data: OracleData) => void): void {
    this.oracleCallbacks.push(callback);
  }

  onStatusChange(callback: (status: FeedStatus) => void): void {
    this.statusCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ChainlinkStreamMessage;

      const priceData: PriceData = {
        symbol: message.feedId,
        price: parseFloat(message.price),
        timestamp: message.timestamp,
        source: 'chainlink',
      };

      this.priceCallbacks.forEach((cb) => cb(priceData));

      const oracleData: OracleData = {
        feedId: message.feedId,
        value: BigInt(message.price),
        timestamp: message.timestamp,
        decimals: 18,
        source: 'chainlink',
      };

      this.oracleCallbacks.forEach((cb) => cb(oracleData));
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Failed to parse message'));
    }
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.setStatus(FeedStatus.DISCONNECTED);

    if (
      this.options.reconnect &&
      this.reconnectAttempts < (this.options.maxReconnectAttempts ?? 10)
    ) {
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    this.setStatus(FeedStatus.RECONNECTING);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect()
        .then(() => {
          for (const feedId of this.subscribedFeeds) {
            this.subscribe(feedId).catch((error) => this.handleError(error));
          }
        })
        .catch((error) => {
          this.handleError(error);
        });
    }, this.options.reconnectInterval);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(status: FeedStatus): void {
    this.status = status;
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  private handleError(error: Error): void {
    this.setStatus(FeedStatus.ERROR);
    this.errorCallbacks.forEach((cb) => cb(error));
  }
}
