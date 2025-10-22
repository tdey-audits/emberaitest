# Market Data Processing and State Aggregation Pipeline

A comprehensive data normalization and aggregation system for processing oracle prices, GMX market data, and derived metrics with rolling window analytics and persistence for backtesting.

## Overview

This pipeline provides:

- **Data Normalization**: Merges oracle prices, GMX market data, and calculates derived metrics
- **Rolling Window Analytics**: Computes OHLC, volume, volatility, funding, and OI metrics over configurable time windows
- **State Bus**: Publishes processed snapshots to subscribers with async notification
- **Persistence**: Supports pluggable storage adapters for backtesting and historical analysis

## Architecture

```
┌─────────────────┐
│ Oracle Prices   │
│ GMX Market Data │
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ Normalization       │
│ Service             │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Rolling Window      │
│ Analytics           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ State Aggregation   │
│ Service             │
└────────┬────────────┘
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
   │Listener1│    │Listener2│    │Listener3│    │Persistence│
   └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

## Data Schemas

### OraclePrice

Oracle price data from external price feeds (Chainlink, Pyth, etc.):

```typescript
{
  symbol: string;        // Trading pair (e.g., "ETH-USD")
  price: string;         // Price as decimal string for precision
  decimals: number;      // Decimal precision
  timestamp: number;     // Unix timestamp in seconds
  source: string;        // Oracle identifier
  confidence?: number;   // Price confidence [0,1]
}
```

### GMXMarketData

GMX perpetuals market snapshot:

```typescript
{
  marketAddress: string; // GMX market contract address
  symbol: string; // Market symbol
  indexPrice: string; // Current index price
  markPrice: string; // Mark price for settlements
  longOpenInterest: string; // Long OI in USD
  shortOpenInterest: string; // Short OI in USD
  fundingRate: string; // Funding rate per hour
  liquidityLong: string; // Available liquidity for longs
  liquidityShort: string; // Available liquidity for shorts
  timestamp: number; // Unix timestamp
}
```

### NormalizedMarketState

Unified market state combining all data sources:

```typescript
{
  symbol: string;
  timestamp: number;
  price: {
    oracle: string;         // Oracle reference price
    index: string;          // GMX index price
    mark: string;           // GMX mark price
    confidence?: number;    // Price confidence
  };
  openInterest: {
    long: string;           // Long OI
    short: string;          // Short OI
    total: string;          // Total OI
    imbalance: number;      // (long - short) / total
  };
  funding: {
    rate: string;           // Per hour rate
    rateAnnualized: number; // Annualized rate
  };
  liquidity: {
    long: string;
    short: string;
    utilizationRatio: number; // OI / Liquidity
  };
  volatility: {
    realized24h: number;    // 24h realized volatility
    realized7d?: number;    // Optional 7d volatility
  };
  derived: {
    volumeWeightedPrice: string;
    priceImpact: number;    // Impact for standard size
  };
}
```

### WindowAnalytics

Analytics computed over a rolling time window:

```typescript
{
  symbol: string;
  window: WindowConfig;
  startTime: number;
  endTime: number;
  dataPoints: number;
  price: {
    open: string;
    high: string;
    low: string;
    close: string;
    vwap: string;
  }
  openInterest: {
    avg: string;
    max: string;
    min: string;
    change: number; // Percentage change
  }
  funding: {
    avg: number;
    max: number;
    min: number;
    cumulative: number; // Cumulative funding paid
  }
  volatility: {
    realized: number; // Realized vol over window
    high: number;
    low: number;
  }
}
```

### MarketDataSnapshot

Complete snapshot for persistence and backtesting:

```typescript
{
  id: string;                           // Unique identifier
  timestamp: number;                    // Snapshot timestamp
  markets: NormalizedMarketState[];     // All market states
  windows: Record<string, WindowAnalytics>; // Window analytics by "symbol:label"
  metadata?: {
    version: string;
    source: string;
    processingTime: number;
  };
}
```

## Usage

### Basic Setup

```typescript
import {
  StateAggregationService,
  InMemoryPersistenceAdapter,
  WindowConfig,
} from './market-data/index.js';

