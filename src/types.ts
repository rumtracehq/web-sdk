export type Severity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type AttributeValue = string | number | boolean | Array<string | number | boolean>;
export type Attributes = Record<string, AttributeValue>;

export type InstrumentationName =
  | 'page-load'
  | 'route-change'
  | 'react-router'
  | 'next-pages-router'
  | 'next-app-router'
  | 'network'
  | 'error'
  | 'interaction'
  | 'web-vitals'
  | 'resource-timing';

export interface RumOptions {
  collectorUrl?: string;
  headers?: Record<string, string>;
  sampleRate?: number;
  environment?: string;
  release?: string;
  enabledInstrumentations?: InstrumentationName[];
  propagateTraceHeaders?: boolean;
  propagateTraceHeadersAllowList?: Array<string | RegExp>;
  captureBodies?: boolean;
  redact?: {
    urlQueryKeys?: string[];
    headerKeys?: string[];
  };
  beforeSend?: (record: TelemetryRecord) => TelemetryRecord | null | undefined;
}

export type TelemetryRecord = Record<string, unknown>;

export interface Counter {
  add(value: number, attributes?: Attributes): void;
}

export interface Gauge {
  record(value: number, attributes?: Attributes): void;
}

export interface Histogram {
  record(value: number, attributes?: Attributes): void;
}

export interface SpanHandle {
  setAttribute(key: string, value: AttributeValue): void;
  addEvent(name: string, attributes?: Attributes): void;
  setStatus(status: 'OK' | 'ERROR' | 'UNSET', message?: string): void;
  end(): void;
}

export interface LogApi {
  (severity: Severity, body: unknown, attributes?: Attributes): void;
  trace(body: unknown, attrs?: Attributes): void;
  debug(body: unknown, attrs?: Attributes): void;
  info(body: unknown, attrs?: Attributes): void;
  warn(body: unknown, attrs?: Attributes): void;
  error(body: unknown, attrs?: Attributes): void;
  fatal(body: unknown, attrs?: Attributes): void;
}

export interface RumInstance {
  log: LogApi;
  counter(name: string): Counter;
  gauge(name: string): Gauge;
  histogram(name: string): Histogram;
  startSpan(name: string, attributes?: Attributes): SpanHandle;
  addEvent(name: string, attributes?: Attributes): void;
  setGlobalAttribute(key: string, value: AttributeValue): void;
  removeGlobalAttribute(key: string): void;
  setUser(userId: string, attributes?: Attributes): void;
  clearUser(): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
