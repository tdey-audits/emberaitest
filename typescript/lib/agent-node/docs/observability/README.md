# Observability Stack

A comprehensive monitoring, logging, and alerting solution for the agent-node service.

## Features

- **Structured Logging**: JSON-formatted logs with correlation IDs and sensitive data redaction
- **Metrics Collection**: Prometheus-compatible metrics for HTTP, AI providers, and skills
- **Alert Dispatching**: Multi-channel alerting (Slack, Telegram, Email)
- **Correlation Tracking**: Trace requests across the system with correlation IDs
- **Configurable Sinks**: Log to console, file, or HTTP endpoints

## Quick Start

### Basic Usage

```typescript
import {
  enhancedLogger,
  metricsRegistry,
  alertManager,
  AlertSeverity,
  AlertCategory,
} from './observability';

// Logging with correlation
enhancedLogger.info('User logged in', {
  userId: 'user-123',
  method: 'oauth',
});

// Recording metrics
metricsRegistry.httpRequestTotal.inc({
  method: 'POST',
  route: '/api/chat',
  status_code: '200',
});

// Sending alerts
await alertManager.sendAlert(
  AlertSeverity.ERROR,
  AlertCategory.ERROR,
  'Database Connection Failed',
  'Unable to connect to primary database',
  { host: 'db-primary.example.com', port: 5432 },
);
```

### Express Integration

```typescript
import express from 'express';
import {
  correlationMiddleware,
  metricsMiddleware,
  loggingMiddleware,
  metricsEndpoint,
} from './observability/middleware';

const app = express();

// Add observability middleware
app.use(correlationMiddleware);
app.use(metricsMiddleware);
app.use(loggingMiddleware);

// Expose metrics endpoint
app.get('/metrics', metricsEndpoint());

// Your routes...
app.get('/api/chat', (req, res) => {
  res.json({ message: 'Hello' });
});

app.listen(3000);
```

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info                          # debug, info, warn, error
LOG_STRUCTURED=true                     # Enable JSON structured logs
LOG_FILE=/var/log/agent-node/app.log    # File logging
LOG_HTTP_ENDPOINT=https://logs.example.com  # HTTP log sink

# Alerts
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TELEGRAM_BOT_TOKEN=bot123:ABC...
TELEGRAM_CHAT_ID=123456789
SMTP_HOST=smtp.example.com
SMTP_PORT=587
ALERT_EMAIL_FROM=alerts@example.com
ALERT_EMAIL_TO=oncall@example.com
```

## Components

### Enhanced Logger

Supports structured logging with correlation IDs, sensitive data redaction, and multiple sinks.

```typescript
import { EnhancedLogger, LogLevel, FileLogSink } from './observability';

const logger = EnhancedLogger.getInstance({
  namespace: 'my-service',
  logLevel: LogLevel.INFO,
  structured: true,
  redactSensitiveData: true,
  sinks: [new FileLogSink('/var/log/app.log')],
});

logger.info('Processing request', { requestId: '123' });
logger.error('Failed to process', new Error('Network timeout'), { userId: 'user-1' });
```

### Correlation Manager

Tracks requests across async operations using AsyncLocalStorage.

```typescript
import { correlationManager } from './observability';

correlationManager.run({ traceId: 'req-123' }, () => {
  // All async operations within this callback
  // will have access to the correlation context
  const traceId = correlationManager.getTraceId(); // 'req-123'

  someAsyncFunction().then(() => {
    // Still has access to trace ID
    enhancedLogger.info('Operation complete');
  });
});
```

### Sensitive Data Redactor

Automatically redacts sensitive information from logs.

```typescript
import { sensitiveDataRedactor } from './observability';

const message = 'User logged in with password=secret123 and apiKey=sk-abc123';
const redacted = sensitiveDataRedactor.redact(message);
// 'User logged in with password=***REDACTED*** and apiKey=***REDACTED***'

const obj = {
  username: 'john',
  password: 'secret',
  email: 'john@example.com',
};
const redactedObj = sensitiveDataRedactor.redactObject(obj);
// { username: 'john', password: '***REDACTED***', email: 'j***n@example.com' }
```

### Metrics Registry

Prometheus-compatible metrics collection.

```typescript
import { metricsRegistry } from './observability';

// Using built-in metrics
const startTime = Date.now();
// ... do work
const duration = (Date.now() - startTime) / 1000;
metricsRegistry.httpRequestDuration.observe(
  { method: 'GET', route: '/api/user', status_code: '200' },
  duration,
);

// Creating custom metrics
const myCounter = metricsRegistry.createCounter('my_custom_counter', 'Description of counter', [
  'label1',
]);
myCounter.inc({ label1: 'value1' });

const myHistogram = metricsRegistry.createHistogram(
  'my_operation_duration',
  'Duration of my operation',
  ['operation'],
  [0.1, 0.5, 1, 2, 5],
);
const timer = myHistogram.startTimer({ operation: 'process' });
// ... do work
timer();
```

### Alert Manager

Threshold-based alerting with multiple dispatch channels.

```typescript
import {
  alertManager,
  SlackAlertDispatcher,
  EmailAlertDispatcher,
  AlertSeverity,
  AlertCategory,
} from './observability';

// Register dispatchers
alertManager.registerDispatcher(
  new SlackAlertDispatcher('https://hooks.slack.com/services/...', '#alerts'),
);

alertManager.registerDispatcher(
  new EmailAlertDispatcher({
    host: 'smtp.example.com',
    port: 587,
    auth: { user: 'alerts@example.com', pass: 'password' },
    from: 'alerts@example.com',
    to: 'oncall@example.com',
  }),
);

