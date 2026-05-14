import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { SessionManager } from '../src/core/session';
import { UserIdentifierStore } from '../src/core/user';
import { OpenTelemetryRumInstance } from '../src/instance';
import { AttributeStore } from '../src/otel/attributes';
import type { OTelRuntime } from '../src/otel/setup';

function makeHarness() {
  const span = {
    setAttribute: vi.fn(),
    addEvent: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
    spanContext: vi.fn(() => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }))
  };
  const runtime = {
    tracerProvider: {
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    },
    loggerProvider: {
      forceFlush: vi.fn(async () => undefined),
      shutdown: vi.fn(async () => undefined)
    },
    tracer: {
      startSpan: vi.fn(() => span)
    },
    logger: {
      emit: vi.fn()
    },
    cleanup: []
  } as unknown as OTelRuntime;
  const session = new SessionManager(1, () => 1000);
  const users = new UserIdentifierStore(new ErrorIsolator());
  const attributes = new AttributeStore(session, users);
  const rum = new OpenTelemetryRumInstance(runtime, session, users, attributes, new ErrorIsolator(), []);
  return { rum, runtime, span };
}

describe('OpenTelemetryRumInstance span lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  test('shutdown ends active spans before provider shutdown', async () => {
    const { rum, runtime, span } = makeHarness();

    rum.startSpan('checkout');
    await rum.shutdown();

    expect(span.setAttribute).toHaveBeenCalledWith('rum.ended_on_shutdown', true);
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(runtime.tracerProvider.shutdown).toHaveBeenCalledTimes(1);
    expect(runtime.loggerProvider.shutdown).toHaveBeenCalledTimes(1);
  });

  test('auto-ended spans are not ended a second time by the handle', () => {
    vi.useFakeTimers();
    const { rum, span } = makeHarness();

    const handle = rum.startSpan('checkout');
    vi.advanceTimersByTime(30_000);
    handle.end();

    expect(span.setAttribute).toHaveBeenCalledWith('rum.auto_ended', true);
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
