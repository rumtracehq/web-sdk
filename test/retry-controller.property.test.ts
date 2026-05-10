// Feature: rum-web-sdk, Property 14: Retry schedule for 5xx
import fc from 'fast-check';
import { describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { parseRetryAfter, RetryController } from '../src/pipeline/retry-controller';

describe('RetryController', () => {
  test('5xx responses retry at 1000, 2000, 4000 ms then drop', async () => {
    const sleeps: number[] = [];
    let dropped = 0;
    const controller = new RetryController(new ErrorIsolator(), {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onDroppedBatch: () => {
        dropped += 1;
      }
    });

    const send = vi.fn(async () => new Response(null, { status: 500 }));

    await expect(controller.run(send)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(dropped).toBe(1);
  });

  test('4xx other than 429/401/403 does not retry', async () => {
    const controller = new RetryController(new ErrorIsolator(), { sleep: async () => undefined });
    const send = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(controller.run(send)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('parseRetryAfter parses seconds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (seconds) => {
        expect(parseRetryAfter(String(seconds))).toBe(seconds * 1000);
      }),
      { numRuns: 100 }
    );
  });
});
