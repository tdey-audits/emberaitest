import { correlationManager } from './correlation.js';
import { sensitiveDataRedactor } from './redaction.js';
import {
  ConsoleLogSink,
  FileLogSink,
  HttpLogSink,
  MultiSink,
  type LogSink,
  type LogEntry,
} from './log-sinks.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  traceId?: string;
  spanId?: string;
  skillId?: string;
  tool?: string;
  event?: string;
  error?: unknown;
  [key: string]: unknown;
}

export interface EnhancedLoggerOptions {
  namespace?: string;
  logLevel?: LogLevel;
  structured?: boolean;
  redactSensitiveData?: boolean;
  sinks?: LogSink[];
}

export class EnhancedLogger {
  private static instance: EnhancedLogger;
  private logLevel: LogLevel;
  private namespace?: string;
  private structured: boolean;
  private redactSensitiveData: boolean;
  private sink: LogSink;

  private constructor(options: EnhancedLoggerOptions = {}) {
    this.namespace = options.namespace;
    this.logLevel = options.logLevel ?? this.getLogLevelFromEnv();
    this.structured = options.structured ?? this.getStructuredFromEnv();
    this.redactSensitiveData = options.redactSensitiveData ?? true;

    if (options.sinks && options.sinks.length > 0) {
      this.sink =
        options.sinks.length === 1 && options.sinks[0] ? options.sinks[0] : new MultiSink(options.sinks);
    } else {
      this.sink = this.createDefaultSink();
    }
  }

  private getLogLevelFromEnv(): LogLevel {
    const envLogLevel = (process.env['LOG_LEVEL'] || 'info').toUpperCase();
    return LogLevel[envLogLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private getStructuredFromEnv(): boolean {
    return (process.env['LOG_STRUCTURED'] || 'false').toLowerCase() === 'true';
  }

  private createDefaultSink(): LogSink {
    const sinks: LogSink[] = [new ConsoleLogSink()];

    const logFile = process.env['LOG_FILE'];
    if (logFile) {
      sinks.push(
        new FileLogSink(logFile, {
          bufferSize: parseInt(process.env['LOG_FILE_BUFFER_SIZE'] || '100', 10),
          flushIntervalMs: parseInt(process.env['LOG_FILE_FLUSH_INTERVAL'] || '5000', 10),
        }),
      );
    }

    const logHttpEndpoint = process.env['LOG_HTTP_ENDPOINT'];
    if (logHttpEndpoint) {
      const headers: Record<string, string> = {};
      const authHeader = process.env['LOG_HTTP_AUTH_HEADER'];
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      sinks.push(
        new HttpLogSink(logHttpEndpoint, {
          bufferSize: parseInt(process.env['LOG_HTTP_BUFFER_SIZE'] || '50', 10),
          flushIntervalMs: parseInt(process.env['LOG_HTTP_FLUSH_INTERVAL'] || '10000', 10),
          headers,
        }),
      );
    }

    return sinks.length === 1 && sinks[0] ? sinks[0] : new MultiSink(sinks);
  }

  static getInstance(options?: EnhancedLoggerOptions): EnhancedLogger {
    if (!EnhancedLogger.instance) {
      EnhancedLogger.instance = new EnhancedLogger(options);
    }
    if (options?.namespace) {
      return new EnhancedLogger(options);
    }
    return EnhancedLogger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private prepareContext(context?: LogContext): LogContext {
    const correlationContext = correlationManager.getContext();
    const mergedContext: LogContext = {
      ...context,
      traceId: context?.traceId || correlationContext?.traceId,
      spanId: context?.spanId || correlationContext?.spanId,
      skillId: context?.skillId || correlationContext?.skillId,
      userId: correlationContext?.userId,
    };

    if (this.redactSensitiveData) {
      return sensitiveDataRedactor.redactObject(mergedContext) as LogContext;
    }

    return mergedContext;
  }

  private createLogEntry(level: string, message: string, context?: LogContext): LogEntry {
    const preparedContext = this.prepareContext(context);

    return {
      timestamp: new Date().toISOString(),
      level,
      message: this.redactSensitiveData ? sensitiveDataRedactor.redact(message) : message,
      ...(this.namespace ? { namespace: this.namespace } : {}),
      traceId: preparedContext.traceId,
      spanId: preparedContext.spanId,
      context: preparedContext,
    };
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry('DEBUG', message, context);
      this.sink.write(entry);
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry('INFO', message, context);
      this.sink.write(entry);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry('WARN', message, context);
      this.sink.write(entry);
    }
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorContext: LogContext = {
        ...context,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
      };

      const entry = this.createLogEntry('ERROR', message, errorContext);
      this.sink.write(entry);
    }
  }

  child(namespace: string): EnhancedLogger {
    const fullNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace;
    return new EnhancedLogger({
      namespace: fullNamespace,
      logLevel: this.logLevel,
      structured: this.structured,
      redactSensitiveData: this.redactSensitiveData,
      sinks: [this.sink],
    });
  }

  async flush(): Promise<void> {
    if (this.sink.flush) {
      await this.sink.flush();
    }
  }
}

export const enhancedLogger = EnhancedLogger.getInstance();
