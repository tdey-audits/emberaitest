import { randomUUID } from 'crypto';
import {
  MarketDataSnapshot,
  NormalizedMarketState,
  WindowConfig,
  WindowAnalytics,
} from './schemas.js';
import { NormalizationService, DataSource } from './normalization-service.js';
import { RollingWindowAnalytics } from './rolling-window-analytics.js';

export interface StateUpdateListener {
  onStateUpdate(snapshot: MarketDataSnapshot): void | Promise<void>;
}

export interface PersistenceAdapter {
  save(snapshot: MarketDataSnapshot): Promise<void>;
  load(id: string): Promise<MarketDataSnapshot | null>;
  list(options?: ListOptions): Promise<{ snapshots: MarketDataSnapshot[]; hasMore: boolean }>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  startTime?: number;
  endTime?: number;
  symbols?: string[];
}

export interface StateAggregationConfig {
  windowConfigs: WindowConfig[];
  retentionPeriod?: number;
  publishInterval?: number;
  version?: string;
  source?: string;
}

export class StateAggregationService {
  private normalizationService: NormalizationService;
  private rollingWindowAnalytics: RollingWindowAnalytics;
  private listeners: Set<StateUpdateListener> = new Set();
  private persistenceAdapter?: PersistenceAdapter;
  private config: Required<StateAggregationConfig>;
  private publishTimer?: NodeJS.Timeout;

  constructor(config: StateAggregationConfig, persistenceAdapter?: PersistenceAdapter) {
    this.normalizationService = new NormalizationService();
    this.rollingWindowAnalytics = new RollingWindowAnalytics();
    this.persistenceAdapter = persistenceAdapter;
    this.config = {
      ...config,
      retentionPeriod: config.retentionPeriod ?? 7 * 24 * 60 * 60,
      publishInterval: config.publishInterval ?? 60,
      version: config.version ?? '1.0.0',
      source: config.source ?? 'market-data-pipeline',
    };
  }

  /**
   * Processes raw market data and updates state
   */
  async processMarketData(dataSources: DataSource[]): Promise<void> {
    const startTime = Date.now();

    const normalizedStates = this.normalizationService.batchNormalize(dataSources);

    for (const state of normalizedStates) {
      this.rollingWindowAnalytics.addDataPoint(state);
    }

    const snapshot = await this.createSnapshot(normalizedStates, startTime);

    await this.publishSnapshot(snapshot);
  }

  /**
   * Creates a market data snapshot with window analytics
   */
  private async createSnapshot(
    markets: NormalizedMarketState[],
    startTime: number,
  ): Promise<MarketDataSnapshot> {
    const windows: Record<string, WindowAnalytics> = {};

    for (const market of markets) {
      const symbolWindows = this.rollingWindowAnalytics.computeMultipleWindows(
        market.symbol,
        this.config.windowConfigs,
      );

      for (const [label, analytics] of Object.entries(symbolWindows)) {
        windows[`${market.symbol}:${label}`] = analytics;
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      id: randomUUID(),
      timestamp: Math.floor(Date.now() / 1000),
      markets,
      windows,
      metadata: {
        version: this.config.version,
        source: this.config.source,
        processingTime,
      },
    };
  }

  /**
   * Publishes snapshot to all listeners and persistence
   */
  private async publishSnapshot(snapshot: MarketDataSnapshot): Promise<void> {
    const publishPromises: Promise<void>[] = [];

    for (const listener of this.listeners) {
      // Wrap in a promise to catch synchronous errors
      publishPromises.push(
        (async () => {
          try {
            await listener.onStateUpdate(snapshot);
          } catch (error) {
            // Log error but don't propagate
            console.error('Listener error:', error);
          }
        })(),
      );
    }

    if (this.persistenceAdapter) {
      publishPromises.push(this.persistenceAdapter.save(snapshot));
    }

    await Promise.allSettled(publishPromises);
  }

  /**
   * Subscribes a listener to state updates
   */
  subscribe(listener: StateUpdateListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Starts automatic snapshot publishing at configured interval
   */
  startAutoPublish(): void {
    if (this.publishTimer) {
      return;
    }

    this.publishTimer = setInterval(async () => {
      const symbols = this.rollingWindowAnalytics.getAvailableSymbols();
      if (symbols.length === 0) {
        return;
      }

      const snapshot = await this.createSnapshot([], Date.now());
      await this.publishSnapshot(snapshot);
    }, this.config.publishInterval * 1000);
  }

  /**
   * Stops automatic snapshot publishing
   */
  stopAutoPublish(): void {
    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = undefined;
    }
  }

  /**
   * Prunes old data beyond retention period
   */
  pruneOldData(): void {
    this.rollingWindowAnalytics.pruneOldData(this.config.retentionPeriod);
  }

  /**
   * Loads a snapshot from persistence
   */
  async loadSnapshot(id: string): Promise<MarketDataSnapshot | null> {
    if (!this.persistenceAdapter) {
      throw new Error('Persistence adapter not configured');
    }
    return this.persistenceAdapter.load(id);
  }

  /**
   * Lists snapshots from persistence
   */
  async listSnapshots(
    options?: ListOptions,
  ): Promise<{ snapshots: MarketDataSnapshot[]; hasMore: boolean }> {
    if (!this.persistenceAdapter) {
      throw new Error('Persistence adapter not configured');
    }
    return this.persistenceAdapter.list(options);
  }

  /**
   * Gets current analytics for a symbol
   */
  getCurrentAnalytics(symbol: string): Record<string, WindowAnalytics> {
    return this.rollingWindowAnalytics.computeMultipleWindows(symbol, this.config.windowConfigs);
  }

  /**
   * Gets available symbols
   */
  getAvailableSymbols(): string[] {
    return this.rollingWindowAnalytics.getAvailableSymbols();
  }

  /**
   * Clears all in-memory data
   */
  clear(): void {
    this.rollingWindowAnalytics.clear();
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopAutoPublish();
    this.listeners.clear();
  }
}
