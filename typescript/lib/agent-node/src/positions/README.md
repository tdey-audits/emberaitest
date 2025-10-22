# Position Management & Execution Manager

This module provides services for managing GMX perpetual positions and tracking transaction lifecycles.

## Components

### GMXPerpetualManager

Manages GMX perpetual position operations including opening, adjusting, and closing positions.

**Features:**
- Open long/short positions with market or limit orders
- Support for fractional leverage (0.5x to 50x)
- Adjust existing positions (add/remove collateral)
- Close positions (full or partial)
- Retrieve active positions for a wallet
- Balance and leverage validation

**Example:**

```typescript
import { GMXPerpetualManager, ExecutionManager } from './positions';

const executionManager = new ExecutionManager({
  maxRetries: 3,
  retryDelayMs: 100,
  confirmationBlocks: 2,
});

const manager = new GMXPerpetualManager({
  chainId: '42161', // Arbitrum One
  executionManager,
});

// Open a long position
const result = await manager.openPosition({
  walletAddress: '0x...',
  marketAddress: '0x...',
  side: 'long',
  collateralAmount: BigInt('3000000'), // 3 USDC
  leverage: '2',
  orderType: 'market',
  collateralTokenAddress: '0x...',
});

// Get positions
const positions = await manager.getPositions('0x...');

// Close position
await manager.closePosition({
  positionKey: '0x...',
  walletAddress: '0x...',
  sizeDeltaUsd: '0', // 0 = close entire position
});
```

### ExecutionManager

Tracks transaction lifecycle from submission to confirmation, handling retries and idempotency.

**Features:**
- Transaction lifecycle tracking (pending → submitted → confirmed/failed)
- Retry mechanism with exponential backoff
- Idempotency controls to prevent duplicate executions
- Confirmation block tracking
- Blockchain reorg handling
- Query interface for execution status

**Example:**

```typescript
import { ExecutionManager } from './positions';

const executionManager = new ExecutionManager({
  maxRetries: 3,
  retryDelayMs: 100,
  confirmationBlocks: 2,
});

// Create execution
const execution = await executionManager.createExecution({
  walletAddress: '0x...',
  operation: 'openPosition',
  payload: { marketAddress: '0x...', side: 'long' },
  idempotencyKey: 'unique-key-123', // Optional
});

// Mark as submitted
await executionManager.markSubmitted(execution.id, '0xtxhash...');

// Track confirmations
await executionManager.updateConfirmations(execution.id, 1);
await executionManager.updateConfirmations(execution.id, 2); // Marks as confirmed

// Query executions
const executions = await executionManager.listExecutions({
  walletAddress: '0x...',
  status: 'confirmed',
});

// Retry on failure
await executionManager.markFailed(execution.id, {
  reason: 'Network error',
});
await executionManager.retry(execution.id);
```

## Testing

Integration tests use MSW (Mock Service Worker) to simulate GMX API responses:

```bash
pnpm test:int -- tests/integration/gmx-perpetuals.int.test.ts
pnpm test:int -- tests/integration/execution-manager.int.test.ts
```

Mock data is stored in `tests/mocks/data/gmx/` and handlers in `tests/mocks/handlers/gmx.ts`.

## Architecture

```
src/positions/
├── gmx-perpetuals.ts       # GMX position management service
├── execution-manager.ts    # Transaction lifecycle manager
├── index.ts                # Module exports
└── README.md               # This file

tests/
├── integration/
│   ├── gmx-perpetuals.int.test.ts      # Position management tests
│   └── execution-manager.int.test.ts   # Execution tracking tests
└── mocks/
    ├── handlers/gmx.ts                 # MSW handlers for GMX API
    └── data/gmx/                       # Mock API responses
```
