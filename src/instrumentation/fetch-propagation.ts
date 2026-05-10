import type { SpanContext } from '@opentelemetry/api';
import type { NormalizedOptions } from '../core/options';

export function enableFetchTracePropagation(options: NormalizedOptions, getSpanContext: () => SpanContext | undefined): () => void {
  if (!options.propagateTraceHeaders || typeof fetch !== 'function') return () => undefined;
  const originalFetch = fetch;

  globalThis.fetch = function rumFetchWithTraceHeaders(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const spanContext = getSpanContext();
    const url = requestUrl(input);
    if (!spanContext || !url || !shouldPropagate(url, options)) {
      return originalFetch.call(this, input, init);
    }

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (headers.has('x-rum-skip') || headers.has('traceparent')) return originalFetch.call(this, input, init);
    headers.set('traceparent', traceparent(spanContext));

    if (init) return originalFetch.call(this, input, { ...init, headers });
    if (input instanceof Request) return originalFetch.call(this, new Request(input, { headers }));
    return originalFetch.call(this, input, { headers });
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

export function traceparent(context: SpanContext): string {
  const flags = (context.traceFlags & 1).toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

function requestUrl(input: RequestInfo | URL): string | undefined {
  if (typeof input === 'string') return new URL(input, locationHref()).href;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return undefined;
}

function shouldPropagate(url: string, options: NormalizedOptions): boolean {
  if (url.startsWith(options.collectorUrl)) return false;
  return options.propagateTraceHeadersAllowList.some((pattern) => {
    if (typeof pattern === 'string') return url.startsWith(new URL(pattern, locationHref()).href) || url.includes(pattern);
    return pattern.test(url);
  });
}

function locationHref(): string {
  return typeof location === 'undefined' ? 'https://example.invalid/' : location.href;
}
