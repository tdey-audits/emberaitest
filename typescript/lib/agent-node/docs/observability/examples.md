# Observability Usage Examples

This document provides practical examples of using the observability stack in your application.

## Basic Setup

### 1. Import Components

```typescript
import {
  enhancedLogger,
  correlationManager,
  metricsRegistry,
  alertManager,
  AlertSeverity,
  AlertCategory,
  SlackAlertDispatcher,
} from './observability';
```

### 2. Configure Alert Dispatchers

```typescript
// During application startup
if (process.env['SLACK_WEBHOOK_URL']) {
  alertManager.registerDispatcher(
    new SlackAlertDispatcher(process.env['SLACK_WEBHOOK_URL'], '#alerts'),
  );
}

// Register alert thresholds
alertManager.registerThreshold('high-error-rate', {
  metric: 'http.errors',
  operator: 'gt',
  value: 10,
  window: 300000, // 5 minutes
  severity: AlertSeverity.ERROR,
  category: AlertCategory.ERROR,
  title: 'High HTTP Error Rate',
  message: 'Error rate is ${value}/min, threshold is ${threshold}/min',
});
```

## Logging Examples

### Basic Logging

```typescript
import { enhancedLogger } from './observability';

// Info logging
enhancedLogger.info('User logged in', {
  userId: 'user-123',
  method: 'oauth',
});

// Error logging with stack trace
try {
  await riskyOperation();
} catch (error) {
  enhancedLogger.error('Operation failed', error, {
    userId: 'user-123',
    operation: 'riskyOperation',
  });
}

// Debug logging (only appears if LOG_LEVEL=debug)
enhancedLogger.debug('Processing item', {
  itemId: 'item-456',
  stage: 'validation',
});
```

### Correlation Context

```typescript
import { correlationManager, enhancedLogger } from './observability';

async function handleRequest(req: Request) {
  // Create correlation context for the entire request
  return correlationManager.run({ traceId: req.headers['x-request-id'] }, async () => {
    enhancedLogger.info('Request received'); // Automatically includes traceId

    await processStep1();
    await processStep2();

    return { success: true };
  });
}

async function processStep1() {
  // All logs within this function will include the traceId
  enhancedLogger.info('Step 1 started');

  // You can add more context
  correlationManager.setContext({ stepName: 'validation' });

  enhancedLogger.info('Validation complete');
}
```

### Child Loggers

```typescript
import { enhancedLogger } from './observability';

class UserService {
  private logger = enhancedLogger.child('UserService');

  async createUser(data: UserData) {
    this.logger.info('Creating user', { email: data.email });

    try {
      const user = await this.db.users.create(data);
      this.logger.info('User created', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error('User creation failed', error, { email: data.email });
      throw error;
    }
  }
}
```

### Custom Log Sinks

```typescript
import { EnhancedLogger, FileLogSink, HttpLogSink, MultiSink } from './observability';

const logger = EnhancedLogger.getInstance({
  namespace: 'app',
  sinks: [
    new FileLogSink('/var/log/app.log', {
      bufferSize: 100,
      flushIntervalMs: 5000,
    }),
    new HttpLogSink('https://logs.example.com/ingest', {
      bufferSize: 50,
      headers: {
        Authorization: `Bearer ${process.env['LOG_API_KEY']}`,
      },
    }),
  ],
});
```

## Metrics Examples

### HTTP Request Metrics

```typescript
import { metricsRegistry } from './observability';

async function handleApiRequest(req: Request, res: Response) {
  const startTime = Date.now();

  try {
    const result = await processRequest(req);
    res.json(result);

    // Record successful request
    const duration = (Date.now() - startTime) / 1000;
    metricsRegistry.httpRequestDuration.observe(
      { method: req.method, route: req.route.path, status_code: '200' },
      duration,
    );
    metricsRegistry.httpRequestTotal.inc({
      method: req.method,
      route: req.route.path,
      status_code: '200',
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });

    // Record error
    metricsRegistry.httpRequestErrors.inc({
      method: req.method,
      route: req.route.path,
      error_type: 'server_error',
    });
  }
}
```

### AI Provider Metrics

