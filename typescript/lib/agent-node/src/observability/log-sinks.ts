import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  namespace?: string;
}

export interface LogSink {
  write(entry: LogEntry): Promise<void> | void;
  flush?(): Promise<void>;
}

export class ConsoleLogSink implements LogSink {
  write(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);
    const level = entry.level.toUpperCase();

    switch (level) {
      case 'ERROR':
        console.error(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }
}

export class FileLogSink implements LogSink {
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;

  constructor(
    private readonly filePath: string,
    options: {
      bufferSize?: number;
      flushIntervalMs?: number;
    } = {},
  ) {
    this.bufferSize = options.bufferSize || 100;
    this.flushIntervalMs = options.flushIntervalMs || 5000;

    this.startFlushInterval();
  }

  private startFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        console.error('Error flushing log buffer:', error);
      });
    }, this.flushIntervalMs);

    if (this.flushInterval.unref) {
      this.flushInterval.unref();
    }
  }

  async write(entry: LogEntry): Promise<void> {
    this.buffer.push(JSON.stringify(entry));

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = this.buffer.splice(0, this.buffer.length);
    const content = entries.join('\n') + '\n';

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, content, 'utf-8');
    } catch (error) {
      console.error('Error writing to log file:', error);
      this.buffer.unshift(...entries);
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export class HttpLogSink implements LogSink {
  private buffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;

  constructor(
    private readonly endpoint: string,
    private readonly options: {
      bufferSize?: number;
      flushIntervalMs?: number;
      headers?: Record<string, string>;
    } = {},
  ) {
    this.bufferSize = options.bufferSize || 50;
    this.flushIntervalMs = options.flushIntervalMs || 10000;

    this.startFlushInterval();
  }

  private startFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        console.error('Error flushing HTTP log buffer:', error);
      });
    }, this.flushIntervalMs);

    if (this.flushInterval.unref) {
      this.flushInterval.unref();
    }
  }

  async write(entry: LogEntry): Promise<void> {
    this.buffer.push(entry);

    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const entries = this.buffer.splice(0, this.buffer.length);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify({ logs: entries }),
      });

      if (!response.ok) {
        console.error(`HTTP log sink failed with status ${response.status}`);
        this.buffer.unshift(...entries);
      }
    } catch (error) {
      console.error('Error sending logs to HTTP endpoint:', error);
      this.buffer.unshift(...entries);
    }
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }
}

export class MultiSink implements LogSink {
  constructor(private readonly sinks: LogSink[]) {}

  write(entry: LogEntry): void {
    for (const sink of this.sinks) {
      try {
        const result = sink.write(entry);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error('Error writing to sink:', error);
          });
        }
      } catch (error) {
        console.error('Error writing to sink:', error);
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all(this.sinks.filter((sink) => sink.flush).map((sink) => sink.flush!()));
  }
}
