import { describe, it, expect, beforeEach } from 'vitest';
import { GMXPerpetualManager } from '../../src/positions/gmx-perpetuals.js';
import { ExecutionManager } from '../../src/positions/execution-manager.js';

/**
 * Integration tests for GMX Perpetual Position Management
 * Uses MSW handlers for paper-trading/provider stubs
 */
describe('GMXPerpetualManager', () => {
  let manager: GMXPerpetualManager;
  let executionManager: ExecutionManager;

  beforeEach(() => {
    executionManager = new ExecutionManager({
      maxRetries: 3,
      retryDelayMs: 100,
      confirmationBlocks: 2,
    });
    manager = new GMXPerpetualManager({
      chainId: '42161', // Arbitrum One
      executionManager,
    });
  });

  describe('openPosition', () => {
    it('should open a long position with market order', async () => {
      // Given
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336', // ETH-USD market
        side: 'long' as const,
        collateralAmount: BigInt('3000000'), // 3 USDC (6 decimals)
        leverage: '2',
        orderType: 'market' as const,
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      };

      // When
      const result = await manager.openPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.position).toBeDefined();
      expect(result.position.side).toBe('long');
      expect(result.position.leverage).toBe('2');
    });

    it('should open a short position with market order', async () => {
      // Given
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
        side: 'short' as const,
        collateralAmount: BigInt('3000000'), // 3 USDC
        leverage: '3',
        orderType: 'market' as const,
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      };

      // When
      const result = await manager.openPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.position.side).toBe('short');
      expect(result.position.leverage).toBe('3');
    });

    it('should open a position with limit order', async () => {
      // Given
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
        side: 'long' as const,
        collateralAmount: BigInt('3000000'),
        leverage: '3',
        orderType: 'limit' as const,
        limitPrice: '2450000000000000000000000000000000', // $2450 in GMX price format
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      };

      // When
      const result = await manager.openPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.position.orderType).toBe('limit');
      expect(result.position.limitPrice).toBe('2450000000000000000000000000000000');
    });

    it('should validate leverage bounds', async () => {
      // Given: leverage exceeds maximum
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
        side: 'long' as const,
        collateralAmount: BigInt('5000000'),
        leverage: '100', // Exceeds typical GMX max
        orderType: 'market' as const,
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      };

      // When/Then
      await expect(manager.openPosition(request)).rejects.toThrow(/leverage/i);
    });

    it('should support fractional leverage', async () => {
      // Given: fractional leverage for risk reduction
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
        side: 'long' as const,
        collateralAmount: BigInt('5000000'),
        leverage: '0.5', // Fractional leverage
        orderType: 'market' as const,
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      };

      // When
      const result = await manager.openPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.position.leverage).toBe('0.5');
    });

    it('should reject insufficient balance', async () => {
      // Given: insufficient balance
      const request = {
        walletAddress: '0xInsufficientBalance',
        marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
        side: 'long' as const,
        collateralAmount: BigInt('8000000'),
        leverage: '2',
        orderType: 'market' as const,
        collateralTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      };

      // When/Then
      await expect(manager.openPosition(request)).rejects.toThrow(/insufficient balance/i);
    });
  });

  describe('adjustPosition', () => {
    it('should increase position size', async () => {
      // Given: existing position
      const positionKey = '0xposition-key-1';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        collateralDelta: BigInt('2000000'), // Add 2 USDC
        sizeDelta: '0', // No size change, just collateral
      };

      // When
      const result = await manager.adjustPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should decrease position size', async () => {
      // Given: existing position
      const positionKey = '0xposition-key-1';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        collateralDelta: BigInt('-1000000'), // Remove 1 USDC
        sizeDelta: '0',
      };

      // When
      const result = await manager.adjustPosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should reject adjustment for non-existent position', async () => {
      // Given: non-existent position
      const request = {
        positionKey: '0xnon-existent',
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        collateralDelta: BigInt('1000000'),
        sizeDelta: '0',
      };

      // When/Then
      await expect(manager.adjustPosition(request)).rejects.toThrow(/position not found/i);
    });
  });

  describe('closePosition', () => {
    it('should close entire position', async () => {
      // Given: existing position
      const positionKey = '0xposition-key-1';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        sizeDeltaUsd: '0', // 0 means close entire position
      };

      // When
      const result = await manager.closePosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.estimatedPnl).toBeDefined();
    });

    it('should partially close position', async () => {
      // Given: existing position
      const positionKey = '0xposition-key-1';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        sizeDeltaUsd: '3000000000000000000000000000000000', // Partial close
      };

      // When
      const result = await manager.closePosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should close with profit', async () => {
      // Given: profitable position
      const positionKey = '0xposition-key-profitable';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        sizeDeltaUsd: '0',
      };

      // When
      const result = await manager.closePosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.estimatedPnl).toBeDefined();
      expect(parseFloat(result.estimatedPnl)).toBeGreaterThan(0);
    });

    it('should close with loss', async () => {
      // Given: losing position
      const positionKey = '0xposition-key-loss';
      const request = {
        positionKey,
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        sizeDeltaUsd: '0',
      };

      // When
      const result = await manager.closePosition(request);

      // Then
      expect(result).toBeDefined();
      expect(result.estimatedPnl).toBeDefined();
      expect(parseFloat(result.estimatedPnl)).toBeLessThan(0);
    });

    it('should reject close for non-existent position', async () => {
      // Given: non-existent position
      const request = {
        positionKey: '0xnon-existent',
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        sizeDeltaUsd: '0',
      };

      // When/Then
      await expect(manager.closePosition(request)).rejects.toThrow(/position not found/i);
    });
  });

  describe('getPositions', () => {
    it('should retrieve all active positions for wallet', async () => {
      // Given
      const walletAddress = '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d';

      // When
      const positions = await manager.getPositions(walletAddress);

      // Then
      expect(positions).toBeDefined();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      positions.forEach((position) => {
        expect(position.key).toBeDefined();
        expect(position.marketAddress).toBeDefined();
        expect(position.side).toMatch(/^(long|short)$/);
        expect(position.sizeInUsd).toBeDefined();
        expect(position.collateralAmount).toBeDefined();
      });
    });

    it('should return empty array for wallet with no positions', async () => {
      // Given
      const walletAddress = '0xNoPositions';

      // When
      const positions = await manager.getPositions(walletAddress);

      // Then
      expect(positions).toBeDefined();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(0);
    });
  });
});
