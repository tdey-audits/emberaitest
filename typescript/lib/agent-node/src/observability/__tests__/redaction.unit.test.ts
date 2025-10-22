import { describe, it, expect } from 'vitest';
import { SensitiveDataRedactor } from '../../../src/observability/redaction.js';

describe('SensitiveDataRedactor', () => {
  const redactor = new SensitiveDataRedactor();

  describe('redact', () => {
    it('should redact API keys', () => {
      const input = 'api_key=sk-1234567890abcdefghijklmnop';
      const result = redactor.redact(input);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('sk-1234567890abcdefghijklmnop');
    });

    it('should redact Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const result = redactor.redact(input);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact secrets', () => {
      const input = 'secret=my-super-secret-value-12345';
      const result = redactor.redact(input);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('my-super-secret-value-12345');
    });

    it('should redact passwords', () => {
      const input = 'password=MyP@ssw0rd!';
      const result = redactor.redact(input);
      expect(result).toContain('***REDACTED***');
      expect(result).not.toContain('MyP@ssw0rd!');
    });

    it('should redact private keys', () => {
      const input = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC
-----END PRIVATE KEY-----`;
      const result = redactor.redact(input);
      expect(result).toBe('***PRIVATE_KEY_REDACTED***');
    });

    it('should partially redact email addresses', () => {
      const input = 'user@example.com';
      const result = redactor.redact(input);
      expect(result).toContain('@example.com');
      expect(result).not.toContain('user@');
    });

    it('should redact credit card numbers', () => {
      const input = '4532-1234-5678-9010';
      const result = redactor.redact(input);
      expect(result).toBe('****-****-****-****');
    });

    it('should redact SSN', () => {
      const input = 'SSN: 123-45-6789';
      const result = redactor.redact(input);
      expect(result).toContain('***-**-****');
    });

    it('should partially redact Ethereum private keys', () => {
      const input = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const result = redactor.redact(input);
      expect(result).toBe('0x****...****');
      expect(result.length).toBeLessThan(input.length);
    });

    it('should not modify non-sensitive content', () => {
      const input = 'This is a normal message without secrets';
      const result = redactor.redact(input);
      expect(result).toBe(input);
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive keys in objects', () => {
      const input = {
        username: 'john',
        password: 'secret123',
        apiKey: 'sk-1234567890abcdefghij',
        normalField: 'normal value',
      };
      const result = redactor.redactObject(input);
      expect(result).toEqual({
        username: 'john',
        password: '***REDACTED***',
        apiKey: '***REDACTED***',
        normalField: 'normal value',
      });
    });

    it('should redact nested objects', () => {
      const input = {
        user: {
          name: 'john',
          credentials: {
            password: 'secret',
            token: 'abc123xyz',
          },
        },
        data: 'normal',
      };
      const result = redactor.redactObject(input);
      expect(result).toMatchObject({
        user: {
          name: 'john',
          credentials: {
            password: '***REDACTED***',
            token: '***REDACTED***',
          },
        },
        data: 'normal',
      });
    });

    it('should redact arrays', () => {
      const input = ['normal', 'password=secret123', 'another normal'];
      const result = redactor.redactObject(input);
      expect(result).toEqual([
        'normal',
        expect.stringContaining('***REDACTED***'),
        'another normal',
      ]);
    });

    it('should handle null and undefined', () => {
      expect(redactor.redactObject(null)).toBe(null);
      expect(redactor.redactObject(undefined)).toBe(undefined);
    });

    it('should handle primitive types', () => {
      expect(redactor.redactObject(123)).toBe(123);
      expect(redactor.redactObject(true)).toBe(true);
    });
  });

  describe('addPattern', () => {
    it('should allow adding custom redaction patterns', () => {
      const customRedactor = new SensitiveDataRedactor();
      customRedactor.addPattern({
        pattern: /CUSTOM-\d{6}/g,
        replacement: 'CUSTOM-REDACTED',
      });

      const input = 'My code is CUSTOM-123456';
      const result = customRedactor.redact(input);
      expect(result).toBe('My code is CUSTOM-REDACTED');
    });
  });
});
