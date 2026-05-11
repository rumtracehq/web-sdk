import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { normalizeOptions } from '../src/core/options';
import { enableFetchTracePropagation, traceparent } from '../src/instrumentation/fetch-propagation';

const spanContext = {
  traceId: '11111111111111111111111111111111',
  spanId: '2222222222222222',
  traceFlags: 1
};

describe('fetch trace propagation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('formats W3C traceparent from a span context', () => {
    expect(traceparent(spanContext)).toBe('00-11111111111111111111111111111111-2222222222222222-01');
  });

  test('injects traceparent for allowlisted fetch requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['https://proxy.rumtrace.com/']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://proxy.rumtrace.com/products');
    cleanup();

    const headers = fetchImpl.mock.calls[0][1].headers as Headers;
    expect(headers.get('traceparent')).toBe('00-11111111111111111111111111111111-2222222222222222-01');
  });

  test('allows exact origin string entries for same-origin subpaths', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['https://api.example.com']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://api.example.com/v1/products');
    cleanup();

    const headers = fetchImpl.mock.calls[0][1].headers as Headers;
    expect(headers.get('traceparent')).toBe('00-11111111111111111111111111111111-2222222222222222-01');
  });

  test('does not treat string entries as broad substring matches', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['api.example.com']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://unrelated.example/search?q=api.example.com');
    cleanup();

    expect(fetchImpl.mock.calls[0][1]).toBeUndefined();
  });

  test('supports relative URL allow-list entries', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['/api/']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('/api/products');
    cleanup();

    const headers = fetchImpl.mock.calls[0][1].headers as Headers;
    expect(headers.get('traceparent')).toBe('00-11111111111111111111111111111111-2222222222222222-01');
  });

  test('supports user-owned RegExp allow-list entries', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: [/^https:\/\/regexp-api\.example\/v\d+\//]
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://regexp-api.example/v1/products');
    cleanup();

    const headers = fetchImpl.mock.calls[0][1].headers as Headers;
    expect(headers.get('traceparent')).toBe('00-11111111111111111111111111111111-2222222222222222-01');
  });

  test('does not match adjacent path prefixes', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['https://api.example.com/v1']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://api.example.com/v10/products');
    cleanup();

    expect(fetchImpl.mock.calls[0][1]).toBeUndefined();
  });

  test('does not inject traceparent for collector requests', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    globalThis.fetch = fetchImpl;
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      propagateTraceHeaders: true,
      propagateTraceHeadersAllowList: ['https://collector.example/']
    }, new ErrorIsolator());

    const cleanup = enableFetchTracePropagation(options!, () => spanContext);
    await fetch('https://collector.example/otlp/v1/traces');
    cleanup();

    expect(fetchImpl.mock.calls[0][1]).toBeUndefined();
  });
});
