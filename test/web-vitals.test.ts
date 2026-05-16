import { afterEach, describe, expect, test, vi } from 'vitest';
import type { InstrumentationName } from '../src/types';

type MetricName = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';

interface TestWebVitalMetric {
  name: MetricName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore';
}

describe('web vitals instrumentation', () => {
  afterEach(() => {
    vi.doUnmock('web-vitals');
    vi.resetModules();
  });

  test('emits web vitals as log records', async () => {
    const { callbacks, enable } = await enableWebVitalsHarness();
    const { logger, cleanup } = enable();

    await vi.dynamicImportSettled();
    callbacks.LCP?.(metric('LCP', 1234));
    cleanup();

    expect(logger.emit).toHaveBeenCalledWith({
      severityText: 'INFO',
      severityNumber: 9,
      body: 'webVital',
      attributes: {
        'webvital.name': 'LCP',
        'webvital.value': 1234,
        'webvital.unit': 'ms',
        'webvital.rating': 'good',
        'webvital.delta': 1234,
        'webvital.id': 'LCP-id',
        'webvital.navigation_type': 'navigate'
      }
    });
  });

  test('does not emit after cleanup', async () => {
    const { callbacks, enable } = await enableWebVitalsHarness();
    const { logger, cleanup } = enable();

    await vi.dynamicImportSettled();
    cleanup();
    callbacks.CLS?.(metric('CLS', 0.05));

    expect(logger.emit).not.toHaveBeenCalled();
  });

  test('includes current SDK attributes on web vital logs', async () => {
    const { callbacks, enable } = await enableWebVitalsHarness();
    const { logger } = enable({ attributes: () => ({ 'enduser.id': 'user-1', 'browser.name': 'Chrome' }) });

    await vi.dynamicImportSettled();
    callbacks.FCP?.(metric('FCP', 2700));

    expect(logger.emit).toHaveBeenCalledWith(expect.objectContaining({
      attributes: expect.objectContaining({
        'webvital.name': 'FCP',
        'webvital.value': 2700,
        'enduser.id': 'user-1',
        'browser.name': 'Chrome'
      })
    }));
  });
});

async function enableWebVitalsHarness(): Promise<{
  callbacks: Partial<Record<MetricName, (metric: TestWebVitalMetric) => void>>;
  enable: (overrides?: { attributes?: () => Record<string, string> }) => { logger: { emit: ReturnType<typeof vi.fn> }; cleanup: () => void };
}> {
  const callbacks: Partial<Record<MetricName, (metric: TestWebVitalMetric) => void>> = {};
  const register = (name: MetricName) => vi.fn((callback: (metric: TestWebVitalMetric) => void) => {
    callbacks[name] = callback;
  });

  vi.doMock('web-vitals', () => ({
    onCLS: register('CLS'),
    onFCP: register('FCP'),
    onINP: register('INP'),
    onLCP: register('LCP'),
    onTTFB: register('TTFB')
  }));

  const [{ ErrorIsolator }, { normalizeOptions }, { enableCustomInstrumentations }] = await Promise.all([
    import('../src/core/error-isolator'),
    import('../src/core/options'),
    import('../src/instrumentation/custom')
  ]);

  return {
    callbacks,
    enable: (overrides = {}) => {
      const logger = { emit: vi.fn() };
      const options = normalizeOptions({
        collectorUrl: 'https://collector.example/otlp',
        enabledInstrumentations: ['web-vitals'] as InstrumentationName[]
      }, new ErrorIsolator());
      const cleanups = enableCustomInstrumentations({
        tracer: {},
        logger,
        session: {},
        options: options!,
        isolator: new ErrorIsolator(),
        attributes: overrides.attributes
      } as never);
      return { logger, cleanup: () => cleanups.forEach((cleanup) => cleanup()) };
    }
  };
}

function metric(name: MetricName, value: number): TestWebVitalMetric {
  return {
    name,
    value,
    rating: 'good',
    delta: value,
    id: `${name}-id`,
    navigationType: 'navigate'
  };
}
