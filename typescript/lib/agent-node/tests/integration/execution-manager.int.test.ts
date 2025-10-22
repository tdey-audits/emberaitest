import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionManager } from '../../src/positions/execution-manager.js';

/**
 * Integration tests for Execution Manager
 * Tests transaction lifecycle tracking, confirmations, retries, and idempotency
 */
describe('ExecutionManager', () => {
  let executionManager: ExecutionManager;

  beforeEach(() => {
    executionManager = new ExecutionManager({
      maxRetries: 3,
      retryDelayMs: 100,
      confirmationBlocks: 2,
    });
  });

  describe('transaction lifecycle', () => {
    it('should create new execution and track lifecycle', async () => {
      // Given
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition' as const,
        payload: {
          marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336',
          side: 'long',
          collateralAmount: '3000000',
        },
      };

      // When
      const execution = await executionManager.createExecution(request);

      // Then
      expect(execution).toBeDefined();
      expect(execution.id).toBeDefined();
      expect(execution.status).toBe('pending');
      expect(execution.operation).toBe('openPosition');
      expect(execution.createdAt).toBeDefined();
      expect(execution.attempts).toBe(0);
    });

    it('should track transaction submission', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });

      // When
      const txHash = '0xtxhash1234567890abcdef';
      await executionManager.markSubmitted(execution.id, txHash);

      // Then
      const updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('submitted');
      expect(updated.transactionHash).toBe(txHash);
      expect(updated.submittedAt).toBeDefined();
    });

    it('should track transaction confirmation', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });
      const txHash = '0xtxhash1234567890abcdef';
      await executionManager.markSubmitted(execution.id, txHash);

      // When
      await executionManager.markConfirmed(execution.id, {
        blockNumber: 12345678,
        confirmations: 2,
        receipt: {
          status: 'success',
          gasUsed: '150000',
        },
      });

      // Then
      const updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('confirmed');
      expect(updated.confirmedAt).toBeDefined();
      expect(updated.blockNumber).toBe(12345678);
      expect(updated.confirmations).toBe(2);
    });

    it('should track transaction failure', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });
      const txHash = '0xtxhash1234567890abcdef';
      await executionManager.markSubmitted(execution.id, txHash);

      // When
      await executionManager.markFailed(execution.id, {
        reason: 'Transaction reverted',
        error: 'Insufficient balance',
      });

      // Then
      const updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('failed');
      expect(updated.failedAt).toBeDefined();
      expect(updated.failureReason).toBe('Transaction reverted');
      expect(updated.error).toBe('Insufficient balance');
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed transactions up to max retries', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });

      // When: simulate multiple failures
      await executionManager.markSubmitted(execution.id, '0xtx1');
      await executionManager.markFailed(execution.id, { reason: 'Network error' });

      await executionManager.retry(execution.id);
      await executionManager.markSubmitted(execution.id, '0xtx2');
      await executionManager.markFailed(execution.id, { reason: 'Network error' });

      await executionManager.retry(execution.id);
      await executionManager.markSubmitted(execution.id, '0xtx3');
      await executionManager.markFailed(execution.id, { reason: 'Network error' });

      // Then: should be marked as exhausted after max retries
      const updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('failed');
      expect(updated.attempts).toBe(3);
    });

    it('should not retry beyond max retries', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });

      // Exhaust retries
      for (let i = 0; i < 3; i++) {
        await executionManager.markSubmitted(execution.id, `0xtx${i}`);
        await executionManager.markFailed(execution.id, { reason: 'Network error' });
        if (i < 2) {
          await executionManager.retry(execution.id);
        }
      }

      // When/Then: should reject further retry attempts
      await expect(executionManager.retry(execution.id)).rejects.toThrow(/max retries/i);
    });

    it('should apply exponential backoff for retries', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });

      const delays: number[] = [];
      vi.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
        delays.push(delay);
        callback();
        return {} as NodeJS.Timeout;
      }) as typeof setTimeout);

      // When: perform retries
      for (let i = 0; i < 2; i++) {
        await executionManager.markSubmitted(execution.id, `0xtx${i}`);
        await executionManager.markFailed(execution.id, { reason: 'Network error' });
        await executionManager.retry(execution.id);
      }

      // Then: delays should increase exponentially
      expect(delays.length).toBeGreaterThan(0);
      if (delays.length >= 2) {
        expect(delays[1]).toBeGreaterThan(delays[0]);
      }
    });
  });

  describe('idempotency', () => {
    it('should prevent duplicate executions for same request', async () => {
      // Given: same request with idempotency key
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition' as const,
        payload: { marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' },
        idempotencyKey: 'unique-operation-123',
      };

      // When: create execution twice with same idempotency key
      const execution1 = await executionManager.createExecution(request);
      const execution2 = await executionManager.createExecution(request);

      // Then: should return same execution
      expect(execution1.id).toBe(execution2.id);
    });

    it('should create new execution for different idempotency key', async () => {
      // Given: different idempotency keys
      const request1 = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition' as const,
        payload: {},
        idempotencyKey: 'operation-1',
      };
      const request2 = {
        ...request1,
        idempotencyKey: 'operation-2',
      };

      // When
      const execution1 = await executionManager.createExecution(request1);
      const execution2 = await executionManager.createExecution(request2);

      // Then: should create different executions
      expect(execution1.id).not.toBe(execution2.id);
    });

    it('should generate idempotency key from request if not provided', async () => {
      // Given: no explicit idempotency key
      const request = {
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition' as const,
        payload: { marketAddress: '0x70d95587d40A2caf56bd97485aB3Eec10Bee6336' },
      };

      // When: create same request twice
      const execution1 = await executionManager.createExecution(request);
      const execution2 = await executionManager.createExecution(request);

      // Then: should detect duplicate and return same execution
      expect(execution1.id).toBe(execution2.id);
    });
  });

  describe('confirmation tracking', () => {
    it('should wait for required confirmations', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });
      await executionManager.markSubmitted(execution.id, '0xtxhash');

      // When: update with insufficient confirmations
      await executionManager.updateConfirmations(execution.id, 1);

      // Then: should still be waiting
      let updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('submitted');

      // When: reach required confirmations
      await executionManager.updateConfirmations(execution.id, 2);

      // Then: should be confirmed
      updated = await executionManager.getExecution(execution.id);
      expect(updated.status).toBe('confirmed');
    });

    it('should handle reorg by resetting confirmations', async () => {
      // Given: transaction with confirmations
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });
      await executionManager.markSubmitted(execution.id, '0xtxhash');
      await executionManager.updateConfirmations(execution.id, 2);

      // When: reorg detected
      await executionManager.handleReorg(execution.id);

      // Then: should reset confirmations
      const updated = await executionManager.getExecution(execution.id);
      expect(updated.confirmations).toBe(0);
      expect(updated.status).toBe('submitted');
    });
  });

  describe('query operations', () => {
    it('should get execution by id', async () => {
      // Given
      const execution = await executionManager.createExecution({
        walletAddress: '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d',
        operation: 'openPosition',
        payload: {},
      });

      // When
      const retrieved = await executionManager.getExecution(execution.id);

      // Then
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(execution.id);
    });

    it('should list executions by wallet', async () => {
      // Given
      const walletAddress = '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d';
      await executionManager.createExecution({
        walletAddress,
        operation: 'openPosition',
        payload: {},
      });
      await executionManager.createExecution({
        walletAddress,
        operation: 'closePosition',
        payload: {},
      });

      // When
      const executions = await executionManager.listExecutions({ walletAddress });

      // Then
      expect(executions.length).toBeGreaterThanOrEqual(2);
      executions.forEach((exec) => {
        expect(exec.walletAddress).toBe(walletAddress);
      });
    });

    it('should filter executions by status', async () => {
      // Given
      const walletAddress = '0x2D2c313EC7650995B193a34E16bE5B86eEdE872d';
      await executionManager.createExecution({
        walletAddress,
        operation: 'openPosition',
        payload: {},
      });
      const confirmed = await executionManager.createExecution({
        walletAddress,
        operation: 'closePosition',
        payload: {},
      });
      await executionManager.markSubmitted(confirmed.id, '0xtxhash');
      await executionManager.markConfirmed(confirmed.id, {
        blockNumber: 123456,
        confirmations: 2,
        receipt: { status: 'success', gasUsed: '150000' },
      });

      // When
      const pendingOnly = await executionManager.listExecutions({
        walletAddress,
        status: 'pending',
      });
      const confirmedOnly = await executionManager.listExecutions({
        walletAddress,
        status: 'confirmed',
      });

      // Then
      expect(pendingOnly.every((e) => e.status === 'pending')).toBe(true);
      expect(confirmedOnly.every((e) => e.status === 'confirmed')).toBe(true);
    });

    it('should throw error for non-existent execution', async () => {
      // Given: non-existent id
      const nonExistentId = 'non-existent-id-12345';

      // When/Then
      await expect(executionManager.getExecution(nonExistentId)).rejects.toThrow(
        /execution not found/i,
      );
    });
  });
});
