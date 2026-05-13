import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { trace } from '@opentelemetry/api';
import type { Attributes } from '../types';
import type { NormalizedOptions } from '../core/options';
import { RumAttributeSpanProcessor } from './span-processor';
import { SDK_VERSION } from '../version';
import { HttpTelemetryExporter, RumLogExporter, RumSpanExporter } from '../pipeline/exporter';
import { ErrorIsolator } from '../core/error-isolator';

export interface OTelRuntime {
  tracerProvider: WebTracerProvider;
  loggerProvider: LoggerProvider;
  tracer: ReturnType<typeof trace.getTracer>;
  logger: ReturnType<LoggerProvider['getLogger']>;
  cleanup: Array<() => void>;
}

export function setupOpenTelemetry(
  appName: string,
  token: string,
  options: NormalizedOptions,
  resourceAttributes: Attributes,
  spanAttributes: () => Attributes,
  isolator: ErrorIsolator = new ErrorIsolator()
): OTelRuntime {
  const resource = resourceFromAttributes({
    'service.name': appName,
    'telemetry.sdk.name': 'rum-web-sdk',
    'telemetry.sdk.version': SDK_VERSION,
    'service.version': options.release,
    'deployment.environment': options.environment,
    ...resourceAttributes
  });
  const httpExporter = new HttpTelemetryExporter({
    collectorUrl: options.collectorUrl,
    authToken: token,
    headers: options.headers,
    beforeSendBatch: options.beforeSendBatch,
    isolator
  });
  const traceExporter = new RumSpanExporter(httpExporter);
  const logExporter = new RumLogExporter(httpExporter);

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new RumAttributeSpanProcessor(spanAttributes) as never,
      new BatchSpanProcessor(traceExporter, { maxExportBatchSize: 512, scheduledDelayMillis: 5000 })
    ]
  });
  tracerProvider.register();

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(logExporter, { maxExportBatchSize: 512, scheduledDelayMillis: 5000 })]
  });

  const cleanup = [enablePageExitFlush(httpExporter, async () => {
    await Promise.all([
      tracerProvider.forceFlush(),
      loggerProvider.forceFlush()
    ]);
  }, isolator)];

  return {
    tracerProvider,
    loggerProvider,
    tracer: tracerProvider.getTracer('rum-web-sdk', SDK_VERSION),
    logger: loggerProvider.getLogger('rum-web-sdk', SDK_VERSION),
    cleanup
  };
}

function enablePageExitFlush(httpExporter: HttpTelemetryExporter, forceFlush: () => Promise<void>, isolator: ErrorIsolator): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let pending: Promise<unknown> | undefined;
  const flush = () => {
    if (pending) return;
    pending = httpExporter.withUnloadDelivery(() => isolator.guardAsync('page-exit-flush', forceFlush, undefined)).finally(() => {
      pending = undefined;
    });
  };
  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush, true);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange, true);
  return () => {
    window.removeEventListener('pagehide', flush, true);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange, true);
  };
}
