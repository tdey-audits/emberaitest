# Operational Dashboards Guide

This guide provides information on setting up and using operational dashboards for monitoring the agent-node service.

## Overview

The agent-node service exposes Prometheus-compatible metrics at the `/metrics` endpoint. These metrics can be scraped by Prometheus and visualized using Grafana or other compatible tools.

## Prometheus Setup

### 1. Configure Prometheus

Add the following job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'agent-node'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
```

### 2. Start Prometheus

```bash
docker run -p 9090:9090 -v /path/to/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

### 3. Verify Metrics Collection

Visit `http://localhost:9090/targets` to ensure the agent-node target is up and being scraped successfully.

## Available Metrics

### HTTP Metrics

- **http_request_duration_seconds**: Duration of HTTP requests (histogram)
  - Labels: `method`, `route`, `status_code`
  - Use for: Tracking request latency and identifying slow endpoints

- **http_requests_total**: Total number of HTTP requests (counter)
  - Labels: `method`, `route`, `status_code`
  - Use for: Request rate and traffic patterns

- **http_request_errors_total**: Total number of HTTP errors (counter)
  - Labels: `method`, `route`, `error_type`
  - Use for: Error rate monitoring

### AI Provider Metrics

- **ai_request_duration_seconds**: Duration of AI provider requests (histogram)
  - Labels: `provider`, `model`, `operation`
  - Use for: Tracking AI provider latency

- **ai_requests_total**: Total number of AI requests (counter)
  - Labels: `provider`, `model`, `operation`, `status`
  - Use for: AI provider usage and success rates

- **ai_request_errors_total**: Total AI provider errors (counter)
  - Labels: `provider`, `model`, `error_type`
  - Use for: AI provider error monitoring

- **ai_tokens_used_total**: Total AI tokens consumed (counter)
  - Labels: `provider`, `model`, `token_type`
  - Use for: Cost tracking and usage analysis

### Skill Execution Metrics

- **skill_execution_duration_seconds**: Duration of skill executions (histogram)
  - Labels: `skill_id`, `tool`
  - Use for: Skill performance monitoring

- **skill_executions_total**: Total skill executions (counter)
  - Labels: `skill_id`, `tool`, `status`
  - Use for: Skill usage patterns

- **skill_execution_errors_total**: Total skill execution errors (counter)
  - Labels: `skill_id`, `tool`, `error_type`
  - Use for: Skill error tracking

### System Metrics

- **active_connections**: Number of active connections (gauge)
  - Labels: `type`
  - Use for: Connection pool monitoring

- **memory_usage_bytes**: Memory usage in bytes (gauge)
  - Labels: `type` (heap_used, heap_total, rss, external)
  - Use for: Memory leak detection and capacity planning

- **agent*node_process*\***: Standard Node.js process metrics
  - CPU usage, event loop lag, etc.

## Grafana Dashboard Configuration

### Creating a Dashboard

1. **Add Prometheus Data Source**
   - Navigate to Configuration > Data Sources
   - Add Prometheus with URL: `http://prometheus:9090`

2. **Import Dashboard Template**
   - Use the provided template or create custom panels

### Recommended Panels

#### 1. HTTP Request Rate

```promql
rate(http_requests_total[5m])
```

#### 2. HTTP Error Rate

```promql
rate(http_request_errors_total[5m]) / rate(http_requests_total[5m])
```

#### 3. HTTP Latency (P95)

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

#### 4. AI Request Duration

```promql
histogram_quantile(0.95, rate(ai_request_duration_seconds_bucket[5m])) by (provider, model)
```

#### 5. AI Token Usage by Provider

```promql
sum(rate(ai_tokens_used_total[5m])) by (provider, model)
```

#### 6. Skill Execution Success Rate

```promql
rate(skill_executions_total{status="success"}[5m]) / rate(skill_executions_total[5m])
```

#### 7. Memory Usage

```promql
memory_usage_bytes{type="heap_used"} / memory_usage_bytes{type="heap_total"}
```

#### 8. Active Connections

```promql
active_connections
```

## Alert Rules

### Prometheus Alert Rules

Create an `alerts.yml` file:

```yaml
groups:
  - name: agent-node
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_request_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High error rate detected'
          description: 'Error rate is {{ $value | humanizePercentage }} over the last 5 minutes'

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'High latency detected'
          description: 'P95 latency is {{ $value }}s'

      - alert: AIProviderErrors
        expr: rate(ai_request_errors_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'AI provider errors detected'
          description: '{{ $labels.provider }} error rate is high'

      - alert: MemoryUsageHigh
        expr: memory_usage_bytes{type="heap_used"} / memory_usage_bytes{type="heap_total"} > 0.9
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'High memory usage'
          description: 'Heap usage is {{ $value | humanizePercentage }}'
```

## Custom Dashboards

### Creating Custom Metrics

```typescript
import { metricsRegistry } from './observability';

const myCounter = metricsRegistry.createCounter('my_custom_metric', 'Description of my metric', [
  'label1',
  'label2',
]);

myCounter.inc({ label1: 'value1', label2: 'value2' });
```

### Creating Custom Histograms

```typescript
const myHistogram = metricsRegistry.createHistogram(
  'my_duration_seconds',
  'Duration of my operation',
  ['operation'],
  [0.1, 0.5, 1, 2, 5],
);

const timer = myHistogram.startTimer({ operation: 'process' });
// ... do work
timer();
```

## Best Practices

1. **Use consistent label names** across metrics
2. **Keep label cardinality low** to avoid metric explosion
3. **Use histograms for latency** measurements, not gauges
4. **Set appropriate bucket ranges** for histograms based on expected values
5. **Monitor query performance** in Prometheus to avoid overload
6. **Set up retention policies** appropriate for your needs
7. **Create composite dashboards** that show related metrics together
8. **Use templating** in Grafana for environment-specific dashboards

## Troubleshooting

### Metrics Not Appearing

1. Check that the `/metrics` endpoint is accessible
2. Verify Prometheus can reach the agent-node service
3. Check Prometheus logs for scrape errors
4. Ensure label values don't contain special characters

### High Cardinality Issues

- Review label usage and reduce unique combinations
- Consider aggregating before storing
- Use recording rules for expensive queries

### Missing Historical Data

- Check Prometheus retention settings
- Verify storage isn't full
- Review scrape interval configuration
