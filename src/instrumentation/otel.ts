import type { Span, TracerProvider } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import type { InstrumentationName } from '../types';
import type { NormalizedOptions } from '../core/options';
import { redactUrl } from '../core/redactor';
import { normalizeTraceHeaderAllowList, traceHeaderUrlPattern } from './fetch-propagation';

export function registerOtelInstrumentations(
  options: NormalizedOptions,
  providers: { tracerProvider?: TracerProvider } = {}
): Array<{ disable(): void }> {
  const enabled = new Set<InstrumentationName>(options.enabledInstrumentations);
  const instrumentations: Array<{ disable(): void }> = [];
  const collectorUrlPattern = traceHeaderUrlPattern(options.collectorUrl);
  const traceHeaderAllowList = options.propagateTraceHeaders ? normalizeTraceHeaderAllowList(options.propagateTraceHeadersAllowList) : [];
  const redactNetworkUrl = (span: Span, rawUrl: string | undefined) => {
    if (!rawUrl) return;
    const redacted = redactUrl(rawUrl, options.redact?.urlQueryKeys);
    span.setAttribute('http.url', redacted);
    span.setAttribute('url.full', redacted);
  };
  if (enabled.has('page-load')) instrumentations.push(new DocumentLoadInstrumentation());
  if (enabled.has('network')) {
    instrumentations.push(
      new FetchInstrumentation({
        ignoreUrls: [collectorUrlPattern],
        propagateTraceHeaderCorsUrls: traceHeaderAllowList,
        requestHook: (span, request) => redactNetworkUrl(span, isRequest(request) ? request.url : undefined),
        applyCustomAttributesOnSpan: (span, request, result) => redactNetworkUrl(span, fetchResultUrl(request, result))
      }),
      new XMLHttpRequestInstrumentation({
        ignoreUrls: [collectorUrlPattern],
        propagateTraceHeaderCorsUrls: traceHeaderAllowList,
        applyCustomAttributesOnSpan: (span, xhr) => redactNetworkUrl(span, xhr.responseURL)
      })
    );
  }
  registerInstrumentations({ instrumentations: instrumentations as never, ...providers });
  return instrumentations;
}

function fetchResultUrl(request: Request | RequestInit, result: unknown): string | undefined {
  if (isRequest(request)) return request.url;
  if (result && typeof result === 'object' && 'url' in result) {
    const url = (result as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return undefined;
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request;
}