// Configure rolling windows
const windowConfigs: WindowConfig[] = [
  { size: 3600, label: '1h' }, // 1 hour
  { size: 14400, label: '4h' }, // 4 hours
  { size: 86400, label: '24h' }, // 24 hours
];

// Create persistence adapter
const persistence = new InMemoryPersistenceAdapter();

// Initialize service
const service = new StateAggregationService(
  {
    windowConfigs,
    retentionPeriod: 7 * 24 * 60 * 60, // 7 days
    publishInterval: 60, // 60 seconds
    version: '1.0.0',
    source: 'production',
  },
  persistence,
);
```

### Processing Market Data

```typescript
import { OraclePrice, GMXMarketData } from './market-data/index.js';

// Prepare data sources
const oraclePrice: OraclePrice = {
  symbol: 'ETH-USD',
  price: '2000.50',
  decimals: 8,
  timestamp: Math.floor(Date.now() / 1000),
  source: 'chainlink',
  confidence: 0.99,
};

const gmxData: GMXMarketData = {
  marketAddress: '0x...',
  symbol: 'ETH-USD',
  indexPrice: '2000.00',
  markPrice: '2001.50',
  longOpenInterest: '1000000',
  shortOpenInterest: '800000',
  fundingRate: '0.0001',
  liquidityLong: '5000000',
  liquidityShort: '4500000',
  timestamp: Math.floor(Date.now() / 1000),
};

// Process data
await service.processMarketData([{ oraclePrice, gmxMarketData: gmxData }]);
```

### Subscribing to Updates

```typescript
import { StateUpdateListener, MarketDataSnapshot } from './market-data/index.js';

const listener: StateUpdateListener = {
  onStateUpdate: async (snapshot: MarketDataSnapshot) => {
    console.log('New snapshot:', snapshot.id);
    console.log('Markets:', snapshot.markets.length);

    // Process snapshot for trading signals, risk analysis, etc.
    for (const market of snapshot.markets) {
      console.log(`${market.symbol}: ${market.price.mark}`);
      console.log(`OI Imbalance: ${market.openInterest.imbalance}`);
      console.log(`Funding Rate: ${market.funding.rateAnnualized * 100}%`);
    }

    // Access window analytics
    const ethAnalytics = snapshot.windows['ETH-USD:1h'];
    if (ethAnalytics) {
      console.log('1h Price Range:', ethAnalytics.price.low, '-', ethAnalytics.price.high);
      console.log('1h Volatility:', ethAnalytics.volatility.realized);
    }
  },
};

// Subscribe to updates
const unsubscribe = service.subscribe(listener);

// Later: unsubscribe
unsubscribe();
```

### Auto-Publishing

```typescript
// Start auto-publish at configured interval
service.startAutoPublish();

// Stop auto-publish
service.stopAutoPublish();
```

### Querying Analytics

```typescript
// Get current analytics for a symbol
const analytics = service.getCurrentAnalytics('ETH-USD');

console.log('1h window:', analytics['1h']);
console.log('4h window:', analytics['4h']);
console.log('24h window:', analytics['24h']);

// Get available symbols
const symbols = service.getAvailableSymbols();
console.log('Tracking:', symbols);
```

### Loading Historical Snapshots

```typescript
// Load specific snapshot
const snapshot = await service.loadSnapshot('snapshot-id');

// List snapshots with filters
const { snapshots, hasMore } = await service.listSnapshots({
  limit: 50,
  offset: 0,
  startTime: Math.floor(Date.now() / 1000) - 86400, // Last 24h
  symbols: ['ETH-USD', 'BTC-USD'],
});

for (const snapshot of snapshots) {
  console.log(`Snapshot ${snapshot.id} at ${snapshot.timestamp}`);
}
```

### Data Pruning

```typescript
// Prune old data beyond retention period
service.pruneOldData();

// Clear all data
service.clear();
```

### Graceful Shutdown

```typescript
// Stop all timers and cleanup
await service.shutdown();
```

## Custom Persistence Adapters

Implement the `PersistenceAdapter` interface for custom storage:

```typescript
import { PersistenceAdapter, MarketDataSnapshot } from './market-data/index.js';

