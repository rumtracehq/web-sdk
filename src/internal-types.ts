import type { AttributeValue, Attributes, Severity } from './types';

export interface Resource {
  'service.name': string;
  'telemetry.sdk.name': 'rum-web-sdk';
  'telemetry.sdk.version': string;
  'service.version'?: string;
  'deployment.environment'?: string;
  'session.id': string;
  'session.sampled': boolean;
  'enduser.id'?: string;
  [key: `enduser.${string}`]: AttributeValue | undefined;
  [key: string]: AttributeValue | undefined;
}

export interface SpanEvent {
  timeUnixNano: bigint;
  name: string;
  attributes: Attributes;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: 'INTERNAL' | 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';
  startTimeUnixNano: bigint;
  endTimeUnixNano: bigint;
  attributes: Attributes;
  events: SpanEvent[];
  status: { code: 'OK' | 'ERROR' | 'UNSET'; message?: string };
  resource: Resource;
}

export interface LogRecord {
  timeUnixNano: bigint;
  severityNumber: number;
  severityText: Severity;
  body: string;
  attributes: Attributes;
  traceId?: string;
  spanId?: string;
  resource: Resource;
}

export interface MetricPoint {
  name: string;
  kind: 'COUNTER' | 'GAUGE' | 'HISTOGRAM';
  unit?: string;
  timeUnixNano: bigint;
  startTimeUnixNano?: bigint;
  value: number;
  histogram?: {
    count: number;
    sum: number;
    bounds: number[];
    counts: number[];
  };
  attributes: Attributes;
  resource: Resource;
}

export type TelemetryRecord = Span | LogRecord | MetricPoint;
