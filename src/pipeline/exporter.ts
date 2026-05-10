import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality, type InstrumentType, type PushMetricExporter, type ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { encodeLogsRequest, encodeMetricsRequest, encodeTraceRequest } from '../otlp/encode';
import type { NormalizedOptions } from '../core/options';
import { ErrorIsolator } from '../core/error-isolator';
import { RetryController } from './retry-controller';
import { OfflineQueue } from './offline-queue';

type TelemetryKind = 'traces' | 'logs' | 'metrics';

export interface HttpTelemetryExporterOptions {
  collectorUrl: string;
  authToken: string;
  headers: Record<string, string>;
  beforeSend?: NormalizedOptions['beforeSend'];
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

  constructor(private readonly options: HttpTelemetryExporterOptions) {
    this.collectorUrl = options.collectorUrl.replace(/\/+$/, '');
    this.headers = exporterHeaders(options.authToken, options.headers);
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.offlineQueue = options.offlineQueue ?? new OfflineQueue();
    this.isolator = options.isolator ?? new ErrorIsolator();
    this.retryController = options.retryController ?? new RetryController(this.isolator);
  }

  async exportBytes(kind: TelemetryKind, body: Uint8Array, unload = false): Promise<void> {
    if (body.byteLength === 0) return;
    if (this.options.beforeSend) {
      try {
        const decision = this.options.beforeSend({ kind, size: body.byteLength });
        if (decision == null) return;
      } catch (err) {
        this.isolator.warn('before-send', err);
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
    if (unload && this.canBeacon(body, headers)) {
      const ok = (this.options.beacon ?? navigator.sendBeacon.bind(navigator))(`${this.collectorUrl}${path}`, new Blob([bodyBuffer], { type: 'application/x-protobuf' }));
      if (ok) return;
    }
    try {
      await this.retryController.run(() => this.fetchImpl(`${this.collectorUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'x-rum-skip': '1' },
        body: bodyBuffer,
        keepalive: unload
      }));
    } catch {
      await this.offlineQueue.enqueue(batch);
    }
  }

  async drainOffline(): Promise<void> {
    await this.offlineQueue.drain(async (batch) => {
      await this.fetchImpl(`${this.collectorUrl}${batch.path}`, {
        method: 'POST',
        headers: { ...batch.headers, 'x-rum-skip': '1' },
        body: batch.body
      });
    });
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
    return Promise.resolve();
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
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

export class RumMetricExporter implements PushMetricExporter {
  constructor(private readonly http: HttpTelemetryExporter) {}

  export(metrics: ResourceMetrics, resultCallback: (result: { code: ExportResultCode; error?: Error }) => void): void {
    this.http.exportBytes('metrics', encodeMetricsRequest(metrics)).then(
      () => resultCallback({ code: ExportResultCode.SUCCESS }),
      (error) => resultCallback({ code: ExportResultCode.FAILED, error })
    );
  }

  selectAggregationTemporality(_instrumentType: InstrumentType): AggregationTemporality {
    return AggregationTemporality.CUMULATIVE;
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
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
