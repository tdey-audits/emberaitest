export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertCategory {
  ERROR = 'error',
  PERFORMANCE = 'performance',
  RISK = 'risk',
  SYSTEM = 'system',
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

export interface AlertDispatcher {
  dispatch(alert: Alert): Promise<void>;
}

export interface AlertThreshold {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  window?: number;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  message: string;
}
