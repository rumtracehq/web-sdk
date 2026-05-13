import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, AttributeValue, LogApi, RumInstance, Severity, SpanHandle } from './types';
import { ErrorIsolator } from './core/error-isolator';
import { SessionManager } from './core/session';
import { UserIdentifierStore } from './core/user';
import { AttributeStore } from './otel/attributes';
import type { OTelRuntime } from './otel/setup';

const SEVERITY_NUMBER: Record<Severity, number> = {
  TRACE: 1,
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21
};

export class OpenTelemetryRumInstance implements RumInstance {
  readonly log: LogApi;
  private readonly activeSpans: Array<{ span: ReturnType<OTelRuntime['tracer']['startSpan']>; timer: ReturnType<typeof setTimeout> }> = [];
  private shutdownPromise: Promise<void> | undefined;
  private isShutdown = false;

  constructor(
    private readonly runtime: OTelRuntime,
    private readonly session: SessionManager,
    private readonly users: UserIdentifierStore,
    private readonly attributes: AttributeStore,
    private readonly isolator: ErrorIsolator,
    private readonly cleanup: Array<() => void>
  ) {
    const log = ((severity: Severity, body: unknown, attrs?: Attributes) => this.emitLog(severity, body, attrs)) as LogApi;
    log.trace = (body, attrs) => this.emitLog('TRACE', body, attrs);
    log.debug = (body, attrs) => this.emitLog('DEBUG', body, attrs);
    log.info = (body, attrs) => this.emitLog('INFO', body, attrs);
    log.warn = (body, attrs) => this.emitLog('WARN', body, attrs);
    log.error = (body, attrs) => this.emitLog('ERROR', body, attrs);
    log.fatal = (body, attrs) => this.emitLog('FATAL', body, attrs);
    this.log = log;
  }

  addCleanup(cleanup: Array<() => void>): void {
    this.cleanup.push(...cleanup);
  }

  startSpan(name: string, attributes?: Attributes): SpanHandle {
    return this.isolator.guard('start-span', () => {
      if (this.isShutdown || !this.session.sampled) return noopSpanHandle;
      const parent = this.activeSpans[this.activeSpans.length - 1]?.span;
      const parentContext = parent ? trace.setSpan(context.active(), parent) : context.active();
      const span = this.runtime.tracer.startSpan(name, { attributes: this.attributes.current(attributes) as never }, parentContext);
      const timer = setTimeout(() => {
        span.setAttribute('rum.auto_ended', true);
        this.endSpan(span);
      }, 30_000);
      this.activeSpans.push({ span, timer });
      return this.handleFor(span);
    }, noopSpanHandle);
  }

  addEvent(name: string, attributes?: Attributes): void {
    this.isolator.guard('add-event', () => {
      this.activeSpans[this.activeSpans.length - 1]?.span.addEvent(name, this.attributes.current(attributes) as never);
    }, undefined);
  }

  getActiveSpanContext() {
    return this.activeSpans[this.activeSpans.length - 1]?.span.spanContext();
  }

  setGlobalAttribute(key: string, value: AttributeValue): void {
    this.isolator.guard('set-global-attribute', () => {
      if (typeof key !== 'string' || key.trim() === '') {
        this.isolator.warn('invalid-global-attribute-key', 'global attribute key must be a non-empty string');
        return;
      }
      this.attributes.setGlobalAttribute(key, value);
    }, undefined);
  }

  removeGlobalAttribute(key: string): void {
    this.isolator.guard('remove-global-attribute', () => this.attributes.removeGlobalAttribute(key), undefined);
  }

  setUser(userId: string, attributes?: Attributes): void {
    this.isolator.guard('set-user', () => this.users.setUser(userId, attributes), undefined);
  }

  clearUser(): void {
    this.isolator.guard('clear-user', () => this.users.clearUser(), undefined);
  }

  async flush(): Promise<void> {
    if (this.isShutdown) return;
    await this.isolator.guardAsync('flush', async () => {
      await Promise.all([
        this.runtime.tracerProvider.forceFlush(),
        this.runtime.loggerProvider.forceFlush()
      ]);
    }, undefined);
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.isolator.guardAsync('shutdown', async () => {
      this.isShutdown = true;
      for (const item of this.activeSpans) clearTimeout(item.timer);
      this.activeSpans.length = 0;
      for (const dispose of this.cleanup.splice(0)) dispose();
      await Promise.all([
        this.runtime.tracerProvider.shutdown(),
        this.runtime.loggerProvider.shutdown()
      ]);
    }, undefined);
    return this.shutdownPromise;
  }

  private emitLog(severity: Severity, body: unknown, attributes?: Attributes): void {
    this.isolator.guard('log', () => {
      if (this.isShutdown || !this.session.sampled) return;
      const normalizedSeverity = SEVERITY_NUMBER[severity] ? severity : 'INFO';
      if (normalizedSeverity !== severity) this.isolator.warn('invalid-log-severity', `Invalid severity ${String(severity)}; using INFO`);
      this.runtime.logger.emit({
        severityText: normalizedSeverity,
        severityNumber: SEVERITY_NUMBER[normalizedSeverity],
        body: stringifyBody(body),
        attributes: this.attributes.current(attributes) as never
      });
    }, undefined);
  }

  private handleFor(span: ReturnType<OTelRuntime['tracer']['startSpan']>): SpanHandle {
    let ended = false;
    return {
      setAttribute: (key, value) => this.isolator.guard('span-set-attribute', () => span.setAttribute(key, value as never), undefined),
      addEvent: (name, attributes) => this.isolator.guard('span-add-event', () => span.addEvent(name, this.attributes.current(attributes) as never), undefined),
      setStatus: (status, message) => this.isolator.guard('span-set-status', () => {
        span.setStatus({ code: status === 'ERROR' ? SpanStatusCode.ERROR : status === 'OK' ? SpanStatusCode.OK : SpanStatusCode.UNSET, message });
      }, undefined),
      end: () => {
        if (ended) return;
        ended = true;
        this.endSpan(span);
      }
    };
  }

  private endSpan(span: ReturnType<OTelRuntime['tracer']['startSpan']>): void {
    const index = this.activeSpans.findIndex((item) => item.span === span);
    if (index >= 0) {
      clearTimeout(this.activeSpans[index].timer);
      this.activeSpans.splice(index, 1);
    }
    span.end();
  }

}

const noopSpanHandle: SpanHandle = {
  setAttribute: () => undefined,
  addEvent: () => undefined,
  setStatus: () => undefined,
  end: () => undefined
};

function stringifyBody(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body) ?? String(body);
  } catch {
    return String(body);
  }
}
