import { randomUUID } from 'node:crypto';
import { correlationManager } from '../correlation.js';
import type {
  Alert,
  AlertDispatcher,
  AlertSeverity,
  AlertCategory,
  AlertThreshold,
} from './types.js';

export class AlertManager {
  private static instance: AlertManager;
  private dispatchers: AlertDispatcher[] = [];
  private thresholds: Map<string, AlertThreshold> = new Map();
  private metricValues: Map<string, { value: number; timestamp: number }[]> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startThresholdChecking();
  }

  static getInstance(): AlertManager {
    if (!AlertManager.instance) {
      AlertManager.instance = new AlertManager();
    }
    return AlertManager.instance;
  }

  registerDispatcher(dispatcher: AlertDispatcher): void {
    this.dispatchers.push(dispatcher);
  }

  registerThreshold(id: string, threshold: AlertThreshold): void {
    this.thresholds.set(id, threshold);
  }

  unregisterThreshold(id: string): void {
    this.thresholds.delete(id);
  }

  async sendAlert(
    severity: AlertSeverity,
    category: AlertCategory,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const correlationContext = correlationManager.getContext();

    const alert: Alert = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      severity,
      category,
      title,
      message,
      metadata,
      traceId: correlationContext?.traceId,
    };

    await this.dispatch(alert);
  }

  private async dispatch(alert: Alert): Promise<void> {
    if (this.dispatchers.length === 0) {
      console.warn('No alert dispatchers registered. Alert not sent:', alert);
      return;
    }

    const promises = this.dispatchers.map((dispatcher) =>
      dispatcher.dispatch(alert).catch((error) => {
        console.error('Failed to dispatch alert:', error);
      }),
    );

    await Promise.all(promises);
  }

  recordMetric(metric: string, value: number): void {
    const timestamp = Date.now();

    if (!this.metricValues.has(metric)) {
      this.metricValues.set(metric, []);
    }

    const values = this.metricValues.get(metric)!;
    values.push({ value, timestamp });

    const maxAge = 5 * 60 * 1000;
    const cutoff = timestamp - maxAge;
    while (values.length > 0 && values[0] && values[0].timestamp < cutoff) {
      values.shift();
    }
  }

  private startThresholdChecking(): void {
    this.checkInterval = setInterval(() => {
      this.checkThresholds();
    }, 10000);

    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  private checkThresholds(): void {
    for (const [_id, threshold] of this.thresholds.entries()) {
      const values = this.metricValues.get(threshold.metric);
      if (!values || values.length === 0) {
        continue;
      }

      const windowMs = threshold.window || 60000;
      const cutoff = Date.now() - windowMs;
      const recentValues = values.filter((v) => v.timestamp >= cutoff);

      if (recentValues.length === 0) {
        continue;
      }

      const latestEntry = recentValues[recentValues.length - 1];
      if (!latestEntry) {
        continue;
      }
      const latestValue = latestEntry.value;
      const shouldAlert = this.evaluateThreshold(latestValue, threshold);

      if (shouldAlert) {
        this.sendAlert(
          threshold.severity,
          threshold.category,
          threshold.title,
          threshold.message
            .replace('${value}', String(latestValue))
            .replace('${threshold}', String(threshold.value)),
          {
            metric: threshold.metric,
            value: latestValue,
            threshold: threshold.value,
            operator: threshold.operator,
          },
        ).catch((error) => {
          console.error('Failed to send threshold alert:', error);
        });
      }
    }
  }

  private evaluateThreshold(value: number, threshold: AlertThreshold): boolean {
    switch (threshold.operator) {
      case 'gt':
        return value > threshold.value;
      case 'lt':
        return value < threshold.value;
      case 'gte':
        return value >= threshold.value;
      case 'lte':
        return value <= threshold.value;
      case 'eq':
        return value === threshold.value;
      default:
        return false;
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const alertManager = AlertManager.getInstance();
