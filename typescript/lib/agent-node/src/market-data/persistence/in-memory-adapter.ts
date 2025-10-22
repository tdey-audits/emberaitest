import { MarketDataSnapshot } from '../schemas.js';
import { PersistenceAdapter, ListOptions } from '../state-aggregation-service.js';

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private snapshots: Map<string, MarketDataSnapshot> = new Map();
  private snapshotsByTime: Array<{
    id: string;
    timestamp: number;
  }> = [];

  async save(snapshot: MarketDataSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);

    this.snapshotsByTime.push({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
    });

    this.snapshotsByTime.sort((a, b) => b.timestamp - a.timestamp);
  }

  async load(id: string): Promise<MarketDataSnapshot | null> {
    return this.snapshots.get(id) ?? null;
  }

  async list(
    options: ListOptions = {},
  ): Promise<{ snapshots: MarketDataSnapshot[]; hasMore: boolean }> {
    const { limit = 50, offset = 0, startTime, endTime, symbols } = options;

    let filtered = this.snapshotsByTime;

    if (startTime !== undefined || endTime !== undefined) {
      filtered = filtered.filter((entry) => {
        if (startTime !== undefined && entry.timestamp < startTime) {
          return false;
        }
        if (endTime !== undefined && entry.timestamp > endTime) {
          return false;
        }
        return true;
      });
    }

    if (symbols && symbols.length > 0) {
      const symbolSet = new Set(symbols);
      filtered = filtered.filter((entry) => {
        const snapshot = this.snapshots.get(entry.id);
        return snapshot?.markets.some((m) => symbolSet.has(m.symbol));
      });
    }

    const paginatedIds = filtered.slice(offset, offset + limit);
    const snapshots = paginatedIds
      .map((entry) => this.snapshots.get(entry.id))
      .filter((s): s is MarketDataSnapshot => s !== undefined);

    const hasMore = offset + limit < filtered.length;

    return { snapshots, hasMore };
  }

  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  clear(): void {
    this.snapshots.clear();
    this.snapshotsByTime = [];
  }
}
