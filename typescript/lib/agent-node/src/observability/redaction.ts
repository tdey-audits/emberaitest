export interface RedactionPattern {
  pattern: RegExp;
  replacement: string | ((substring: string, ...args: unknown[]) => string);
}

const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  // API Keys
  { pattern: /api[_-]?key["\s:=]+([a-zA-Z0-9_-]{20,})/gi, replacement: 'api_key=***REDACTED***' },
  { pattern: /bearer\s+([a-zA-Z0-9_-]{20,})/gi, replacement: 'Bearer ***REDACTED***' },

  // Secrets and tokens
  { pattern: /secret["\s:=]+([a-zA-Z0-9_-]{20,})/gi, replacement: 'secret=***REDACTED***' },
  { pattern: /token["\s:=]+([a-zA-Z0-9_-]{20,})/gi, replacement: 'token=***REDACTED***' },
  { pattern: /password["\s:=]+([^\s"']+)/gi, replacement: 'password=***REDACTED***' },
  { pattern: /passwd["\s:=]+([^\s"']+)/gi, replacement: 'passwd=***REDACTED***' },

  // Private keys
  {
    pattern:
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    replacement: '***PRIVATE_KEY_REDACTED***',
  },

  // Email addresses (simple redaction)
  { pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '***@$2' },

  // Credit card numbers
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '****-****-****-****' },

  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '***-**-****' },

  // Ethereum private keys and addresses (simple redaction)
  { pattern: /(0x[a-fA-F0-9]{64})/g, replacement: '0x****...****' },

  // Authorization headers
  { pattern: /authorization["\s:]+([^\s"']+)/gi, replacement: 'authorization: ***REDACTED***' },
];

export class SensitiveDataRedactor {
  private patterns: RedactionPattern[];

  constructor(additionalPatterns: RedactionPattern[] = []) {
    this.patterns = [...DEFAULT_REDACTION_PATTERNS, ...additionalPatterns];
  }

  redact(input: string): string {
    let result = input;
    for (const { pattern, replacement } of this.patterns) {
      result = result.replace(pattern, replacement as string);
    }
    return result;
  }

  redactObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.redact(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (this.isSensitiveKey(key)) {
          result[key] = '***REDACTED***';
        } else {
          result[key] = this.redactObject(value);
        }
      }
      return result;
    }

    return obj;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'passwd',
      'secret',
      'apiKey',
      'api_key',
      'token',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'privateKey',
      'private_key',
      'authorization',
      'auth',
      'creditCard',
      'credit_card',
      'ssn',
      'mnemonic',
    ];
    return sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase()));
  }

  addPattern(pattern: RedactionPattern): void {
    this.patterns.push(pattern);
  }
}

export const sensitiveDataRedactor = new SensitiveDataRedactor();
