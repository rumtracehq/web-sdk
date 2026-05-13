// Feature: rum-web-sdk, Property 4: Exporter request envelope
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HttpTelemetryExporter } from '../src/pipeline/exporter';
import { RetryController } from '../src/pipeline/retry-controller';
import { ErrorIsolator } from '../src/core/error-isolator';
import { OfflineQueue } from '../src/pipeline/offline-queue';

describe('HttpTelemetryExporter', () => {
  const originalOnline = navigator.onLine;

  afterEach(() => {
    vi.unstubAllGlobals();
    setOnline(originalOnline);
  });

  test('posts protobuf bytes to the normalized traces endpoint with auth and extra headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp/',
      authToken: 'token',
      headers: { 'x-org-id': 'org_1' },
      fetchImpl,
      retryController: new RetryController(new ErrorIsolator(), { sleep: async () => undefined })
    });

    await exporter.exportBytes('traces', new Uint8Array([1, 2, 3]));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://collector.example/otlp/v1/traces');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      'Content-Type': 'application/x-protobuf',
      Authorization: 'Bearer token',
      'x-org-id': 'org_1',
      'x-rum-skip': '1'
    });
  });

  test('extra Authorization header overrides bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: { Authorization: 'Basic abc' },
      fetchImpl,
      retryController: new RetryController(new ErrorIsolator(), { sleep: async () => undefined })
    });

    await exporter.exportBytes('logs', new Uint8Array([1]));

    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Basic abc' });
  });

  test('beforeSendBatch can drop an encoded batch', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      beforeSendBatch: () => false,
      fetchImpl
    });

    await exporter.exportBytes('logs', new Uint8Array([1]));

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('beforeSendBatch can allow an encoded batch', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const beforeSendBatch = vi.fn(() => true);
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      beforeSendBatch,
      fetchImpl
    });

    await exporter.exportBytes('logs', new Uint8Array([1]));

    expect(beforeSendBatch).toHaveBeenCalledWith({ kind: 'logs', size: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('beforeSendBatch throw exports original batch and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      beforeSendBatch: () => {
        throw new Error('hook failed');
      },
      fetchImpl
    });

    await exporter.exportBytes('logs', new Uint8Array([1]));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('uses keepalive fetch during unload when auth headers prevent beacon', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const beacon = vi.fn(() => true);
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      beacon
    });

    await exporter.withUnloadDelivery(() => exporter.exportBytes('traces', new Uint8Array([1])));

    expect(beacon).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ keepalive: true });
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer token' });
  });

  test('drains queued telemetry when the browser returns online', async () => {
    vi.stubGlobal('indexedDB', undefined);
    setOnline(false);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const offlineQueue = new OfflineQueue({ memoryCapBytes: 1024 });
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      offlineQueue
    });

    await exporter.exportBytes('traces', new Uint8Array([1]));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await offlineQueue.sizeBytes()).toBe(1);

    setOnline(true);
    window.dispatchEvent(new Event('online'));

    await waitUntil(() => fetchImpl.mock.calls.length === 1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://collector.example/otlp/v1/traces');
    expect(await offlineQueue.sizeBytes()).toBe(0);
    await exporter.shutdown();
  });

  test('drains queued telemetry during startup when already online', async () => {
    vi.stubGlobal('indexedDB', undefined);
    setOnline(true);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const offlineQueue = new OfflineQueue({ memoryCapBytes: 1024 });
    await offlineQueue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });

    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      offlineQueue
    });

    await waitUntil(() => fetchImpl.mock.calls.length === 1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://collector.example/otlp/v1/logs');
    expect(await offlineQueue.sizeBytes()).toBe(0);
    await exporter.shutdown();
  });

  test('shutdown removes the online replay listener', async () => {
    vi.stubGlobal('indexedDB', undefined);
    setOnline(false);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const offlineQueue = new OfflineQueue({ memoryCapBytes: 1024 });
    await offlineQueue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      offlineQueue
    });

    await exporter.shutdown();
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    await sleep(0);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await offlineQueue.sizeBytes()).toBe(1);
  });

  test('deduplicates overlapping offline drain calls', async () => {
    vi.stubGlobal('indexedDB', undefined);
    setOnline(false);
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const offlineQueue = new OfflineQueue({ memoryCapBytes: 1024 });
    await offlineQueue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      offlineQueue
    });

    const firstDrain = exporter.drainOffline();
    const secondDrain = exporter.drainOffline();

    expect(secondDrain).toBe(firstDrain);
    await waitUntil(() => fetchImpl.mock.calls.length === 1);
    resolveFetch?.(new Response(null, { status: 200 }));
    await Promise.all([firstDrain, secondDrain]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await offlineQueue.sizeBytes()).toBe(0);
    await exporter.shutdown();
  });

  test('offline replay drops poison client errors and continues draining', async () => {
    vi.stubGlobal('indexedDB', undefined);
    setOnline(false);
    let replayAttempt = 0;
    const fetchImpl = vi.fn(async () => new Response(null, { status: (replayAttempt += 1) === 1 ? 400 : 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const offlineQueue = new OfflineQueue({ memoryCapBytes: 1024 });
    await offlineQueue.enqueue({ path: '/v1/traces', contentType: 'application/x-protobuf', body: new Uint8Array([1]).buffer, headers: {} });
    await offlineQueue.enqueue({ path: '/v1/logs', contentType: 'application/x-protobuf', body: new Uint8Array([2]).buffer, headers: {} });
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      fetchImpl,
      offlineQueue,
      retryController: new RetryController(new ErrorIsolator(), { sleep: async () => undefined })
    });

    await exporter.drainOffline();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://collector.example/otlp/v1/traces');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://collector.example/otlp/v1/logs');
    expect(await offlineQueue.sizeBytes()).toBe(0);
    await exporter.shutdown();
  });
});

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return;
    await sleep(0);
  }
  throw new Error('Timed out waiting for condition');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
