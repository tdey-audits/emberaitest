import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationManager } from './correlation.js';
import { metricsRegistry } from './metrics.js';
import { enhancedLogger } from './enhanced-logger.js';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || randomUUID();
  const spanId = randomUUID();

  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('X-Span-Id', spanId);

  correlationManager.run({ traceId, spanId }, () => {
    next();
  });
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  metricsRegistry.activeConnections.inc({ type: 'http' });

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode.toString();

    metricsRegistry.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration,
    );

    metricsRegistry.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    if (res.statusCode >= 400) {
      metricsRegistry.httpRequestErrors.inc({
        method,
        route,
        error_type: res.statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }

    metricsRegistry.activeConnections.dec({ type: 'http' });
  });

  next();
}

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  enhancedLogger.info('HTTP request received', {
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.headers['user-agent'],
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    const logMethod = enhancedLogger[level as 'info' | 'warn' | 'error'].bind(enhancedLogger);
    logMethod(`HTTP request completed`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}

export function metricsEndpoint() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      res.set('Content-Type', metricsRegistry.registry.contentType);
      const metrics = await metricsRegistry.getMetrics();
      res.end(metrics);
    } catch (_error) {
      res.status(500).end('Error generating metrics');
    }
  };
}
