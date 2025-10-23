import { describe, it, expect, beforeEach } from 'vitest';
import { correlationManager } from '../../../src/observability/correlation.js';

describe('CorrelationManager', () => {
  beforeEach(() => {});

  it('should generate a trace ID if not provided', () => {
    correlationManager.run({}, () => {
      const context = correlationManager.getContext();
      expect(context).toBeDefined();
      expect(context?.traceId).toBeDefined();
      expect(typeof context?.traceId).toBe('string');
    });
  });

  it('should use provided trace ID', () => {
    const customTraceId = 'custom-trace-123';
    correlationManager.run({ traceId: customTraceId }, () => {
      const context = correlationManager.getContext();
      expect(context?.traceId).toBe(customTraceId);
    });
  });

  it('should store span ID', () => {
    const spanId = 'span-456';
    correlationManager.run({ spanId }, () => {
      const context = correlationManager.getContext();
      expect(context?.spanId).toBe(spanId);
    });
  });

  it('should store custom context properties', () => {
    correlationManager.run({ skillId: 'skill-1', userId: 'user-123' }, () => {
      const context = correlationManager.getContext();
      expect(context?.skillId).toBe('skill-1');
      expect(context?.userId).toBe('user-123');
    });
  });

  it('should isolate contexts between runs', () => {
    correlationManager.run({ traceId: 'trace-1' }, () => {
      expect(correlationManager.getTraceId()).toBe('trace-1');
    });

    correlationManager.run({ traceId: 'trace-2' }, () => {
      expect(correlationManager.getTraceId()).toBe('trace-2');
    });
  });

  it('should return undefined when not in a correlation context', () => {
    const context = correlationManager.getContext();
    expect(context).toBeUndefined();
  });

  it('should allow setting context within a run', () => {
    correlationManager.run({ traceId: 'trace-1' }, () => {
      correlationManager.setContext({ spanId: 'new-span' });
      const context = correlationManager.getContext();
      expect(context?.traceId).toBe('trace-1');
      expect(context?.spanId).toBe('new-span');
    });
  });

  it('should support nested contexts', () => {
    correlationManager.run({ traceId: 'outer' }, () => {
      expect(correlationManager.getTraceId()).toBe('outer');

      correlationManager.run({ traceId: 'inner' }, () => {
        expect(correlationManager.getTraceId()).toBe('inner');
      });

      expect(correlationManager.getTraceId()).toBe('outer');
    });
  });

  it('should get trace ID directly', () => {
    correlationManager.run({ traceId: 'test-trace' }, () => {
      expect(correlationManager.getTraceId()).toBe('test-trace');
    });
  });

  it('should get span ID directly', () => {
    correlationManager.run({ spanId: 'test-span' }, () => {
      expect(correlationManager.getSpanId()).toBe('test-span');
    });
  });
});
