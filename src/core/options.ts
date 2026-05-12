import type { InstrumentationName, RumOptions } from '../types';
import { ErrorIsolator } from './error-isolator';

export const DEFAULT_COLLECTOR_URL = 'https://ingest.rumtrace.com/';

export const ALL_INSTRUMENTATIONS: InstrumentationName[] = [
  'page-load',
  'route-change',
  'network',
  'error',
  'interaction',
  'web-vitals',
  'resource-timing'
];

export interface NormalizedOptions extends RumOptions {
  collectorUrl: string;
  headers: Record<string, string>;
  sampleRate: number;
  enabledInstrumentations: InstrumentationName[];
  propagateTraceHeaders: boolean;
  propagateTraceHeadersAllowList: Array<string | RegExp>;
  captureBodies: boolean;
}

export function normalizeOptions(options: RumOptions | undefined, isolator: ErrorIsolator): NormalizedOptions | undefined {
  const collectorUrl = trimTrailingSlash(options?.collectorUrl ?? DEFAULT_COLLECTOR_URL);
  if (!collectorUrl.startsWith('https://')) {
    isolator.error('invalid-collector-url', 'collectorUrl must start with https://');
    return undefined;
  }

  let sampleRate = options?.sampleRate ?? 1;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    isolator.warn('invalid-sample-rate', `Invalid sampleRate ${String(options?.sampleRate)}; using 1.0`);
    sampleRate = 1;
  }

  const enabledInstrumentations = options?.enabledInstrumentations ?? ALL_INSTRUMENTATIONS;
  const headers = options?.headers ?? {};
  if (Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
    isolator.warn('authorization-header-override', 'options.headers overrides the built-in Authorization header');
  }

  return {
    ...options,
    collectorUrl,
    headers,
    sampleRate,
    enabledInstrumentations,
    propagateTraceHeaders: options?.propagateTraceHeaders ?? false,
    propagateTraceHeadersAllowList: options?.propagateTraceHeadersAllowList ?? [],
    captureBodies: options?.captureBodies ?? false
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