class DatabasePersistenceAdapter implements PersistenceAdapter {
  async save(snapshot: MarketDataSnapshot): Promise<void> {
    // Save to database
  }

  async load(id: string): Promise<MarketDataSnapshot | null> {
    // Load from database
  }

  async list(options?: ListOptions): Promise<{
    snapshots: MarketDataSnapshot[];
    hasMore: boolean;
  }> {
    // Query database with filters
  }
}

// Use custom adapter
const dbAdapter = new DatabasePersistenceAdapter();
const service = new StateAggregationService(config, dbAdapter);
```

## Derived Metrics

The pipeline automatically calculates:

### Volatility

- 24-hour realized volatility (annualized)
- Based on log returns between data points
- Useful for options pricing and risk management

### Volume-Weighted Price

- Weighted by open interest
- More accurate than simple average for derivatives

### Open Interest Imbalance

- Ratio: `(long - short) / (long + short)`
- Range: [-1, 1]
- Indicates market sentiment and potential funding rate direction

### Funding Rate (Annualized)

- Converts hourly rate to annual percentage
- Formula: `hourlyRate × 365 × 24`
- Useful for comparing with traditional financing rates

### Liquidity Utilization

- Ratio: `totalOI / totalLiquidity`
- Indicates market capacity and potential price impact

### Price Impact

- Estimated slippage for standard trade size ($10,000)
- Based on available liquidity vs open interest
- Capped at 1.0 (100%)

## Window Analytics

### Price Statistics

- **OHLC**: Open, High, Low, Close over window
- **VWAP**: Volume-weighted average price

### Open Interest

- **Average, Min, Max**: OI statistics
- **Change %**: Percentage change from start to end

### Funding Rate

- **Average, Min, Max**: Funding rate statistics
- **Cumulative**: Total funding paid/received over window

### Volatility

- **Realized**: Calculated from log returns
- **High/Low**: Peak volatility values in window

## Best Practices

### Data Frequency

- Update market data every 30-60 seconds for real-time trading
- Use 5-minute intervals for backtesting to reduce data volume
- Ensure consistent timestamps across data sources

### Window Sizes

Recommended configurations:

- **High-frequency trading**: 15m, 1h, 4h
- **Swing trading**: 1h, 4h, 24h
- **Position trading**: 24h, 7d, 30d

### Memory Management

- Set appropriate `retentionPeriod` based on memory constraints
- Call `pruneOldData()` periodically (e.g., hourly)
- Use external persistence for long-term storage

### Error Handling

```typescript
try {
  await service.processMarketData(dataSources);
} catch (error) {
  console.error('Failed to process market data:', error);
  // Implement retry logic, alerting, etc.
}
```

### Backtesting

```typescript
// Load historical snapshots
const snapshots = await service.listSnapshots({
  startTime: backtestStart,
  endTime: backtestEnd,
  symbols: ['ETH-USD'],
});

// Replay for strategy testing
for (const snapshot of snapshots) {
  const signal = analyzeMarket(snapshot);
  if (signal.action === 'BUY') {
    // Execute backtest trade
  }
}
```

## Testing

Comprehensive unit tests are included:

```bash
# Run all tests
pnpm test:unit

# Run specific test file
pnpm test:unit normalization-service.unit.test.ts
```

## Performance Considerations

- **Normalization**: O(n) where n = number of markets
- **Window Analytics**: O(m) where m = data points in window
- **Persistence**: Depends on adapter implementation
- **Memory**: ~1KB per data point, ~10KB per snapshot

For 100 markets updated every minute:

- Memory: ~100MB per day (without pruning)
- Processing: <10ms per update (typical hardware)

## Future Enhancements

- [ ] File-based persistence adapter (JSON, Parquet)
- [ ] Database adapters (PostgreSQL, TimescaleDB)
- [ ] Real-time streaming via WebSocket
- [ ] Advanced volatility models (GARCH, realized variance)
- [ ] Correlation analytics across markets
- [ ] Funding rate predictions
- [ ] Market regime detection
- [ ] Anomaly detection and alerts

## License

Part of the Arbitrum Vibekit agent framework.
