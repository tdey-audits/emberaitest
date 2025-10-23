# Operational Runbook

This runbook provides step-by-step procedures for common operational scenarios and incident response.

## Table of Contents

1. [Alert Response Procedures](#alert-response-procedures)
2. [Common Issues and Resolution](#common-issues-and-resolution)
3. [Performance Troubleshooting](#performance-troubleshooting)
4. [Log Analysis](#log-analysis)
5. [Incident Response Workflow](#incident-response-workflow)

## Alert Response Procedures

### High Error Rate Alert

**Severity**: Warning/Critical  
**Trigger**: HTTP error rate > 5% for 5 minutes

**Investigation Steps**:

1. Check the dashboard for error distribution by endpoint

   ```promql
   rate(http_request_errors_total[5m]) by (route, error_type)
   ```

2. Review recent logs for error patterns

   ```bash
   # If using structured logs
   grep '"level":"ERROR"' /var/log/agent-node/app.log | tail -n 100
   ```

3. Check trace IDs for affected requests in logs

4. Verify external dependencies (AI providers, databases)

**Resolution**:

- If specific endpoint: Review recent deployments, rollback if necessary
- If provider errors: Check provider status pages, enable circuit breaker
- If database errors: Check connection pool, database health

### High Latency Alert

**Severity**: Warning  
**Trigger**: P95 latency > 2s for 5 minutes

**Investigation Steps**:

1. Identify slow endpoints

   ```promql
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (route)
   ```

2. Check AI provider latency

   ```promql
   histogram_quantile(0.95, rate(ai_request_duration_seconds_bucket[5m])) by (provider)
   ```

3. Review system resources (CPU, memory)

4. Check for database slow queries

**Resolution**:

- Scale horizontally if CPU/memory constrained
- Enable caching for frequently accessed data
- Optimize slow database queries
- Consider async processing for long-running operations

### Memory Usage High Alert

**Severity**: Warning  
**Trigger**: Heap usage > 90% for 10 minutes

**Investigation Steps**:

1. Check memory trends

   ```promql
   memory_usage_bytes{type="heap_used"} / memory_usage_bytes{type="heap_total"}
   ```

2. Look for memory leak patterns (steadily increasing)

3. Review recent deployments

4. Check for resource-intensive operations

**Resolution**:

- Restart service if memory leak suspected
- Investigate heap snapshots if available
- Review code for unbounded data structures
- Increase memory allocation if legitimate usage

### AI Provider Errors Alert

**Severity**: Critical  
**Trigger**: AI provider error rate > 10% for 5 minutes

**Investigation Steps**:

1. Identify affected provider

   ```promql
   rate(ai_request_errors_total[5m]) by (provider, error_type)
   ```

2. Check provider status page

3. Review error messages in logs

4. Verify API keys and quotas

**Resolution**:

- Switch to backup provider if available
- Implement exponential backoff
- Check rate limiting settings
- Contact provider support if widespread

## Common Issues and Resolution

### Issue: Service Won't Start

**Symptoms**: Service fails to start or immediately crashes

**Checks**:

1. Review startup logs

   ```bash
   journalctl -u agent-node -n 100
   ```

2. Verify environment variables

   ```bash
   # Check required variables
   echo $API_KEY $DATABASE_URL $PORT
   ```

3. Check port availability
   ```bash
   lsof -i :3000
   ```

**Resolution**:

- Fix missing/invalid environment variables
- Free up required ports
- Check file permissions
- Verify dependencies are installed

### Issue: Database Connection Errors

**Symptoms**: "Cannot connect to database" errors

**Checks**:

1. Verify database is running

   ```bash
   docker ps | grep postgres
   ```

2. Test connectivity

   ```bash
   telnet db-host 5432
   ```

3. Check connection string format

**Resolution**:

- Restart database service
- Update firewall rules
- Verify credentials
- Check connection pool settings

### Issue: AI Provider Timeout

**Symptoms**: Requests to AI providers timing out

**Checks**:

1. Check provider status page
2. Review timeout configuration
3. Verify network connectivity
4. Check rate limits

**Resolution**:

- Increase timeout settings
- Implement retry logic with backoff
- Switch to alternative provider
- Review request payload size

### Issue: Log Files Growing Too Large

**Symptoms**: Disk space issues due to large logs

**Checks**:

1. Check log file sizes

   ```bash
   du -sh /var/log/agent-node/*
   ```

2. Review log level configuration

**Resolution**:

- Implement log rotation
  ```bash
  # Add to /etc/logrotate.d/agent-node
  /var/log/agent-node/*.log {
      daily
      rotate 7
      compress
      delaycompress
      missingok
      notifempty
  }
  ```
- Increase log level in production (INFO or WARN)
- Use log aggregation service

## Performance Troubleshooting

### Identifying Bottlenecks

1. **Check Request Distribution**

   ```promql
   topk(10, rate(http_requests_total[5m])) by (route)
   ```

2. **Find Slowest Endpoints**

   ```promql
   topk(10, histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (route))
   ```

3. **Check Resource Usage**
   ```promql
   rate(process_cpu_seconds_total[5m])
   ```

### Optimization Steps

1. **Enable Caching**
   - Implement Redis for frequently accessed data
   - Use HTTP caching headers

2. **Database Optimization**
   - Add indexes for slow queries
   - Enable connection pooling
   - Consider read replicas

3. **Async Processing**
   - Move heavy operations to background jobs
   - Implement message queues

4. **Scale Horizontally**
   - Add more service instances
   - Use load balancer for distribution

## Log Analysis

### Structured Log Queries

When using structured logging (`LOG_STRUCTURED=true`), logs are in JSON format:

```bash
# Find errors with trace ID
grep '"level":"ERROR"' app.log | jq '. | select(.traceId == "xyz")'

# Count errors by type
grep '"level":"ERROR"' app.log | jq -r '.error.name' | sort | uniq -c

# Find slow requests
grep '"event":"request_completed"' app.log | jq '. | select(.duration > 1000)'

# Extract all trace IDs for errors
grep '"level":"ERROR"' app.log | jq -r '.traceId' | sort | uniq
```

### Correlation ID Tracing

Follow a request through the system:

```bash
# Get all logs for a trace ID
TRACE_ID="550e8400-e29b-41d4-a716-446655440000"
grep "$TRACE_ID" app.log | jq .
```

### Sensitive Data Verification

Verify that sensitive data is being redacted:

```bash
# Check for potential leaks (should return nothing)
grep -E 'api[_-]?key|password|secret' app.log | grep -v REDACTED
```

## Incident Response Workflow

### Phase 1: Detection and Triage

1. **Acknowledge Alert**: Respond to alert notification
2. **Assess Severity**: Determine impact (users affected, services down)
3. **Create Incident Ticket**: Document start time, symptoms
4. **Notify Stakeholders**: Alert team based on severity

### Phase 2: Investigation

1. **Gather Information**:
   - Check metrics dashboard
   - Review recent logs
   - Identify affected components
   - Check for recent deployments

2. **Formulate Hypothesis**:
   - Based on symptoms and metrics
   - Consider recent changes
   - Review similar past incidents

3. **Test Hypothesis**:
   - Use logs and metrics to validate
   - Reproduce issue if possible

### Phase 3: Resolution

1. **Implement Fix**:
   - Apply appropriate resolution from runbook
   - Document all actions taken
   - Monitor metrics during resolution

2. **Verify Resolution**:
   - Check that metrics return to normal
   - Verify user-reported issues resolved
   - Test affected functionality

3. **Communicate**:
   - Update stakeholders
   - Document resolution

### Phase 4: Post-Incident Review

1. **Document Timeline**:
   - Detection time
   - Response time
   - Resolution time
   - Impact duration

2. **Root Cause Analysis**:
   - What happened
   - Why it happened
   - Why it wasn't detected earlier

3. **Action Items**:
   - Preventive measures
   - Monitoring improvements
   - Runbook updates

## Configuration Reference

### Environment Variables

```bash
# Logging Configuration
LOG_LEVEL=info                    # debug, info, warn, error
LOG_STRUCTURED=true               # Enable JSON structured logs
LOG_FILE=/var/log/agent-node/app.log
LOG_FILE_BUFFER_SIZE=100
LOG_FILE_FLUSH_INTERVAL=5000

# HTTP Log Sink
LOG_HTTP_ENDPOINT=https://logs.example.com/ingest
LOG_HTTP_AUTH_HEADER=Bearer token123
LOG_HTTP_BUFFER_SIZE=50
LOG_HTTP_FLUSH_INTERVAL=10000

# Alert Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TELEGRAM_BOT_TOKEN=bot123456:ABC...
TELEGRAM_CHAT_ID=123456789
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=password
ALERT_EMAIL_FROM=alerts@example.com
ALERT_EMAIL_TO=oncall@example.com
```

### Alert Threshold Examples

```typescript
import { alertManager, AlertSeverity, AlertCategory } from './observability';

// High error rate
alertManager.registerThreshold('high-error-rate', {
  metric: 'error.rate',
  operator: 'gt',
  value: 5,
  window: 300000, // 5 minutes
  severity: AlertSeverity.CRITICAL,
  category: AlertCategory.ERROR,
  title: 'High Error Rate',
  message: 'Error rate is ${value}%, threshold is ${threshold}%',
});

// Low memory
alertManager.registerThreshold('low-memory', {
  metric: 'memory.available',
  operator: 'lt',
  value: 100 * 1024 * 1024, // 100MB
  window: 60000,
  severity: AlertSeverity.WARNING,
  category: AlertCategory.SYSTEM,
  title: 'Low Memory',
  message: 'Available memory is ${value} bytes',
});
```

## Emergency Contacts

- **On-Call Engineer**: [Slack Channel / Phone]
- **Platform Team**: [Contact Info]
- **Database Admin**: [Contact Info]
- **AI Provider Support**: [Contact Info]

## Quick Reference Commands

```bash
# Check service status
systemctl status agent-node

# View recent logs
journalctl -u agent-node -n 100 -f

# Restart service
systemctl restart agent-node

# Check metrics endpoint
curl http://localhost:3000/metrics

# Check health endpoint
curl http://localhost:3000/health

# Force log flush
kill -USR1 $(pgrep -f agent-node)
```
