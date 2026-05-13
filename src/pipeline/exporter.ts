import { ExportResultCode } from '@opentelemetry/core';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { encodeLogsRequest, encodeTraceRequest } from '../otlp/encode';
import type { NormalizedOptions } from '../core/options';
import { ErrorIsolator } from '../core/error-isolator';
import { RetryController } from './retry-controller';
import { OfflineQueue } from './offline-queue';

type TelemetryKind = 'traces' | 'logs';

export interface HttpTelemetryExporterOptions {
  collectorUrl: string;
  authToken: string;
  headers: Record<string, string>;
  beforeSendBatch?: NormalizedOptions['beforeSendBatch'];
  fetchImpl?: typeof fetch;
  beacon?: Navigator['sendBeacon'];
  offlineQueue?: OfflineQueue;
  retryController?: RetryController;
  isolator?: ErrorIsolator;
}

export class HttpTelemetryExporter {
  private readonly collectorUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly offlineQueue: OfflineQueue;
  private readonly retryController: RetryController;
  private readonly isolator: ErrorIsolator;
  private readonly removeOnlineListener: (() => void) | undefined;
  private drainingOffline = false;
  private offlineDrainPromise: Promise<void> | undefined;
  private shutdownPromise: Promise<void> | undefined;
  private isShutdown = false;
  private unloadDeliveryDepth = 0;

  constructor(private readonly options: HttpTelemetryExporterOptions) {
    this.collectorUrl = options.collectorUrl.replace(/\/+$/, '');
    this.headers = exporterHeaders(options.authToken, options.headers);
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.offlineQueue = options.offlineQueue ?? new OfflineQueue();
    this.isolator = options.isolator ?? new ErrorIsolator();
    this.retryController = options.retryController ?? new RetryController(this.isolator);
    this.removeOnlineListener = this.listenForOnlineReplay();
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) void this.drainOffline();
  }

  async exportBytes(kind: TelemetryKind, body: Uint8Array, unload = false): Promise<void> {
    if (body.byteLength === 0) return;
    const unloading = unload || this.unloadDeliveryDepth > 0;
    if (this.options.beforeSendBatch) {
      try {
        const decision = this.options.beforeSendBatch({ kind, size: body.byteLength });
        if (decision === false) return;
      } catch (err) {
        this.isolator.warn('before-send-batch', err);
      }
    }
    const path = `/v1/${kind}`;
    const headers = { 'Content-Type': 'application/x-protobuf', ...this.headers };
    const bodyBuffer = toArrayBuffer(body);
    const batch = { path, contentType: headers['Content-Type'], body: bodyBuffer, headers };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await this.offlineQueue.enqueue(batch);
      return;
    }
    // Authenticated exports need fetch keepalive because sendBeacon cannot attach custom headers.
    if (unloading && this.canBeacon(body, headers)) {
      const ok = (this.options.beacon ?? navigator.sendBeacon.bind(navigator))(`${this.collectorUrl}${path}`, new Blob([bodyBuffer], { type: 'application/x-protobuf' }));
      if (ok) return;
    }
    try {
      const request = () => this.fetchImpl(`${this.collectorUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'x-rum-skip': '1' },
        body: bodyBuffer,
        keepalive: unloading
      });
      const response = unloading ? await request() : await this.retryController.run(request);
      if (response && (response.status === 429 || response.status >= 500)) {
        await this.offlineQueue.enqueue(batch);
      }
    } catch {
      await this.offlineQueue.enqueue(batch);
    }
  }

  withUnloadDelivery<T>(work: () => Promise<T>): Promise<T> {
    this.unloadDeliveryDepth += 1;
    return Promise.resolve().then(work).finally(() => {
      this.unloadDeliveryDepth = Math.max(0, this.unloadDeliveryDepth - 1);
    });
  }

  drainOffline(): Promise<void> {
    if (this.isShutdown) return Promise.resolve();
    if (this.drainingOffline && this.offlineDrainPromise) return this.offlineDrainPromise;

    this.drainingOffline = true;
    this.offlineDrainPromise = this.isolator.guardAsync('offline-drain', async () => {
      await this.offlineQueue.drain(async (batch) => {
        await this.retryController.run(() => this.fetchImpl(`${this.collectorUrl}${batch.path}`, {
          method: 'POST',
          headers: { ...batch.headers, 'x-rum-skip': '1' },
          body: batch.body
        }));
      });
    }, undefined).finally(() => {
      this.drainingOffline = false;
      this.offlineDrainPromise = undefined;
    });
    return this.offlineDrainPromise;
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = Promise.resolve().then(() => {
      this.isShutdown = true;
      this.removeOnlineListener?.();
    });
    return this.shutdownPromise;
  }

  private listenForOnlineReplay(): (() => void) | undefined {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function' || typeof window.removeEventListener !== 'function') {
      return undefined;
    }
    const onOnline = () => {
      void this.drainOffline();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }

  private canBeacon(body: Uint8Array, headers: Record<string, string>): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
    if (body.byteLength > 60 * 1024) return false;
    const customHeaders = Object.keys(headers).filter((key) => key.toLowerCase() !== 'content-type');
    return customHeaders.length === 0;
  }
}

export class RumSpanExporter implements SpanExporter {
  constructor(private readonly http: HttpTelemetryExporter) {}

  export(spans: ReadableSpan[], resultCallback: (result: { code: ExportResultCode; error?: Error }) => void): void {
    this.http.exportBytes('traces', encodeTraceRequest(spans)).then(
      () => resultCallback({ code: ExportResultCode.SUCCESS }),
      (error) => resultCallback({ code: ExportResultCode.FAILED, error })
    );
  }

  shutdown(): Promise<void> {
    return this.http.shutdown();
  }
}

export class RumLogExporter implements LogRecordExporter {
  constructor(private readonly http: HttpTelemetryExporter) {}

  export(logs: ReadableLogRecord[], resultCallback: (result: { code: ExportResultCode; error?: Error }) => void): void {
    this.http.exportBytes('logs', encodeLogsRequest(logs)).then(
      () => resultCallback({ code: ExportResultCode.SUCCESS }),
      (error) => resultCallback({ code: ExportResultCode.FAILED, error })
    );
  }

  shutdown(): Promise<void> {
    return this.http.shutdown();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

function exporterHeaders(token: string, extraHeaders: Record<string, string>): Record<string, string> {
  const hasAuthorizationOverride = Object.keys(extraHeaders).some((key) => key.toLowerCase() === 'authorization');
  return {
    ...(hasAuthorizationOverride ? {} : { Authorization: `Bearer ${token}` }),
    ...extraHeaders
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}
