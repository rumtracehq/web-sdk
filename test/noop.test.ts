import { describe, expect, test } from 'vitest';
import { createNoopRumInstance } from '../src/core/noop';

describe('createNoopRumInstance', () => {
  test('all public API methods are safe no-ops', async () => {
    const rum = createNoopRumInstance();

    expect(() => rum.log.info('hello')).not.toThrow();
    expect(() => rum.log.error('hello')).not.toThrow();
    expect(() => rum.counter('count').add(1)).not.toThrow();
    expect(() => rum.gauge('gauge').record(1)).not.toThrow();
    expect(() => rum.histogram('histogram').record(1)).not.toThrow();
    expect(() => rum.startSpan('span').setStatus('OK')).not.toThrow();
    expect(() => rum.startSpan('span').addEvent('event')).not.toThrow();
    expect(() => rum.startSpan('span').end()).not.toThrow();
    expect(() => rum.addEvent('event')).not.toThrow();
    expect(() => rum.setGlobalAttribute('key', 'value')).not.toThrow();
    expect(() => rum.removeGlobalAttribute('key')).not.toThrow();
    expect(() => rum.setUser('user')).not.toThrow();
    expect(() => rum.clearUser()).not.toThrow();
    await expect(rum.flush()).resolves.toBeUndefined();
    await expect(rum.shutdown()).resolves.toBeUndefined();
  });
});
