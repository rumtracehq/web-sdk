import type { Attributes, InstrumentationName } from '../types';
import type { NormalizedOptions } from '../core/options';
import type { SessionManager } from '../core/session';
import type { ErrorIsolator } from '../core/error-isolator';
import { redactInteractionText, redactStackTrace, redactUrl } from '../core/redactor';

const MAX_ERROR_MESSAGE_LENGTH = 1024;
const MAX_ERROR_STACK_LENGTH = 4096;
const MAX_TARGET_LABEL_LENGTH = 100;

export interface CustomInstrumentationContext {
  tracer: any;
  logger: any;
  session: SessionManager;
  options: NormalizedOptions;
  isolator: ErrorIsolator;
  attributes?: () => Attributes;
}

export function enableCustomInstrumentations(ctx: CustomInstrumentationContext): Array<() => void> {
  const cleanup: Array<() => void> = [];
  const enabled = new Set<InstrumentationName>(ctx.options.enabledInstrumentations);
  if (enabled.has('route-change')) cleanup.push(enableRouteChange(ctx));
  if (enabled.has('error')) cleanup.push(enableErrorLogs(ctx));
  if (enabled.has('interaction')) cleanup.push(enableInteractions(ctx));
  if (enabled.has('web-vitals')) cleanup.push(enableWebVitals(ctx));
  if (enabled.has('resource-timing')) cleanup.push(enableResourceTiming(ctx));
  return cleanup;
}

function enableRouteChange(ctx: CustomInstrumentationContext): () => void {
  if (typeof window === 'undefined' || typeof history === 'undefined') return () => undefined;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const record = (trigger: string, from: string, to: string) => {
    ctx.isolator.guard('route-change', () => {
      const redactedTo = redactUrl(to, ctx.options.redact?.urlQueryKeys);
      const span = ctx.tracer.startSpan('routeChange', {
        attributes: currentAttributes(ctx, {
          'route.trigger': trigger,
          'route.from': redactUrl(from, ctx.options.redact?.urlQueryKeys),
          'route.to': redactedTo
        })
      });
      ctx.session.setRouteCurrent(redactedTo);
      requestAnimationFrameSafe(() => span.end());
    }, undefined);
  };

  history.pushState = function pushStatePatched(this: History, ...args: Parameters<History['pushState']>) {
    const from = location.href;
    const out = originalPushState.apply(this, args);
    record('pushState', from, location.href);
    return out;
  };

  history.replaceState = function replaceStatePatched(this: History, ...args: Parameters<History['replaceState']>) {
    const from = location.href;
    const out = originalReplaceState.apply(this, args);
    record('replaceState', from, location.href);
    return out;
  };

  const onPopState = () => record('popstate', '', location.href);
  const onHashChange = () => record('hashchange', '', location.href);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onHashChange);
  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('hashchange', onHashChange);
  };
}

function enableErrorLogs(ctx: CustomInstrumentationContext): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const pending = new Map<string, { count: number; timer: ReturnType<typeof setTimeout>; record: Record<string, unknown> }>();
  const emitPending = (key: string) => {
    const item = pending.get(key);
    pending.delete(key);
    if (!item) return;
    const attributes = { ...(item.record.attributes as Record<string, unknown>), 'error.count': item.count };
    ctx.logger.emit({ ...item.record, attributes });
  };
  const schedule = (record: Record<string, unknown>) => {
    const attrs = record.attributes as Record<string, unknown>;
    attrs['error.fingerprint'] = errorFingerprint(record.body, attrs);
    const key = String(attrs['error.fingerprint']);
    const existing = pending.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    const timer = setTimeout(() => emitPending(key), 1000);
    pending.set(key, { count: 1, timer, record });
  };

  const onError = (event: ErrorEvent) => ctx.isolator.guard('browser-error', () => {
    schedule({
      severityText: 'ERROR',
      severityNumber: 17,
      body: truncate(event.message, MAX_ERROR_MESSAGE_LENGTH),
      attributes: currentAttributes(ctx, {
        'error.type': event.error?.name ?? 'Error',
        'error.stack': truncate(redactStackTrace(event.error?.stack ?? '', ctx.options.redact?.urlQueryKeys), MAX_ERROR_STACK_LENGTH),
        'source.file': redactUrl(event.filename ?? '', ctx.options.redact?.urlQueryKeys),
        'source.line': event.lineno ?? 0,
        'source.column': event.colno ?? 0
      })
    });
  }, undefined);

  const onRejection = (event: PromiseRejectionEvent) => ctx.isolator.guard('unhandled-rejection', () => {
    const reason = event.reason;
    schedule({
      severityText: 'ERROR',
      severityNumber: 17,
      body: truncate(reason instanceof Error ? reason.message : stringify(reason), MAX_ERROR_MESSAGE_LENGTH),
      attributes: currentAttributes(ctx, {
        'error.type': 'UnhandledPromiseRejection',
        'error.stack': truncate(redactStackTrace(reason instanceof Error ? reason.stack ?? '' : '', ctx.options.redact?.urlQueryKeys), MAX_ERROR_STACK_LENGTH)
      })
    });
  }, undefined);

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    for (const [key, item] of [...pending]) {
      clearTimeout(item.timer);
      emitPending(key);
    }
  };
}

