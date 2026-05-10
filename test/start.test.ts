import { afterEach, describe, expect, test, vi } from 'vitest';

describe('start validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    sessionStorage.clear();
    delete window.__rumWebSdkInstance;
  });

  test('invalid appName or authToken returns a no-op instance and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { start } = await import('../src/index');

    const rum = start('', '', { collectorUrl: 'https://collector.example/otlp' });
    expect(() => rum.log.info('hello')).not.toThrow();
    expect(() => rum.counter('x').add(1)).not.toThrow();
    await expect(rum.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('non-https collectorUrl returns a no-op instance and logs an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { start } = await import('../src/index');

    const rum = start('app', 'token', { collectorUrl: 'http://collector.example/otlp' });
    expect(() => rum.log.info('hello')).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('sampleRate 0 produces a silent no-op instance', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { start } = await import('../src/index');

    const rum = start('app', 'token', { collectorUrl: 'https://collector.example/otlp', sampleRate: 0 });
    expect(() => rum.startSpan('custom').end()).not.toThrow();
    await expect(rum.shutdown()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  test('returns the same instance for duplicate starts in a document', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { start } = await import('../src/index');

    const first = start('app', 'token', { collectorUrl: 'https://collector.example/otlp', sampleRate: 0 });
    const second = start('app', 'token', { collectorUrl: 'https://collector.example/otlp', sampleRate: 0 });

    expect(second).toBe(first);
    expect(window.__rumWebSdkInstance).toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
