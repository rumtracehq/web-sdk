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
import { OpenTelemetryRumInstance } from './instance';

export type { AttributeValue, Attributes, Counter, Gauge, Histogram, InstrumentationName, LogApi, RumInstance, RumOptions, Severity, SpanHandle } from './types';
export { redactHeaders, redactInteractionText, redactUrl } from './core/redactor';

let activeInstance: RumInstance | undefined;

export function start(appName: string, authToken: string, options?: RumOptions): RumInstance {
  const isolator = new ErrorIsolator();
  return isolator.guard('start', () => {
    if (activeInstance) {
      isolator.warn('duplicate-start', 'rumtrace.start() was called more than once; returning the first instance');
      return activeInstance;
    }

    if (typeof appName !== 'string' || appName.trim() === '' || typeof authToken !== 'string' || authToken.trim() === '') {
      isolator.warn('invalid-start-arguments', 'appName and authToken must be non-empty strings');
      return createNoopRumInstance();
    }

    const normalized = normalizeOptions(options, isolator);
    if (!normalized) return createNoopRumInstance();

    const session = new SessionManager(normalized.sampleRate);
    if (!session.sampled) {
      activeInstance = createNoopRumInstance();
      return activeInstance;
    }

    const users = new UserIdentifierStore(isolator);
    const attributes = new AttributeStore(session, users);
    const runtime = setupOpenTelemetry(
      appName,
      authToken,
      normalized,
      { 'session.id': session.id, 'session.sampled': session.sampled },
      () => attributes.current()
    );
    const otelInstrumentations = registerOtelInstrumentations(normalized);
    const cleanup = [
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

    activeInstance = new OpenTelemetryRumInstance(runtime, session, users, attributes, isolator, cleanup);
    return activeInstance;
  }, createNoopRumInstance());
}

export const rumtrace = { start };
export default rumtrace;
