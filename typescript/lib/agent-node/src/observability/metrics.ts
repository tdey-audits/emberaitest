import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from 'prom-client';

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  public readonly registry: Registry;

  public readonly httpRequestDuration: Histogram;
  public readonly httpRequestTotal: Counter;
  public readonly httpRequestErrors: Counter;

  public readonly aiRequestDuration: Histogram;
  public readonly aiRequestTotal: Counter;
  public readonly aiRequestErrors: Counter;
  public readonly aiTokensUsed: Counter;

  public readonly skillExecutionDuration: Histogram;
  public readonly skillExecutionTotal: Counter;
  public readonly skillExecutionErrors: Counter;

  public readonly activeConnections: Gauge;
  public readonly memoryUsage: Gauge;

  private constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({
      register: this.registry,
      prefix: 'agent_node_',
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'error_type'],
      registers: [this.registry],
    });

    this.aiRequestDuration = new Histogram({
      name: 'ai_request_duration_seconds',
      help: 'Duration of AI provider requests in seconds',
      labelNames: ['provider', 'model', 'operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.aiRequestTotal = new Counter({
      name: 'ai_requests_total',
      help: 'Total number of AI provider requests',
      labelNames: ['provider', 'model', 'operation', 'status'],
      registers: [this.registry],
    });

    this.aiRequestErrors = new Counter({
      name: 'ai_request_errors_total',
      help: 'Total number of AI provider errors',
      labelNames: ['provider', 'model', 'error_type'],
      registers: [this.registry],
    });

    this.aiTokensUsed = new Counter({
      name: 'ai_tokens_used_total',
      help: 'Total number of AI tokens used',
      labelNames: ['provider', 'model', 'token_type'],
      registers: [this.registry],
    });

    this.skillExecutionDuration = new Histogram({
      name: 'skill_execution_duration_seconds',
      help: 'Duration of skill executions in seconds',
      labelNames: ['skill_id', 'tool'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.skillExecutionTotal = new Counter({
      name: 'skill_executions_total',
      help: 'Total number of skill executions',
      labelNames: ['skill_id', 'tool', 'status'],
      registers: [this.registry],
    });

    this.skillExecutionErrors = new Counter({
      name: 'skill_execution_errors_total',
      help: 'Total number of skill execution errors',
      labelNames: ['skill_id', 'tool', 'error_type'],
      registers: [this.registry],
    });

    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.memoryUsage = new Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.startMemoryMonitoring();
  }

  private startMemoryMonitoring(): void {
    const updateMemoryMetrics = () => {
      const memUsage = process.memoryUsage();
      this.memoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
      this.memoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
      this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.memoryUsage.set({ type: 'external' }, memUsage.external);
    };

    updateMemoryMetrics();
    const interval = setInterval(updateMemoryMetrics, 10000);
    if (interval.unref) {
      interval.unref();
    }
  }

  static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  createCounter(name: string, help: string, labelNames: string[] = []): Counter {
    return new Counter({
      name,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  createGauge(name: string, help: string, labelNames: string[] = []): Gauge {
    return new Gauge({
      name,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  createHistogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets?: number[],
  ): Histogram {
    return new Histogram({
      name,
      help,
      labelNames,
      buckets,
      registers: [this.registry],
    });
  }

  createSummary(
    name: string,
    help: string,
    labelNames: string[] = [],
    percentiles?: number[],
  ): Summary {
    return new Summary({
      name,
      help,
      labelNames,
      percentiles,
      registers: [this.registry],
    });
  }
}

export const metricsRegistry = MetricsRegistry.getInstance();
