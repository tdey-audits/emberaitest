import { createHash } from 'crypto';

export type ExecutionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed' | 'cancelled';

export type ExecutionOperation = 'openPosition' | 'adjustPosition' | 'closePosition';

export interface ExecutionRecord {
  id: string;
  walletAddress: string;
  operation: ExecutionOperation;
  payload: Record<string, unknown>;
  status: ExecutionStatus;
  transactionHash?: string;
  blockNumber?: number;
  confirmations?: number;
  attempts: number;
  createdAt: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  error?: string;
  idempotencyKey?: string;
}

export interface CreateExecutionRequest {
  walletAddress: string;
  operation: ExecutionOperation;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ConfirmationInfo {
  blockNumber: number;
  confirmations: number;
  receipt: {
    status: string;
    gasUsed: string;
  };
}

export interface FailureInfo {
  reason: string;
  error?: string;
}

export interface ListExecutionsOptions {
  walletAddress: string;
  status?: ExecutionStatus;
}

export interface ExecutionManagerConfig {
  maxRetries: number;
  retryDelayMs: number;
  confirmationBlocks: number;
}

/**
 * ExecutionManager tracks transaction lifecycle, handles retries, and provides idempotency
 */
export class ExecutionManager {
  private executions: Map<string, ExecutionRecord> = new Map();
  private idempotencyMap: Map<string, string> = new Map();
  private config: ExecutionManagerConfig;

  constructor(config: ExecutionManagerConfig) {
    this.config = config;
  }

  /**
   * Create a new execution or return existing one if idempotency key matches
   */
  async createExecution(request: CreateExecutionRequest): Promise<ExecutionRecord> {
    const idempotencyKey = request.idempotencyKey || this.generateIdempotencyKey(request);

    // Check if execution already exists for this idempotency key
    const existingId = this.idempotencyMap.get(idempotencyKey);
    if (existingId) {
      const existing = this.executions.get(existingId);
      if (existing) {
        return existing;
      }
    }

    // Create new execution
    const execution: ExecutionRecord = {
      id: this.generateExecutionId(),
      walletAddress: request.walletAddress,
      operation: request.operation,
      payload: request.payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      idempotencyKey,
    };

    this.executions.set(execution.id, execution);
    this.idempotencyMap.set(idempotencyKey, execution.id);

    return execution;
  }

  /**
   * Mark execution as submitted with transaction hash
   */
  async markSubmitted(executionId: string, transactionHash: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = 'submitted';
    execution.transactionHash = transactionHash;
    execution.submittedAt = new Date();
    execution.attempts += 1;
  }

  /**
   * Mark execution as confirmed with block info
   */
  async markConfirmed(executionId: string, info: ConfirmationInfo): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = 'confirmed';
    execution.blockNumber = info.blockNumber;
    execution.confirmations = info.confirmations;
    execution.confirmedAt = new Date();
  }

  /**
   * Mark execution as failed
   */
  async markFailed(executionId: string, failure: FailureInfo): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = 'failed';
    execution.failedAt = new Date();
    execution.failureReason = failure.reason;
    execution.error = failure.error;
  }

  /**
   * Retry a failed execution with exponential backoff
   */
  async retry(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.attempts >= this.config.maxRetries) {
      throw new Error(
        `Max retries (${this.config.maxRetries}) exceeded for execution: ${executionId}`,
      );
    }

    // Calculate exponential backoff delay
    const backoffMultiplier = Math.pow(2, execution.attempts - 1);
    const delayMs = this.config.retryDelayMs * backoffMultiplier;

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Reset to pending for retry
    execution.status = 'pending';
    execution.failedAt = undefined;
    execution.failureReason = undefined;
    execution.error = undefined;
  }

  /**
   * Update confirmation count and mark as confirmed if threshold reached
   */
  async updateConfirmations(executionId: string, confirmations: number): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.confirmations = confirmations;

    if (confirmations >= this.config.confirmationBlocks) {
      execution.status = 'confirmed';
      execution.confirmedAt = new Date();
    }
  }

  /**
   * Handle blockchain reorg by resetting confirmations
   */
  async handleReorg(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.confirmations = 0;
    execution.status = 'submitted';
    execution.confirmedAt = undefined;
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<ExecutionRecord> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    return execution;
  }

  /**
   * List executions with optional filtering
   */
  async listExecutions(options: ListExecutionsOptions): Promise<ExecutionRecord[]> {
    const results: ExecutionRecord[] = [];

    for (const execution of this.executions.values()) {
      if (execution.walletAddress !== options.walletAddress) {
        continue;
      }

      if (options.status && execution.status !== options.status) {
        continue;
      }

      results.push(execution);
    }

    return results;
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `0xexec-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate idempotency key from request
   */
  private generateIdempotencyKey(request: CreateExecutionRequest): string {
    const hash = createHash('sha256');
    hash.update(request.walletAddress);
    hash.update(request.operation);
    hash.update(JSON.stringify(request.payload));
    return hash.digest('hex');
  }
}
