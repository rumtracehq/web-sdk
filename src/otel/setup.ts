import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { metrics, trace } from '@opentelemetry/api';
import type { Attributes } from '../types';
import type { NormalizedOptions } from '../core/options';
import { RumAttributeSpanProcessor } from './span-processor';
import { SDK_VERSION } from '../version';

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
  spanAttributes: () => Attributes
): OTelRuntime {
  const resource = resourceFromAttributes({
    'service.name': appName,
    'telemetry.sdk.name': 'rum-web-sdk',
    'telemetry.sdk.version': SDK_VERSION,
    'service.version': options.release,
    'deployment.environment': options.environment,
    ...resourceAttributes
  });
  const headers = exporterHeaders(token, options.headers);

  const traceExporter = new OTLPTraceExporter({
    url: `${options.collectorUrl}/v1/traces`,
    headers
  });
  const logExporter = new OTLPLogExporter({
    url: `${options.collectorUrl}/v1/logs`,
    headers
  });
  const metricExporter = new OTLPMetricExporter({
    url: `${options.collectorUrl}/v1/metrics`,
    headers
  });

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

function exporterHeaders(token: string, extraHeaders: Record<string, string>): Record<string, string> {
  const hasAuthorizationOverride = Object.keys(extraHeaders).some((key) => key.toLowerCase() === 'authorization');
  return {
    ...(hasAuthorizationOverride ? {} : { Authorization: `Bearer ${token}` }),
    ...extraHeaders
  };
}