```typescript
import { metricsRegistry } from './observability';

async function callAIProvider(provider: string, model: string, prompt: string) {
  const startTime = Date.now();

  try {
    const result = await aiClient.generate(prompt);

    // Record successful call
    const duration = (Date.now() - startTime) / 1000;
    metricsRegistry.aiRequestDuration.observe(
      { provider, model, operation: 'completion' },
      duration,
    );
    metricsRegistry.aiRequestTotal.inc({
      provider,
      model,
      operation: 'completion',
      status: 'success',
    });

    // Record token usage
    metricsRegistry.aiTokensUsed.inc(
      { provider, model, token_type: 'prompt' },
      result.usage.promptTokens,
    );
    metricsRegistry.aiTokensUsed.inc(
      { provider, model, token_type: 'completion' },
      result.usage.completionTokens,
    );

    return result;
  } catch (error) {
    metricsRegistry.aiRequestErrors.inc({
      provider,
      model,
      error_type: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}
```

### Custom Metrics

```typescript
import { metricsRegistry } from './observability';

// Create a counter
const orderCounter = metricsRegistry.createCounter('orders_total', 'Total number of orders', [
  'status',
  'product_type',
]);

function processOrder(order: Order) {
  // Increment counter
  orderCounter.inc({
    status: order.status,
    product_type: order.productType,
  });
}

// Create a gauge
const queueSize = metricsRegistry.createGauge('queue_size', 'Current size of processing queue', [
  'queue_name',
]);

function updateQueueMetrics(queueName: string, size: number) {
  queueSize.set({ queue_name: queueName }, size);
}

// Create a histogram
const processingDuration = metricsRegistry.createHistogram(
  'order_processing_duration_seconds',
  'Time to process orders',
  ['product_type'],
  [0.1, 0.5, 1, 2, 5, 10], // Buckets in seconds
);

async function processOrderWithMetrics(order: Order) {
  const timer = processingDuration.startTimer({ product_type: order.productType });

  try {
    await processOrder(order);
  } finally {
    timer(); // Records duration
  }
}
```

## Alert Examples

### Manual Alerts

```typescript
import { alertManager, AlertSeverity, AlertCategory } from './observability';

// Send an error alert
await alertManager.sendAlert(
  AlertSeverity.ERROR,
  AlertCategory.ERROR,
  'Database Connection Failed',
  'Unable to connect to primary database after 3 retries',
  {
    host: 'db-primary.example.com',
    port: 5432,
    lastError: 'ETIMEDOUT',
  },
);

// Send a performance alert
await alertManager.sendAlert(
  AlertSeverity.WARNING,
  AlertCategory.PERFORMANCE,
  'Slow API Response',
  'API response time exceeded 2 seconds',
  {
    endpoint: '/api/users',
    duration: '2.3s',
    threshold: '2.0s',
  },
);

// Send a risk alert
await alertManager.sendAlert(
  AlertSeverity.CRITICAL,
  AlertCategory.RISK,
  'Suspicious Activity Detected',
  'Multiple failed login attempts from same IP',
  {
    ipAddress: '192.168.1.100',
    attempts: 15,
    timeWindow: '5 minutes',
  },
);
```

### Threshold-Based Alerts

```typescript
import { alertManager, AlertSeverity, AlertCategory } from './observability';

// Register thresholds during startup
function setupAlerts() {
  // Error rate threshold
  alertManager.registerThreshold('error-rate', {
    metric: 'errors.per.minute',
    operator: 'gt',
    value: 10,
    window: 300000, // 5 minutes
    severity: AlertSeverity.ERROR,
    category: AlertCategory.ERROR,
    title: 'High Error Rate',
    message: 'Error rate (${value}/min) exceeds threshold (${threshold}/min)',
  });

  // Response time threshold
  alertManager.registerThreshold('slow-response', {
    metric: 'response.time.p95',
    operator: 'gt',
    value: 2000, // milliseconds
    window: 60000, // 1 minute
    severity: AlertSeverity.WARNING,
    category: AlertCategory.PERFORMANCE,
    title: 'Slow Response Times',
    message: 'P95 response time (${value}ms) exceeds ${threshold}ms',
  });

  // Memory threshold
  alertManager.registerThreshold('high-memory', {
    metric: 'memory.usage.percent',
    operator: 'gt',
    value: 85,
    window: 300000,
    severity: AlertSeverity.WARNING,
    category: AlertCategory.SYSTEM,
    title: 'High Memory Usage',
    message: 'Memory usage (${value}%) exceeds ${threshold}%',
  });
}

// Record metrics (alerts trigger automatically)
function recordMetrics() {
  const errorRate = calculateErrorRate();
  alertManager.recordMetric('errors.per.minute', errorRate);

  const p95ResponseTime = calculateP95();
  alertManager.recordMetric('response.time.p95', p95ResponseTime);

  const memUsage = process.memoryUsage();
  const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  alertManager.recordMetric('memory.usage.percent', memPercent);
}
```

