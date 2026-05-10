// Feature: rum-web-sdk, Property 4: Exporter request envelope
import { describe, expect, test, vi } from 'vitest';
import { HttpTelemetryExporter } from '../src/pipeline/exporter';
import { RetryController } from '../src/pipeline/retry-controller';
import { ErrorIsolator } from '../src/core/error-isolator';

describe('HttpTelemetryExporter', () => {
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

  test('beforeSend can drop an encoded batch', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      beforeSend: () => null,
      fetchImpl
    });

    await exporter.exportBytes('metrics', new Uint8Array([1]));

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('beforeSend throw exports original batch and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch & { mock: { calls: any[][] } };
    const exporter = new HttpTelemetryExporter({
      collectorUrl: 'https://collector.example/otlp',
      authToken: 'token',
      headers: {},
      beforeSend: () => {
        throw new Error('hook failed');
      },
      fetchImpl
    });

    await exporter.exportBytes('metrics', new Uint8Array([1]));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
