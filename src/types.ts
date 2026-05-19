export type Severity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type AttributeValue = string | number | boolean | Array<string | number | boolean>;
export type Attributes = Record<string, AttributeValue>;

export interface RumUserOptions {
  id: string;
  attributes?: Attributes;
}

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
  websiteVersion?: string;
  country?: string;
  user?: string | RumUserOptions;
  enabledInstrumentations?: InstrumentationName[];
  ignoreUrls?: Array<string | RegExp>;
  propagateTraceHeaders?: boolean;
  propagateTraceHeadersAllowList?: Array<string | RegExp>;
  captureBodies?: boolean;
  payloadCompression?: 'gzip' | 'none';
  redact?: {
    urlQueryKeys?: string[];
  };
  beforeSendBatch?: (metadata: TelemetryBatchMetadata) => boolean | void;
}

export interface TelemetryBatchMetadata {
  kind: 'traces' | 'logs';
  size: number;
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
  startSpan(name: string, attributes?: Attributes): SpanHandle;
  addEvent(name: string, attributes?: Attributes): void;
  setGlobalAttribute(key: string, value: AttributeValue): void;
  removeGlobalAttribute(key: string): void;
  setUser(userId: string, attributes?: Attributes): void;
  clearUser(): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
