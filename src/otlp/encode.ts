import { ProtobufLogsSerializer, ProtobufMetricsSerializer, ProtobufTraceSerializer } from '@opentelemetry/otlp-transformer';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ResourceMetrics } from '@opentelemetry/sdk-metrics';

export function encodeTraceRequest(spans: ReadableSpan[]): Uint8Array {
  return ProtobufTraceSerializer.serializeRequest(spans) ?? new Uint8Array();
}

export function encodeLogsRequest(logs: ReadableLogRecord[]): Uint8Array {
  return ProtobufLogsSerializer.serializeRequest(logs) ?? new Uint8Array();
}

export function encodeMetricsRequest(metrics: ResourceMetrics): Uint8Array {
  return ProtobufMetricsSerializer.serializeRequest(metrics) ?? new Uint8Array();
}
