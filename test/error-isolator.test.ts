import { describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';

describe('ErrorIsolator', () => {
  test('guard returns fallback and rate-limits warnings by signature', () => {
    let now = 1000;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const isolator = new ErrorIsolator(() => now);

    const first = isolator.guard('boom', () => {
      throw new Error('first');
    }, 'fallback');
    const second = isolator.guard('boom', () => {
      throw new Error('second');
    }, 'fallback');
    now += 60_000;
    const third = isolator.guard('boom', () => {
      throw new Error('third');
    }, 'fallback');

    expect(first).toBe('fallback');
    expect(second).toBe('fallback');
    expect(third).toBe('fallback');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('guardAsync catches rejections', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const isolator = new ErrorIsolator(() => 1000);

    await expect(isolator.guardAsync('reject', async () => Promise.reject(new Error('x')), 42)).resolves.toBe(42);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
