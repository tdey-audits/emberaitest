import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlackAlertDispatcher,
  TelegramAlertDispatcher,
  EmailAlertDispatcher,
  MultiAlertDispatcher,
  ConsoleAlertDispatcher,
} from '../../../src/observability/alerts/dispatchers.js';
import {
  AlertSeverity,
  AlertCategory,
  type Alert,
} from '../../../src/observability/alerts/types.js';

describe('Alert Dispatchers', () => {
  const sampleAlert: Alert = {
    id: 'test-alert-1',
    timestamp: '2024-01-01T00:00:00.000Z',
    severity: AlertSeverity.ERROR,
    category: AlertCategory.ERROR,
    title: 'Test Alert',
    message: 'This is a test alert',
    metadata: { foo: 'bar' },
    traceId: 'trace-123',
  };

  describe('SlackAlertDispatcher', () => {
    let fetchMock: typeof global.fetch;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should dispatch alert to Slack webhook', async () => {
      const dispatcher = new SlackAlertDispatcher('https://hooks.slack.com/test');
      await dispatcher.dispatch(sampleAlert);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should include severity and category in message', async () => {
      const dispatcher = new SlackAlertDispatcher('https://hooks.slack.com/test');
      await dispatcher.dispatch(sampleAlert);

      const callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.attachments[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Severity', value: 'ERROR' }),
          expect.objectContaining({ title: 'Category', value: 'ERROR' }),
        ]),
      );
    });

    it('should include trace ID when present', async () => {
      const dispatcher = new SlackAlertDispatcher('https://hooks.slack.com/test');
      await dispatcher.dispatch(sampleAlert);

      const callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.attachments[0].fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Trace ID', value: 'trace-123' }),
        ]),
      );
    });

    it('should set color based on severity', async () => {
      const dispatcher = new SlackAlertDispatcher('https://hooks.slack.com/test');

      await dispatcher.dispatch({ ...sampleAlert, severity: AlertSeverity.CRITICAL });
      let callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
      let body = JSON.parse(callArgs[1].body);
      expect(body.attachments[0].color).toBe('danger');

      await dispatcher.dispatch({ ...sampleAlert, severity: AlertSeverity.WARNING });
      callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[1];
      body = JSON.parse(callArgs[1].body);
      expect(body.attachments[0].color).toBe('warning');

      await dispatcher.dispatch({ ...sampleAlert, severity: AlertSeverity.INFO });
      callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[2];
      body = JSON.parse(callArgs[1].body);
      expect(body.attachments[0].color).toBe('good');
    });

    it('should throw error on failed dispatch', async () => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = fetchMock;

      const dispatcher = new SlackAlertDispatcher('https://hooks.slack.com/test');
      await expect(dispatcher.dispatch(sampleAlert)).rejects.toThrow('Slack dispatch failed');
    });
  });

  describe('TelegramAlertDispatcher', () => {
    let fetchMock: typeof global.fetch;

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      global.fetch = fetchMock;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should dispatch alert to Telegram', async () => {
      const dispatcher = new TelegramAlertDispatcher('bot-token', 'chat-id');
      await dispatcher.dispatch(sampleAlert);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should format message with Markdown', async () => {
      const dispatcher = new TelegramAlertDispatcher('bot-token', 'chat-id');
      await dispatcher.dispatch(sampleAlert);

      const callArgs = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.parse_mode).toBe('Markdown');
      expect(body.text).toContain('*Test Alert*');
      expect(body.text).toContain('*Severity:* ERROR');
    });

    it('should throw error on failed dispatch', async () => {
      fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });
      global.fetch = fetchMock;

      const dispatcher = new TelegramAlertDispatcher('bot-token', 'chat-id');
      await expect(dispatcher.dispatch(sampleAlert)).rejects.toThrow('Telegram dispatch failed');
    });
  });

  describe('EmailAlertDispatcher', () => {
    it('should create transporter with config', () => {
      const dispatcher = new EmailAlertDispatcher({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
        from: 'alerts@example.com',
        to: 'admin@example.com',
      });

      expect(dispatcher).toBeDefined();
    });

    it('should format HTML email with alert details', async () => {
      const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-123' });

      const dispatcher = new EmailAlertDispatcher({
        host: 'smtp.example.com',
        port: 587,
        from: 'alerts@example.com',
        to: 'admin@example.com',
      });

      (
        dispatcher as unknown as { transporter: { sendMail: typeof sendMailMock } }
      ).transporter.sendMail = sendMailMock;

      await dispatcher.dispatch(sampleAlert);

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'alerts@example.com',
          to: 'admin@example.com',
          subject: '[ERROR] Test Alert',
          html: expect.stringContaining('Test Alert'),
        }),
      );
    });
  });

  describe('MultiAlertDispatcher', () => {
    it('should dispatch to all registered dispatchers', async () => {
      const dispatcher1 = { dispatch: vi.fn().mockResolvedValue(undefined) };
      const dispatcher2 = { dispatch: vi.fn().mockResolvedValue(undefined) };

      const multiDispatcher = new MultiAlertDispatcher([dispatcher1, dispatcher2]);
      await multiDispatcher.dispatch(sampleAlert);

      expect(dispatcher1.dispatch).toHaveBeenCalledWith(sampleAlert);
      expect(dispatcher2.dispatch).toHaveBeenCalledWith(sampleAlert);
    });

    it('should continue dispatching even if one fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const dispatcher1 = { dispatch: vi.fn().mockRejectedValue(new Error('Failed')) };
      const dispatcher2 = { dispatch: vi.fn().mockResolvedValue(undefined) };

      const multiDispatcher = new MultiAlertDispatcher([dispatcher1, dispatcher2]);
      await multiDispatcher.dispatch(sampleAlert);

      expect(dispatcher1.dispatch).toHaveBeenCalled();
      expect(dispatcher2.dispatch).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('ConsoleAlertDispatcher', () => {
    it('should log alert to console', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const dispatcher = new ConsoleAlertDispatcher();
      await dispatcher.dispatch(sampleAlert);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ALERT]',
        expect.stringContaining('test-alert-1'),
      );

      consoleLogSpy.mockRestore();
    });
  });
});
