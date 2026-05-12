import { describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { ALL_INSTRUMENTATIONS, normalizeOptions } from '../src/core/options';
import type { RumOptions } from '../src/types';

describe('normalizeOptions', () => {
  test('defaults to the RumTrace ingest collector', () => {
    const options = normalizeOptions(undefined, new ErrorIsolator());

    expect(options?.collectorUrl).toBe('https://ingest.rumtrace.com');
  });

  test('defaults to all core browser instrumentations', () => {
    const options = normalizeOptions({ collectorUrl: 'https://collector.example/otlp/' }, new ErrorIsolator());

    expect(options?.collectorUrl).toBe('https://collector.example/otlp');
    expect(options?.sampleRate).toBe(1);
    expect(options?.enabledInstrumentations).toEqual(ALL_INSTRUMENTATIONS);
    expect(options?.propagateTraceHeaders).toBe(false);
    expect(options?.captureBodies).toBe(false);
  });

  test('rejects non-https collector URLs with one console error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const options = normalizeOptions({ collectorUrl: 'http://collector.example/otlp' }, new ErrorIsolator());

    expect(options).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('invalid sampleRate falls back to 1 and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const options = normalizeOptions({ collectorUrl: 'https://collector.example/otlp', sampleRate: Number.NaN }, new ErrorIsolator());

    expect(options?.sampleRate).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('valid sampleRate is preserved', () => {
    const options = normalizeOptions({ collectorUrl: 'https://collector.example/otlp', sampleRate: 0.25 }, new ErrorIsolator());

    expect(options?.sampleRate).toBe(0.25);
  });

  test('authorization header override is accepted and warned about', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const options = normalizeOptions(
      { collectorUrl: 'https://collector.example/otlp', headers: { authorization: 'Basic abc' } },
      new ErrorIsolator()
    );

    expect(options?.headers.authorization).toBe('Basic abc');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('beforeSendBatch exposes batch metadata and boolean drop semantics', () => {
    const input: RumOptions = {
      collectorUrl: 'https://collector.example/otlp',
      beforeSendBatch: (metadata) => metadata.kind === 'traces' && metadata.size > 0
    };

    const options = normalizeOptions(input, new ErrorIsolator());

    expect(options?.beforeSendBatch?.({ kind: 'traces', size: 1 })).toBe(true);
    expect(options?.beforeSendBatch?.({ kind: 'logs', size: 1 })).toBe(false);
  });
});
