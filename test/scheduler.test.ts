// Feature: rum-web-sdk, Property 35: Deferred work scheduling
import { afterEach, describe, expect, test, vi } from 'vitest';
import { scheduleDeferred } from '../src/core/scheduler';

describe('scheduleDeferred', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  });

  test('uses requestIdleCallback with 1000 ms timeout when available', () => {
    const idle = vi.fn();
    (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback = idle as never;
    const fn = vi.fn();

    scheduleDeferred(fn);

    expect(idle).toHaveBeenCalledWith(fn, { timeout: 1000 });
  });

  test('falls back to setTimeout(fn, 0)', () => {
    vi.useFakeTimers();
    const fn = vi.fn();

    scheduleDeferred(fn);
    vi.runAllTimers();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
