import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationContext {
  traceId: string;
  spanId?: string;
  skillId?: string;
  userId?: string;
  [key: string]: unknown;
}

class CorrelationManager {
  private static instance: CorrelationManager;
  private asyncLocalStorage: AsyncLocalStorage<CorrelationContext>;

  private constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();
  }

  static getInstance(): CorrelationManager {
    if (!CorrelationManager.instance) {
      CorrelationManager.instance = new CorrelationManager();
    }
    return CorrelationManager.instance;
  }

  run<T>(context: Partial<CorrelationContext>, callback: () => T): T {
    const fullContext: CorrelationContext = {
      traceId: context.traceId || randomUUID(),
      ...context,
    };
    return this.asyncLocalStorage.run(fullContext, callback);
  }

  getContext(): CorrelationContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  setContext(context: Partial<CorrelationContext>): void {
    const current = this.getContext();
    if (current) {
      Object.assign(current, context);
    }
  }

  getTraceId(): string | undefined {
    return this.getContext()?.traceId;
  }

  getSpanId(): string | undefined {
    return this.getContext()?.spanId;
  }
}

export const correlationManager = CorrelationManager.getInstance();
