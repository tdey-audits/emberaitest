export class RiskViolationError extends Error {
  public readonly invariant: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: { invariant: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'RiskViolationError';
    this.invariant = options.invariant;
    this.details = options.details;
  }
}
