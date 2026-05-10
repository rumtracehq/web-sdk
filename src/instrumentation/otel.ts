import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import type { InstrumentationName } from '../types';
import type { NormalizedOptions } from '../core/options';

export function registerOtelInstrumentations(options: NormalizedOptions): Array<{ disable(): void }> {
  const enabled = new Set<InstrumentationName>(options.enabledInstrumentations);
  const instrumentations: Array<{ disable(): void }> = [];
  if (enabled.has('page-load')) instrumentations.push(new DocumentLoadInstrumentation());
  if (enabled.has('network')) {
    instrumentations.push(
      new FetchInstrumentation({
        ignoreUrls: [options.collectorUrl],
        propagateTraceHeaderCorsUrls: options.propagateTraceHeaders ? options.propagateTraceHeadersAllowList : []
      }),
      new XMLHttpRequestInstrumentation({
        ignoreUrls: [options.collectorUrl],
        propagateTraceHeaderCorsUrls: options.propagateTraceHeaders ? options.propagateTraceHeadersAllowList : []
      })
    );
  }
  if (enabled.has('interaction')) instrumentations.push(new UserInteractionInstrumentation());
  registerInstrumentations({ instrumentations: instrumentations as never });
  return instrumentations;
}
