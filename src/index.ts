import type { RumInstance, RumOptions } from './types';
import { ErrorIsolator } from './core/error-isolator';
import { createNoopRumInstance } from './core/noop';
import { normalizeOptions } from './core/options';
import { SessionManager } from './core/session';
import { UserIdentifierStore } from './core/user';
import { AttributeStore } from './otel/attributes';
import { setupOpenTelemetry } from './otel/setup';
import { registerOtelInstrumentations } from './instrumentation/otel';
import { enableCustomInstrumentations } from './instrumentation/custom';
import { enableFetchTracePropagation } from './instrumentation/fetch-propagation';
import { OpenTelemetryRumInstance } from './instance';

export type { AttributeValue, Attributes, Counter, Gauge, Histogram, InstrumentationName, LogApi, RumInstance, RumOptions, Severity, SpanHandle, TelemetryBatchMetadata } from './types';
export { redactHeaders, redactInteractionText, redactUrl } from './core/redactor';

declare global {
  interface Window {
    __rumWebSdkInstance?: RumInstance;
  }
}

let activeInstance: RumInstance | undefined;

export function start(appName: string, authToken: string, options?: RumOptions): RumInstance {
  const isolator = new ErrorIsolator();
  return isolator.guard('start', () => {
    const existing = getActiveInstance();
    if (existing) {
      isolator.warn('duplicate-start', 'rumtrace.start() was called more than once; returning the first instance');
      return existing;
    }

    if (typeof appName !== 'string' || appName.trim() === '' || typeof authToken !== 'string' || authToken.trim() === '') {
      isolator.warn('invalid-start-arguments', 'appName and authToken must be non-empty strings');
      return createNoopRumInstance();
    }

    const normalized = normalizeOptions(options, isolator);
    if (!normalized) return createNoopRumInstance();

    const session = new SessionManager(normalized.sampleRate);
    if (!session.sampled) {
      return setActiveInstance(createNoopRumInstance());
    }

    const users = new UserIdentifierStore(isolator);
    const attributes = new AttributeStore(session, users);
    const runtime = setupOpenTelemetry(
      appName,
      authToken,
      normalized,
      { 'session.id': session.id, 'session.sampled': session.sampled },
      () => attributes.current(),
      isolator
    );
    const otelInstrumentations = registerOtelInstrumentations(normalized, {
      tracerProvider: runtime.tracerProvider,
      meterProvider: runtime.meterProvider
    });
    const instance = new OpenTelemetryRumInstance(runtime, session, users, attributes, isolator, []);
    const cleanup = [
      ...runtime.cleanup,
      enableFetchTracePropagation(normalized, () => instance.getActiveSpanContext()),
      ...otelInstrumentations.map((instrumentation) => () => instrumentation.disable()),
      ...enableCustomInstrumentations({
        tracer: runtime.tracer,
        logger: runtime.logger,
        meter: runtime.meter,
        session,
        options: normalized,
        isolator
      })
    ];
    instance.addCleanup(cleanup);
    return setActiveInstance(instance);
  }, createNoopRumInstance());
}

function getActiveInstance(): RumInstance | undefined {
  return activeInstance ?? (typeof window === 'undefined' ? undefined : window.__rumWebSdkInstance);
}

function setActiveInstance(instance: RumInstance): RumInstance {
  let shutdownPromise: Promise<void> | undefined;
  const originalShutdown = instance.shutdown.bind(instance);
  instance.shutdown = () => {
    shutdownPromise ??= originalShutdown().finally(() => clearActiveInstance(instance));
    return shutdownPromise;
  };
  activeInstance = instance;
  if (typeof window !== 'undefined') window.__rumWebSdkInstance = instance;
  return instance;
}

function clearActiveInstance(instance: RumInstance): void {
  if (activeInstance === instance) activeInstance = undefined;
  if (typeof window !== 'undefined' && window.__rumWebSdkInstance === instance) delete window.__rumWebSdkInstance;
}

export const rumtrace = { start };
export default rumtrace;
