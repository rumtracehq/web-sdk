import { ErrorIsolator } from '../core/error-isolator';

export interface RetryControllerOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onDroppedBatch?: () => void;
}

export class RetryController {
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly isolator: ErrorIsolator, options: RetryControllerOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onDroppedBatch = options.onDroppedBatch;
  }

  private readonly onDroppedBatch: (() => void) | undefined;

  async run(send: () => Promise<Response>): Promise<Response | undefined> {
    let attempt = 0;
    while (true) {
      const response = await send();
      if (response.status >= 200 && response.status < 300) return response;
      if (response.status >= 500 && response.status <= 599) {
        if (attempt >= this.maxRetries) return this.drop();
        await this.sleep(this.initialBackoffMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      if (response.status === 429) {
        if (attempt >= this.maxRetries) return this.drop();
        await this.sleep(parseRetryAfter(response.headers.get('Retry-After')) ?? this.initialBackoffMs);
        attempt += 1;
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        this.isolator.warn('export-auth-failed', `Collector returned ${response.status}; dropping telemetry batch`);
        return this.drop();
      }
      if (response.status >= 400 && response.status <= 499) return this.drop();
      return response;
    }
  }

  private drop(): undefined {
    this.onDroppedBatch?.();
    return undefined;
  }
}

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}