// Register threshold
alertManager.registerThreshold('high-error-rate', {
  metric: 'error.rate',
  operator: 'gt',
  value: 5,
  window: 300000, // 5 minutes
  severity: AlertSeverity.CRITICAL,
  category: AlertCategory.ERROR,
  title: 'High Error Rate',
  message: 'Error rate is ${value}%, exceeds threshold of ${threshold}%',
});

// Record metrics (alerts trigger automatically when thresholds exceeded)
alertManager.recordMetric('error.rate', 7.5);

// Manual alert
await alertManager.sendAlert(
  AlertSeverity.WARNING,
  AlertCategory.PERFORMANCE,
  'Slow Response Time',
  'API response time exceeded 2 seconds',
  { endpoint: '/api/chat', duration: '2.3s' },
);
```

## Log Sinks

### Console Sink

Default sink that outputs to console.

```typescript
import { ConsoleLogSink } from './observability';

const sink = new ConsoleLogSink();
```

### File Sink

Buffered file output with automatic rotation.

```typescript
import { FileLogSink } from './observability';

const sink = new FileLogSink('/var/log/app.log', {
  bufferSize: 100, // Flush after 100 entries
  flushIntervalMs: 5000, // Or every 5 seconds
});
```

### HTTP Sink

Send logs to external logging service.

```typescript
import { HttpLogSink } from './observability';

const sink = new HttpLogSink('https://logs.example.com/ingest', {
  bufferSize: 50,
  flushIntervalMs: 10000,
  headers: {
    Authorization: 'Bearer token123',
    'X-Service': 'agent-node',
  },
});
```

### Multi Sink

Combine multiple sinks.

```typescript
import { MultiSink, ConsoleLogSink, FileLogSink } from './observability';

const sink = new MultiSink([new ConsoleLogSink(), new FileLogSink('/var/log/app.log')]);
```

## Alert Dispatchers

### Slack

```typescript
import { SlackAlertDispatcher } from './observability';

const dispatcher = new SlackAlertDispatcher(
  'https://hooks.slack.com/services/T00/B00/XXX',
  '#alerts', // Optional channel override
);
```

### Telegram

```typescript
import { TelegramAlertDispatcher } from './observability';

const dispatcher = new TelegramAlertDispatcher(
  'bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
  '123456789', // Chat ID
);
```

### Email

```typescript
import { EmailAlertDispatcher } from './observability';

const dispatcher = new EmailAlertDispatcher({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'alerts@example.com',
    pass: 'app-password',
  },
  from: 'alerts@example.com',
  to: ['oncall@example.com', 'team@example.com'],
});
```

### Multi Dispatcher

```typescript
import { MultiAlertDispatcher } from './observability';

const dispatcher = new MultiAlertDispatcher([
  new SlackAlertDispatcher('webhook-url'),
  new EmailAlertDispatcher(config),
]);
```

## Best Practices

### Logging

1. **Use appropriate log levels**:
   - DEBUG: Detailed diagnostic information
   - INFO: General informational messages
   - WARN: Warning messages for potentially harmful situations
   - ERROR: Error events that might still allow the application to continue

2. **Include context**: Always include relevant context (user ID, trace ID, etc.)

3. **Use correlation IDs**: Wrap request handlers with correlation context

4. **Avoid logging sensitive data**: The redactor catches common patterns, but be mindful

5. **Use structured logging**: Easier to parse and query

### Metrics

1. **Keep label cardinality low**: Avoid high-cardinality labels (user IDs, timestamps)

2. **Use consistent naming**: Follow Prometheus naming conventions
   - Use base unit (seconds, bytes)
   - Use `_total` suffix for counters
   - Use `_seconds` or `_bytes` suffixes

3. **Choose appropriate metric types**:
   - Counter: Monotonically increasing values (request counts)
   - Gauge: Values that can go up or down (connections, memory)
   - Histogram: Distribution of values (latency, sizes)
   - Summary: Similar to histogram, with percentiles

4. **Set appropriate histogram buckets**: Based on expected value ranges

### Alerts

1. **Set meaningful thresholds**: Based on actual system behavior

2. **Use appropriate severity levels**:
   - INFO: Informational, no action needed
   - WARNING: Attention needed, not urgent
   - ERROR: Action required soon
   - CRITICAL: Immediate action required

3. **Include actionable information**: What's wrong and how to fix it

4. **Avoid alert fatigue**: Don't alert on every minor issue

5. **Use multiple channels**: Critical alerts should use multiple dispatchers

## Testing

Run the observability tests:

```bash
# Unit tests
pnpm test:unit tests/unit/observability

# All tests
pnpm test
```

## Documentation

- [Dashboards Guide](./dashboards.md) - Setting up Prometheus and Grafana dashboards
- [Runbook](./runbook.md) - Operational procedures and troubleshooting

## Architecture

```
observability/
├── correlation.ts          # AsyncLocalStorage-based correlation tracking
├── redaction.ts           # Sensitive data redaction
├── log-sinks.ts          # Log output destinations
├── enhanced-logger.ts    # Main logger implementation
├── metrics.ts            # Prometheus metrics registry
├── middleware.ts         # Express middleware
├── alerts/
│   ├── types.ts         # Alert type definitions
│   ├── dispatchers.ts   # Alert delivery implementations
│   └── alert-manager.ts # Alert coordination and thresholds
└── index.ts             # Public API exports
```

## Performance Considerations

- **Buffered sinks**: File and HTTP sinks use buffering to minimize I/O
- **Async operations**: Alert dispatch is non-blocking
- **Lazy evaluation**: Logs below threshold level are not processed
- **Memory management**: Metric values are automatically pruned
- **AsyncLocalStorage**: Minimal overhead for correlation tracking

## License

ISC
