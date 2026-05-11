// Feature: rum-web-sdk, Property 17: Offline queue behavior
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { OfflineQueue } from '../src/pipeline/offline-queue';

describe('OfflineQueue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  test('keeps IndexedDB batches queued when replay send fails', async () => {
    const queue = new OfflineQueue({ dbName: 'rum-web-sdk-offline-retain-idb', indexedDbCapBytes: 1024 });

    await queue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    await queue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([2]).buffer, headers: {} });

    const attempted: number[] = [];
    await expect(queue.drain(async (batch) => {
      attempted.push(new Uint8Array(batch.body)[0]);
      throw new Error('network down');
    }, 1000)).rejects.toThrow('network down');

    expect(attempted).toEqual([1]);
    expect(await queue.sizeBytes()).toBe(2);

    const sent: number[] = [];
    await queue.drain(async (batch) => {
      sent.push(new Uint8Array(batch.body)[0]);
    }, 1000);

    expect(sent).toEqual([1, 2]);
    expect(await queue.sizeBytes()).toBe(0);
  });

  test('keeps memory batches queued when replay send fails', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const queue = new OfflineQueue({ memoryCapBytes: 1024 });

    await queue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    await queue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([2]).buffer, headers: {} });

    const attempted: number[] = [];
    await expect(queue.drain(async (batch) => {
      attempted.push(new Uint8Array(batch.body)[0]);
      throw new Error('network down');
    }, 1000)).rejects.toThrow('network down');

    expect(attempted).toEqual([1]);
    expect(await queue.sizeBytes()).toBe(2);

    const sent: number[] = [];
    await queue.drain(async (batch) => {
      sent.push(new Uint8Array(batch.body)[0]);
    }, 1000);

    expect(sent).toEqual([1, 2]);
    expect(await queue.sizeBytes()).toBe(0);
  });
});
