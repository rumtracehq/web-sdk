export class ErrorIsolator {
  private readonly lastWarnAt = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  guard<T>(signature: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      this.warn(signature, err);
      return fallback;
    }
  }

  async guardAsync<T>(signature: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.warn(signature, err);
      return fallback;
    }
  }

  warn(signature: string, err: unknown): void {
    const now = this.now();
    const last = this.lastWarnAt.get(signature) ?? Number.NEGATIVE_INFINITY;
    if (now - last < 60_000) return;
    this.lastWarnAt.set(signature, now);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[rum-web-sdk]', signature, err);
    }
  }

  error(signature: string, message: string): void {
    const now = this.now();
    const last = this.lastWarnAt.get(`error:${signature}`) ?? Number.NEGATIVE_INFINITY;
    if (now - last < 60_000) return;
    this.lastWarnAt.set(`error:${signature}`, now);
    if (typeof console !== 'undefined' && console.error) {
      console.error('[rum-web-sdk]', message);
    }
  }
}
