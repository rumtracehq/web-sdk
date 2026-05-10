// Feature: rum-web-sdk, Property 17: Offline queue behavior
import 'fake-indexeddb/auto';
import { describe, expect, test } from 'vitest';
import { OfflineQueue } from '../src/pipeline/offline-queue';

describe('OfflineQueue', () => {
  test('stores batches and drains oldest first', async () => {
    const queue = new OfflineQueue({ dbName: 'rum-web-sdk-offline-drain', indexedDbCapBytes: 1024 });
    const sent: number[] = [];

    await queue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    await queue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([2]).buffer, headers: {} });
    await queue.drain(async (batch) => {
      sent.push(new Uint8Array(batch.body)[0]);
    }, 1000);

    expect(sent).toEqual([1, 2]);
    expect(await queue.sizeBytes()).toBe(0);
  });

  test('evicts oldest entries over cap', async () => {
    const queue = new OfflineQueue({ dbName: 'rum-web-sdk-offline-evict', indexedDbCapBytes: 2 });

    await queue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1, 1]).buffer, headers: {} });
    await queue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([2, 2]).buffer, headers: {} });

    const sent: number[] = [];
    await queue.drain(async (batch) => {
      sent.push(new Uint8Array(batch.body)[0]);
    }, 1000);

    expect(sent).toEqual([2]);
  });
});
