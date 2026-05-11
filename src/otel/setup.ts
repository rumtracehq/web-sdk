import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { metrics, trace } from '@opentelemetry/api';
import type { Attributes } from '../types';
import type { NormalizedOptions } from '../core/options';
import { RumAttributeSpanProcessor } from './span-processor';
import { SDK_VERSION } from '../version';
import { HttpTelemetryExporter, RumLogExporter, RumMetricExporter, RumSpanExporter } from '../pipeline/exporter';
import { ErrorIsolator } from '../core/error-isolator';

export interface OTelRuntime {
  tracerProvider: WebTracerProvider;
  loggerProvider: LoggerProvider;
  meterProvider: MeterProvider;
  tracer: ReturnType<typeof trace.getTracer>;
  logger: ReturnType<LoggerProvider['getLogger']>;
  meter: ReturnType<MeterProvider['getMeter']>;
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
  const metricExporter = new RumMetricExporter(httpExporter);

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

  const metricReader = new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 5000 });
  const meterProvider = new MeterProvider({ resource, readers: [metricReader] });
  metrics.setGlobalMeterProvider(meterProvider);

  return {
    tracerProvider,
    loggerProvider,
    meterProvider,
    tracer: trace.getTracer('rum-web-sdk', SDK_VERSION),
    logger: loggerProvider.getLogger('rum-web-sdk', SDK_VERSION),
    meter: meterProvider.getMeter('rum-web-sdk', SDK_VERSION)
  };
}
