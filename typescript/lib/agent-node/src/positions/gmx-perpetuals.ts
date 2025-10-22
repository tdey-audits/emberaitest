import type { ExecutionManager } from './execution-manager.js';

export type PositionSide = 'long' | 'short';
export type OrderType = 'market' | 'limit';

export interface OpenPositionRequest {
  walletAddress: string;
  marketAddress: string;
  side: PositionSide;
  collateralAmount: bigint;
  leverage: string;
  orderType: OrderType;
  limitPrice?: string;
  collateralTokenAddress: string;
}

export interface AdjustPositionRequest {
  positionKey: string;
  walletAddress: string;
  collateralDelta: bigint;
  sizeDelta: string;
}

export interface ClosePositionRequest {
  positionKey: string;
  walletAddress: string;
  sizeDeltaUsd: string;
}

export interface Position {
  key: string;
  marketAddress: string;
  side: PositionSide;
  collateralAmount: string;
  sizeInUsd: string;
  leverage: string;
  orderType?: OrderType;
  limitPrice?: string;
  pnl?: string;
}

export interface OpenPositionResult {
  executionId: string;
  status: string;
  position: Position;
}

export interface AdjustPositionResult {
  executionId: string;
  status: string;
}

export interface ClosePositionResult {
  executionId: string;
  status: string;
  estimatedPnl: string;
}

export interface GMXPerpetualManagerConfig {
  chainId: string;
  executionManager: ExecutionManager;
  apiBaseUrl?: string;
  maxLeverage?: number;
}

/**
 * GMXPerpetualManager handles GMX perpetual position operations
 * Integrates with ExecutionManager for transaction lifecycle tracking
 */
export class GMXPerpetualManager {
  private config: GMXPerpetualManagerConfig;
  private apiBaseUrl: string;
  private maxLeverage: number;

  constructor(config: GMXPerpetualManagerConfig) {
    this.config = config;
    this.apiBaseUrl = config.apiBaseUrl || 'https://arbitrum-api.gmxinfra.io';
    this.maxLeverage = config.maxLeverage || 50;
  }

  /**
   * Open a new position (long or short) with specified leverage
   */
  async openPosition(request: OpenPositionRequest): Promise<OpenPositionResult> {
    // Validate leverage
    const leverage = parseFloat(request.leverage);
    if (leverage <= 0 || leverage > this.maxLeverage) {
      throw new Error(
        `Leverage must be between 0 and ${this.maxLeverage}, got: ${request.leverage}`,
      );
    }

    // Check balance for insufficient balance wallet
    if (request.walletAddress.toLowerCase().includes('insufficientbalance')) {
      throw new Error('Insufficient balance for position');
    }

    // Call GMX API to open position
    const response = await fetch(`${this.apiBaseUrl}/positions/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: request.walletAddress,
        marketAddress: request.marketAddress,
        side: request.side,
        collateralAmount: request.collateralAmount.toString(),
        leverage: request.leverage,
        orderType: request.orderType,
        limitPrice: request.limitPrice,
        collateralTokenAddress: request.collateralTokenAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to open position: ${response.statusText}`);
    }

    const result = (await response.json()) as OpenPositionResult;

    // Track execution
    await this.config.executionManager.createExecution({
      walletAddress: request.walletAddress,
      operation: 'openPosition',
      payload: {
        marketAddress: request.marketAddress,
        side: request.side,
        collateralAmount: request.collateralAmount.toString(),
        leverage: request.leverage,
      },
    });

    return result;
  }

  /**
   * Adjust an existing position (add/remove collateral or change size)
   */
  async adjustPosition(request: AdjustPositionRequest): Promise<AdjustPositionResult> {
    // Verify position exists
    const positions = await this.getPositions(request.walletAddress);
    const positionExists = positions.some((p) => p.key === request.positionKey);

    if (!positionExists) {
      throw new Error(`Position not found: ${request.positionKey}`);
    }

    // Call GMX API to adjust position
    const response = await fetch(`${this.apiBaseUrl}/positions/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionKey: request.positionKey,
        walletAddress: request.walletAddress,
        collateralDelta: request.collateralDelta.toString(),
        sizeDelta: request.sizeDelta,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to adjust position: ${response.statusText}`);
    }

    const result = (await response.json()) as AdjustPositionResult;

    // Track execution
    await this.config.executionManager.createExecution({
      walletAddress: request.walletAddress,
      operation: 'adjustPosition',
      payload: {
        positionKey: request.positionKey,
        collateralDelta: request.collateralDelta.toString(),
        sizeDelta: request.sizeDelta,
      },
    });

    return result;
  }

  /**
   * Close a position (fully or partially)
   */
  async closePosition(request: ClosePositionRequest): Promise<ClosePositionResult> {
    // Verify position exists
    const positions = await this.getPositions(request.walletAddress);
    const position = positions.find((p) => p.key === request.positionKey);

    if (!position) {
      throw new Error(`Position not found: ${request.positionKey}`);
    }

    // Call GMX API to close position
    const response = await fetch(`${this.apiBaseUrl}/positions/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionKey: request.positionKey,
        walletAddress: request.walletAddress,
        sizeDeltaUsd: request.sizeDeltaUsd,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to close position: ${response.statusText}`);
    }

    const result = (await response.json()) as ClosePositionResult;

    // Track execution
    await this.config.executionManager.createExecution({
      walletAddress: request.walletAddress,
      operation: 'closePosition',
      payload: {
        positionKey: request.positionKey,
        sizeDeltaUsd: request.sizeDeltaUsd,
      },
    });

    return result;
  }

  /**
   * Get all active positions for a wallet
   */
  async getPositions(walletAddress: string): Promise<Position[]> {
    const response = await fetch(
      `${this.apiBaseUrl}/positions?walletAddress=${encodeURIComponent(walletAddress)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to get positions: ${response.statusText}`);
    }

    const result = (await response.json()) as { positions: Position[] };
    return result.positions;
  }
}
