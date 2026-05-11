import type { SpanContext } from '@opentelemetry/api';
import type { NormalizedOptions } from '../core/options';

export function enableFetchTracePropagation(options: NormalizedOptions, getSpanContext: () => SpanContext | undefined): () => void {
  if (!options.propagateTraceHeaders || typeof fetch !== 'function') return () => undefined;
  const originalFetch = fetch;
  const collectorPattern = traceHeaderUrlPattern(options.collectorUrl);
  const allowList = normalizeTraceHeaderAllowList(options.propagateTraceHeadersAllowList);

  globalThis.fetch = function rumFetchWithTraceHeaders(this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const spanContext = getSpanContext();
    const url = requestUrl(input);
    if (!spanContext || !url || !shouldPropagate(url, collectorPattern, allowList)) {
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

export function normalizeTraceHeaderAllowList(allowList: Array<string | RegExp>): RegExp[] {
  return allowList.map((pattern) => typeof pattern === 'string' ? traceHeaderUrlPattern(pattern) : pattern);
}

export function traceHeaderUrlPattern(pattern: string): RegExp {
  const url = new URL(pattern, locationHref());
  if (url.pathname === '/' && url.search === '' && url.hash === '') return new RegExp(`^${escapeRegExp(url.origin)}(?:/|$)`);
  if (url.search !== '' || url.hash !== '') return new RegExp(`^${escapeRegExp(url.href)}`);
  const suffix = url.href.endsWith('/') ? '' : '(?:[/?#]|$)';
  return new RegExp(`^${escapeRegExp(url.href)}${suffix}`);
}

function requestUrl(input: RequestInfo | URL): URL | undefined {
  try {
    if (typeof input === 'string') return new URL(input, locationHref());
    if (input instanceof URL) return input;
    if (input instanceof Request) return new URL(input.url);
    return undefined;
  } catch {
    return undefined;
  }
}

function shouldPropagate(url: URL, collectorPattern: RegExp, allowList: RegExp[]): boolean {
  if (testPattern(collectorPattern, url.href)) return false;
  return allowList.some((pattern) => testPattern(pattern, url.href));
}

function locationHref(): string {
  return typeof location === 'undefined' ? 'https://example.invalid/' : location.href;
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