## Integration Examples

### Express Application

```typescript
import express from 'express';
import {
  correlationMiddleware,
  metricsMiddleware,
  loggingMiddleware,
  metricsEndpoint,
  enhancedLogger,
} from './observability';

const app = express();

// Apply observability middleware
app.use(correlationMiddleware);
app.use(metricsMiddleware);
app.use(loggingMiddleware);

// Expose metrics for Prometheus
app.get('/metrics', metricsEndpoint());

// Your routes
app.get('/api/users/:id', async (req, res) => {
  try {
    enhancedLogger.info('Fetching user', { userId: req.params.id });
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    enhancedLogger.error('Failed to fetch user', error, { userId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(3000);
```

### Background Job Processing

```typescript
import {
  correlationManager,
  enhancedLogger,
  metricsRegistry,
  alertManager,
  AlertSeverity,
  AlertCategory,
} from './observability';

class JobProcessor {
  async processJob(job: Job) {
    // Create correlation context for the job
    return correlationManager.run({ traceId: job.id, jobId: job.id }, async () => {
      const logger = enhancedLogger.child('JobProcessor');
      const startTime = Date.now();

      try {
        logger.info('Job started', { jobType: job.type });

        await this.executeJob(job);

        const duration = (Date.now() - startTime) / 1000;
        metricsRegistry.skillExecutionDuration.observe(
          { skill_id: 'job-processor', tool: job.type },
          duration,
        );
        metricsRegistry.skillExecutionTotal.inc({
          skill_id: 'job-processor',
          tool: job.type,
          status: 'success',
        });

        logger.info('Job completed', { duration: `${duration}s` });
      } catch (error) {
        logger.error('Job failed', error, { jobType: job.type });

        metricsRegistry.skillExecutionErrors.inc({
          skill_id: 'job-processor',
          tool: job.type,
          error_type: error instanceof Error ? error.name : 'unknown',
        });

        // Send alert for critical job failures
        if (job.priority === 'critical') {
          await alertManager.sendAlert(
            AlertSeverity.CRITICAL,
            AlertCategory.ERROR,
            'Critical Job Failed',
            `Job ${job.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            {
              jobId: job.id,
              jobType: job.type,
              priority: job.priority,
            },
          );
        }

        throw error;
      }
    });
  }

  private async executeJob(job: Job) {
    // Job execution logic
  }
}
```

### Database Query Monitoring

```typescript
import { metricsRegistry, enhancedLogger } from './observability';

class Database {
  private queryDuration = metricsRegistry.createHistogram(
    'db_query_duration_seconds',
    'Database query duration',
    ['operation', 'table'],
    [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  );

  async query(sql: string, params: unknown[]) {
    const operation = this.extractOperation(sql);
    const table = this.extractTable(sql);
    const timer = this.queryDuration.startTimer({ operation, table });

    try {
      const result = await this.executeQuery(sql, params);
      return result;
    } catch (error) {
      enhancedLogger.error('Query failed', error, {
        operation,
        table,
        sql: sql.substring(0, 100), // Only log first 100 chars
      });
      throw error;
    } finally {
      timer();
    }
  }

  private extractOperation(sql: string): string {
    const match = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE)/i);
    return match ? match[1].toUpperCase() : 'UNKNOWN';
  }

  private extractTable(sql: string): string {
    // Simplified table extraction
    const match = sql.match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/i);
    return match ? match[1] || match[2] || match[3] : 'unknown';
  }

  private async executeQuery(sql: string, params: unknown[]) {
    // Actual query execution
  }
}
```

## Testing with Observability

```typescript
import { describe, it, expect, vi } from 'vitest';
import { enhancedLogger, alertManager, AlertSeverity, AlertCategory } from './observability';

describe('UserService', () => {
  it('should log user creation', async () => {
    const infoSpy = vi.spyOn(enhancedLogger, 'info');

    await userService.createUser({ email: 'test@example.com' });

    expect(infoSpy).toHaveBeenCalledWith(
      'User created',
      expect.objectContaining({ userId: expect.any(String) }),
    );
  });

  it('should send alert on critical failure', async () => {
    const sendAlertSpy = vi.spyOn(alertManager, 'sendAlert');

    await criticalOperation().catch(() => {});

    expect(sendAlertSpy).toHaveBeenCalledWith(
      AlertSeverity.CRITICAL,
      AlertCategory.ERROR,
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
  });
});
```
