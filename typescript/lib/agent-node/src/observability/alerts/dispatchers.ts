import { createTransport, type Transporter } from 'nodemailer';
import type { Alert, AlertDispatcher } from './types.js';

export class SlackAlertDispatcher implements AlertDispatcher {
  constructor(
    private readonly webhookUrl: string,
    private readonly channel?: string,
  ) {}

  async dispatch(alert: Alert): Promise<void> {
    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      channel: this.channel,
      attachments: [
        {
          color,
          title: `${emoji} ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Category',
              value: alert.category.toUpperCase(),
              short: true,
            },
            {
              title: 'Timestamp',
              value: alert.timestamp,
              short: true,
            },
            ...(alert.traceId
              ? [
                  {
                    title: 'Trace ID',
                    value: alert.traceId,
                    short: true,
                  },
                ]
              : []),
          ],
          ...(alert.metadata && Object.keys(alert.metadata).length > 0
            ? {
                footer: `Metadata: ${JSON.stringify(alert.metadata, null, 2)}`,
              }
            : {}),
        },
      ],
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack dispatch failed: ${response.status} ${response.statusText}`);
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'good';
      default:
        return '#808080';
    }
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  }
}

export class TelegramAlertDispatcher implements AlertDispatcher {
  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async dispatch(alert: Alert): Promise<void> {
    const emoji = this.getSeverityEmoji(alert.severity);

    let message = `${emoji} *${alert.title}*\n\n`;
    message += `${alert.message}\n\n`;
    message += `*Severity:* ${alert.severity.toUpperCase()}\n`;
    message += `*Category:* ${alert.category.toUpperCase()}\n`;
    message += `*Timestamp:* ${alert.timestamp}\n`;

    if (alert.traceId) {
      message += `*Trace ID:* \`${alert.traceId}\`\n`;
    }

    if (alert.metadata && Object.keys(alert.metadata).length > 0) {
      message += `\n*Metadata:*\n\`\`\`json\n${JSON.stringify(alert.metadata, null, 2)}\n\`\`\``;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram dispatch failed: ${response.status} ${response.statusText}`);
    }
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  }
}

export class EmailAlertDispatcher implements AlertDispatcher {
  private transporter: Transporter;

  constructor(
    private readonly config: {
      host: string;
      port: number;
      secure?: boolean;
      auth?: {
        user: string;
        pass: string;
      };
      from: string;
      to: string | string[];
    },
  ) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.auth,
    });
  }

  async dispatch(alert: Alert): Promise<void> {
    const emoji = this.getSeverityEmoji(alert.severity);

    const html = `
      <h2>${emoji} ${alert.title}</h2>
      <p>${alert.message}</p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Severity</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${alert.severity.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Category</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${alert.category.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Timestamp</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${alert.timestamp}</td>
        </tr>
        ${
          alert.traceId
            ? `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Trace ID</td>
          <td style="border: 1px solid #ddd; padding: 8px;"><code>${alert.traceId}</code></td>
        </tr>
        `
            : ''
        }
      </table>
      ${
        alert.metadata && Object.keys(alert.metadata).length > 0
          ? `
      <h3>Metadata</h3>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(alert.metadata, null, 2)}
      </pre>
      `
          : ''
      }
    `;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html,
    });
  }

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  }
}

export class MultiAlertDispatcher implements AlertDispatcher {
  constructor(private readonly dispatchers: AlertDispatcher[]) {}

  async dispatch(alert: Alert): Promise<void> {
    const results = await Promise.allSettled(
      this.dispatchers.map((dispatcher) => dispatcher.dispatch(alert)),
    );

    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(
        `${failures.length} alert dispatcher(s) failed:`,
        failures.map((f) => (f as PromiseRejectedResult).reason),
      );
    }
  }
}

export class ConsoleAlertDispatcher implements AlertDispatcher {
  async dispatch(alert: Alert): Promise<void> {
    console.log('[ALERT]', JSON.stringify(alert, null, 2));
  }
}
