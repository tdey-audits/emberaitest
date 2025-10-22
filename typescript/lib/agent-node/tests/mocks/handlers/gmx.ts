import { http } from 'msw';

import { createResponseFromMock } from '../utils/error-simulation.js';

// GMX API endpoints for Arbitrum One
const GMX_API_BASE = 'https://arbitrum-api.gmxinfra.io';

/**
 * GMX Perpetuals MSW Handlers
 * Replays recorded API responses for position management operations
 */

// Helper to compute mock key from request
function computePositionMockKey(body: unknown): string {
  const request = body as {
    walletAddress?: string;
    marketAddress?: string;
    side?: string;
    orderType?: string;
    leverage?: string;
  };

  const parts = [
    'position',
    request.walletAddress?.toLowerCase().slice(0, 10) || 'wallet',
    request.marketAddress?.toLowerCase().slice(0, 10) || 'market',
    request.side || 'long',
    request.orderType || 'market',
    request.leverage || '1',
  ];

  return parts.join('-');
}

function computeCloseMockKey(body: unknown): string {
  const request = body as { positionKey?: string; walletAddress?: string };
  return `close-${request.positionKey?.slice(0, 16) || 'position'}`;
}

// Handler for opening positions
const openPositionHandler = http.post(`${GMX_API_BASE}/positions/open`, async ({ request }) => {
  try {
    const body = await request.json();
    const mockKey = computePositionMockKey(body);

    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW gmx handler] Opening position with mock: ${mockKey}`);
    }

    return await createResponseFromMock(mockKey, 'gmx');
  } catch (error) {
    if (process.env['DEBUG_TESTS']) {
      console.error('[MSW gmx handler] Error opening position:', error);
    }
    return new Response(
      JSON.stringify({
        error: 'Failed to open position',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// Handler for adjusting positions
const adjustPositionHandler = http.post(`${GMX_API_BASE}/positions/adjust`, async ({ request }) => {
  try {
    const body = await request.json();
    const mockKey = `adjust-${(body as { positionKey?: string }).positionKey?.slice(0, 16) || 'position'}`;

    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW gmx handler] Adjusting position with mock: ${mockKey}`);
    }

    return await createResponseFromMock(mockKey, 'gmx');
  } catch (error) {
    if (process.env['DEBUG_TESTS']) {
      console.error('[MSW gmx handler] Error adjusting position:', error);
    }
    return new Response(
      JSON.stringify({
        error: 'Failed to adjust position',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// Handler for closing positions
const closePositionHandler = http.post(`${GMX_API_BASE}/positions/close`, async ({ request }) => {
  try {
    const body = await request.json();
    const mockKey = computeCloseMockKey(body);

    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW gmx handler] Closing position with mock: ${mockKey}`);
    }

    return await createResponseFromMock(mockKey, 'gmx');
  } catch (error) {
    if (process.env['DEBUG_TESTS']) {
      console.error('[MSW gmx handler] Error closing position:', error);
    }
    return new Response(
      JSON.stringify({
        error: 'Failed to close position',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// Handler for getting positions
const getPositionsHandler = http.get(`${GMX_API_BASE}/positions`, async ({ request }) => {
  try {
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('walletAddress');
    const mockKey = `get-positions-${walletAddress?.toLowerCase().slice(0, 10) || 'wallet'}`;

    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW gmx handler] Getting positions with mock: ${mockKey}`);
    }

    return await createResponseFromMock(mockKey, 'gmx');
  } catch (error) {
    if (process.env['DEBUG_TESTS']) {
      console.error('[MSW gmx handler] Error getting positions:', error);
    }
    return new Response(
      JSON.stringify({
        error: 'Failed to get positions',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

// Handler for balance checks
const getBalanceHandler = http.get(`${GMX_API_BASE}/balances`, async ({ request }) => {
  try {
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('walletAddress');
    const mockKey = `balance-${walletAddress?.toLowerCase().slice(0, 10) || 'wallet'}`;

    if (process.env['DEBUG_TESTS']) {
      console.log(`[MSW gmx handler] Getting balance with mock: ${mockKey}`);
    }

    return await createResponseFromMock(mockKey, 'gmx');
  } catch (error) {
    if (process.env['DEBUG_TESTS']) {
      console.error('[MSW gmx handler] Error getting balance:', error);
    }
    // Return insufficient balance for specific test wallet
    const url = new URL(request.url);
    const walletAddress = url.searchParams.get('walletAddress');
    if (walletAddress?.toLowerCase().includes('insufficientbalance')) {
      return new Response(
        JSON.stringify({
          walletAddress,
          balances: {
            USDC: '1000000', // Only 1 USDC
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        error: 'Failed to get balance',
        message: (error as Error).message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});

export const gmxHandlers = [
  openPositionHandler,
  adjustPositionHandler,
  closePositionHandler,
  getPositionsHandler,
  getBalanceHandler,
];
