import { afterEach, describe, expect, test, vi } from 'vitest';
import type { InstrumentationName } from '../src/types';
import { ErrorIsolator } from '../src/core/error-isolator';
import { normalizeOptions } from '../src/core/options';
import { enableCustomInstrumentations } from '../src/instrumentation/custom';
import { registerOtelInstrumentations } from '../src/instrumentation/otel';

describe('privacy redaction', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
  });

  test('redacts route URLs before emitting route spans', () => {
    history.replaceState(null, '', '/from?token=secret&tab=details');
    const { spans, session, cleanup } = enableCustomHarness(['route-change']);

    history.pushState(null, '', '/to?password=hunter2&tab=reviews');
    cleanup();

    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['route.from']).toContain('token=%5BREDACTED%5D');
    expect(spans[0].attributes['route.from']).not.toContain('secret');
    expect(spans[0].attributes['route.to']).toContain('password=%5BREDACTED%5D');
    expect(spans[0].attributes['route.to']).not.toContain('hunter2');
    expect(session.setRouteCurrent).toHaveBeenCalledWith(expect.stringContaining('password=%5BREDACTED%5D'));
  });

  test('bounds error messages and stacks and redacts source URLs', () => {
    vi.useFakeTimers();
    const logger = { emit: vi.fn() };
    const { cleanup } = enableCustomHarness(['error'], { logger });
    const error = new Error('x'.repeat(2000));
    error.stack = `Error: boom\n    at fn (https://app.example/main.js?token=secret:1:2)\n${'s'.repeat(5000)}`;

    window.dispatchEvent(new ErrorEvent('error', {
      message: 'm'.repeat(2000),
      filename: 'https://app.example/main.js?token=secret',
      lineno: 1,
      colno: 2,
      error
    }));
    vi.runAllTimers();
    cleanup();

    expect(logger.emit).toHaveBeenCalledTimes(1);
    const record = logger.emit.mock.calls[0][0];
    expect(record.body).toHaveLength(1024);
    expect(record.attributes['error.stack']).toHaveLength(4096);
    expect(record.attributes['error.stack']).toContain('token=%5BREDACTED%5D');
    expect(record.attributes['error.stack']).not.toContain('secret');
    expect(record.attributes['source.file']).toContain('token=%5BREDACTED%5D');
    expect(record.attributes['source.file']).not.toContain('secret');
    expect(record.attributes['error.fingerprint']).toMatch(/^[0-9a-f]{8}$/);
  });

  test('flushes pending debounced errors during cleanup', () => {
    vi.useFakeTimers();
    const logger = { emit: vi.fn() };
    const { cleanup } = enableCustomHarness(['error'], { logger });

    window.dispatchEvent(new ErrorEvent('error', {
      message: 'boom',
      filename: 'https://app.example/main.js',
      error: new Error('boom')
    }));
    cleanup();

    expect(logger.emit).toHaveBeenCalledTimes(1);
    expect(logger.emit.mock.calls[0][0].attributes['error.count']).toBe(1);
  });

  test('uses the error fingerprint to debounce matching errors', () => {
    vi.useFakeTimers();
    const logger = { emit: vi.fn() };
    const { cleanup } = enableCustomHarness(['error'], { logger });

    for (let index = 0; index < 2; index += 1) {
      const error = new TypeError('boom');
      error.stack = 'TypeError: boom\n    at fn (https://app.example/main.js?token=secret:1:2)';
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'boom',
        filename: 'https://app.example/main.js?token=secret',
        lineno: 1,
        colno: 2,
        error
      }));
    }
    cleanup();

    expect(logger.emit).toHaveBeenCalledTimes(1);
    expect(logger.emit.mock.calls[0][0].attributes['error.count']).toBe(2);
    expect(logger.emit.mock.calls[0][0].attributes['error.fingerprint']).toMatch(/^[0-9a-f]{8}$/);
  });

  test('observes buffered resource timing entries when supported', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakePerformanceObserver {
      constructor(_callback: PerformanceObserverCallback) {}
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);

    const { cleanup } = enableCustomHarness(['resource-timing']);
    cleanup();

    expect(observe).toHaveBeenCalledWith({ type: 'resource', buffered: true });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  test('redacts network span URL attributes and reports response status in OTel instrumentation hooks', () => {
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      enabledInstrumentations: ['network'],
      ignoreUrls: ['https://api.example/internal', /\/health$/],
      redact: { urlQueryKeys: ['session_id'] }
    }, new ErrorIsolator());
    const instrumentations = registerOtelInstrumentations(options!);

    try {
      const fetchConfig = (instrumentations[0] as any).getConfig();
      expect(fetchConfig.ignoreUrls).toEqual(expect.arrayContaining(['https://api.example/internal', /\/health$/]));
      const fetchSpan = { setAttribute: vi.fn() };
      fetchConfig.requestHook(fetchSpan, new Request('https://api.example/items?token=secret&session_id=abc'));
      fetchConfig.applyCustomAttributesOnSpan(fetchSpan, new Request('https://api.example/items?token=secret&session_id=abc'), new Response(null, { status: 202 }));

      expect(fetchSpan.setAttribute).toHaveBeenCalledWith('http.url', 'https://api.example/items?token=%5BREDACTED%5D&session_id=%5BREDACTED%5D');
      expect(fetchSpan.setAttribute).toHaveBeenCalledWith('url.full', 'https://api.example/items?token=%5BREDACTED%5D&session_id=%5BREDACTED%5D');
      expect(fetchSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 202);

      const xhrConfig = (instrumentations[1] as any).getConfig();
      expect(xhrConfig.ignoreUrls).toEqual(fetchConfig.ignoreUrls);
      const xhrSpan = { setAttribute: vi.fn() };
      xhrConfig.applyCustomAttributesOnSpan(xhrSpan, { responseURL: 'https://api.example/items?password=hunter2', status: 404 });

      expect(xhrSpan.setAttribute).toHaveBeenCalledWith('http.url', 'https://api.example/items?password=%5BREDACTED%5D');
      expect(xhrSpan.setAttribute).toHaveBeenCalledWith('url.full', 'https://api.example/items?password=%5BREDACTED%5D');
      expect(xhrSpan.setAttribute).toHaveBeenCalledWith('http.response.status_code', 404);
    } finally {
      for (const instrumentation of instrumentations) instrumentation.disable();
    }
  });
});

function enableCustomHarness(
  enabledInstrumentations: InstrumentationName[],
  overrides: { logger?: { emit: ReturnType<typeof vi.fn> } } = {}
): {
  spans: Array<{ name: string; attributes: Record<string, unknown>; end: ReturnType<typeof vi.fn> }>;
  session: { setRouteCurrent: ReturnType<typeof vi.fn> };
  cleanup: () => void;
} {
  const spans: Array<{ name: string; attributes: Record<string, unknown>; end: ReturnType<typeof vi.fn> }> = [];
  const session = { setRouteCurrent: vi.fn() };
  const options = normalizeOptions({
    collectorUrl: 'https://collector.example/otlp',
    enabledInstrumentations
  }, new ErrorIsolator());
  const cleanups = enableCustomInstrumentations({
    tracer: {
      startSpan: vi.fn((name: string, config: { attributes: Record<string, unknown> }) => {
        const span = { end: vi.fn() };
        spans.push({ name, attributes: config.attributes, end: span.end });
        return span;
      })
    },
    logger: overrides.logger ?? { emit: vi.fn() },
    session,
    options: options!,
    isolator: new ErrorIsolator()
  } as never);
  return { spans, session, cleanup: () => cleanups.forEach((cleanup) => cleanup()) };
}