function enableInteractions(ctx: CustomInstrumentationContext): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onEvent = (event: Event) => ctx.isolator.guard('interaction', () => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (!eventTarget || eventTarget.closest('[data-rum-ignore]')) return;
    const target = interactionTarget(eventTarget);
    const text = redactInteractionText(target, target.textContent?.trim() ?? '');
    const targetLabel = interactionLabel(target, text);
    const span = ctx.tracer.startSpan('userInteraction', {
      attributes: currentAttributes(ctx, {
        'interaction.type': event.type,
        'target.tag': target.tagName.toLowerCase(),
        'target.id': target.id,
        'target.class': target.className.toString(),
        'target.name': target.getAttribute('data-rum-name') ?? target.getAttribute('name') ?? '',
        'target.label': targetLabel,
        'target.text': text,
        'target.selector': selector(target)
      })
    });
    span.end();
  }, undefined);
  document.addEventListener('click', onEvent, true);
  document.addEventListener('submit', onEvent, true);
  return () => {
    document.removeEventListener('click', onEvent, true);
    document.removeEventListener('submit', onEvent, true);
  };
}

function enableWebVitals(ctx: CustomInstrumentationContext): () => void {
  let disposed = false;

  const emit = (metric: any, unit: string) => {
    ctx.isolator.guard('web-vitals-emit', () => {
      if (disposed) return;
      const attributes: Attributes = currentAttributes(ctx, {
        'webvital.name': metric.name,
        'webvital.value': metric.value,
        'webvital.unit': unit,
        'webvital.rating': metric.rating,
        'webvital.delta': metric.delta,
        'webvital.id': metric.id
      });
      if (metric.navigationType !== undefined) attributes['webvital.navigation_type'] = metric.navigationType;
      ctx.logger.emit({
        severityText: 'INFO',
        severityNumber: 9,
        body: 'webVital',
        attributes
      });
    }, undefined);
  };

  import('web-vitals').then((vitals) => {
    if (disposed) return;
    vitals.onLCP?.((metric) => emit(metric, 'ms'));
    vitals.onCLS?.((metric) => emit(metric, '1'));
    vitals.onINP?.((metric) => emit(metric, 'ms'));
    vitals.onFCP?.((metric) => emit(metric, 'ms'));
    vitals.onTTFB?.((metric) => emit(metric, 'ms'));
  }).catch(() => undefined);
  return () => {
    disposed = true;
  };
}

function enableResourceTiming(ctx: CustomInstrumentationContext): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  const seen = new Set<string>();
  const observer = new PerformanceObserver((list) => {
    ctx.isolator.guard('resource-timing', () => {
      for (const entry of list.getEntriesByType('resource') as PerformanceResourceTiming[]) {
        if (entry.name.startsWith(ctx.options.collectorUrl)) continue;
        const key = `${entry.name}|${entry.startTime}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const span = ctx.tracer.startSpan('resourceFetch', {
          attributes: currentAttributes(ctx, {
            'http.url': redactUrl(entry.name, ctx.options.redact?.urlQueryKeys),
            'resource.initiator_type': entry.initiatorType,
            'resource.transfer_size': entry.transferSize,
            'resource.encoded_body_size': entry.encodedBodySize,
            'resource.decoded_body_size': entry.decodedBodySize
          })
        });
        span.end();
      }
    }, undefined);
  });
  try {
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    observer.observe({ entryTypes: ['resource'] });
  }
  return () => observer.disconnect();
}

function selector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < 5; depth += 1) {
    let part = current.tagName.toLowerCase();
    if (current.id) part += `#${current.id}`;
    const className = current.className.toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    if (className) part += `.${className}`;
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function currentAttributes(ctx: CustomInstrumentationContext, extra: Attributes): Attributes {
  return { ...ctx.attributes?.(), ...extra };
}

function errorFingerprint(body: unknown, attrs: Record<string, unknown>): string {
  return fnv1a32([
    attrs['error.type'],
    body,
    attrs['source.file'],
    attrs['source.line'],
    attrs['source.column'],
    attrs['error.stack']
  ].map((value) => String(value ?? '')).join('|'));
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function interactionTarget(element: Element): Element {
  return element.closest([
    '[data-rum-name]',
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[aria-label]',
    '[aria-labelledby]',
    '[name]',
    '[title]'
  ].join(',')) ?? element;
}

function interactionLabel(element: Element, redactedText: string): string {
  const explicit = firstNonEmpty([
    element.getAttribute('data-rum-name'),
    element.getAttribute('aria-label'),
    ariaLabelledByText(element),
    element.getAttribute('alt'),
    element.getAttribute('title'),
    element.getAttribute('name'),
    element.id
  ]);
  const label = explicit ?? redactedText.trim();
  return truncate(label || selector(element), MAX_TARGET_LABEL_LENGTH);
}

function ariaLabelledByText(element: Element): string {
  const ownerDocument = element.ownerDocument;
  const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) ?? [];
  return ids.map((id) => ownerDocument.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
}

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
  return values.map((value) => value?.trim() ?? '').find(Boolean);
}

function requestAnimationFrameSafe(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 0);
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
