# Data Feeds Module

Real-time market and oracle data feeds for Chainlink Data Streams and GMX.

## Quick Start

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
  },
});

await feedManager.connect();
await feedManager.subscribeChainlink('BTC/USD');

feedManager.onPrice((data) => {
  console.log(`Price: ${data.symbol} = ${data.price}`);
});
```

## Features

- ✅ WebSocket streaming with auto-reconnection
- ✅ REST fallback and historical data
- ✅ In-memory and Redis caching
- ✅ Unified API for Chainlink and GMX
- ✅ TypeScript support
- ✅ Comprehensive tests

## Documentation

See [docs/data-feeds.md](../../docs/data-feeds.md) for full documentation.

## API Keys Required

- **Chainlink**: Get API key from [Chainlink Data Streams](https://chain.link/data-streams)
- **GMX**: Public endpoints available, no API key required

## Configuration

Add to your `.env`:

```bash
CHAINLINK_WS_URL=wss://streams.chainlink.example.com
CHAINLINK_REST_URL=https://api.chainlink.example.com
CHAINLINK_API_KEY=your-api-key

GMX_WS_URL=wss://api.gmx.io/ws
GMX_REST_URL=https://api.gmx.io
GMX_CHAIN_ID=42161
```

## Testing

```bash
# Unit tests
pnpm test:unit

# Integration tests
pnpm test:int
```

## Architecture

```
FeedManager
├── Chainlink
│   ├── WebSocket Client (real-time)
│   └── REST Client (fallback + historical)
├── GMX
│   ├── WebSocket Client (real-time)
│   └── REST Client (fallback + historical)
└── Cache (In-Memory or Redis)
```

## Module Structure

```
data-feeds/
├── types/           # TypeScript type definitions
├── cache/           # Caching implementations
├── chainlink/       # Chainlink clients
├── gmx/             # GMX clients
├── feed-manager.ts  # Unified feed manager
└── index.ts         # Public exports
```

## License

See project LICENSE.
