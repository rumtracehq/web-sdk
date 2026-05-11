import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorIsolator } from '../src/core/error-isolator';
import { normalizeOptions } from '../src/core/options';
import { enableCustomInstrumentations } from '../src/instrumentation/custom';
import { registerOtelInstrumentations } from '../src/instrumentation/otel';

describe('interaction instrumentation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  test('does not register OpenTelemetry user interaction instrumentation by default', () => {
    const options = normalizeOptions({
      collectorUrl: 'https://collector.example/otlp',
      enabledInstrumentations: ['interaction']
    }, new ErrorIsolator());

    expect(registerOtelInstrumentations(options!)).toHaveLength(0);
  });

  test('emits one custom interaction span for a click', () => {
    const { spans, cleanup } = enableInteractionHarness();
    const button = document.createElement('button');
    button.id = 'checkout';
    button.className = 'primary action';
    button.textContent = 'Buy now';
    document.body.append(button);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    cleanup();

    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('userInteraction');
    expect(spans[0].attributes).toMatchObject({
      'interaction.type': 'click',
      'target.tag': 'button',
      'target.id': 'checkout',
      'target.class': 'primary action',
      'target.text': 'Buy now'
    });
    expect(spans[0].end).toHaveBeenCalledTimes(1);
  });

  test('skips elements marked with data-rum-ignore', () => {
    const { spans, cleanup } = enableInteractionHarness();
    const ignored = document.createElement('div');
    ignored.setAttribute('data-rum-ignore', '');
    const button = document.createElement('button');
    button.textContent = 'Ignore me';
    ignored.append(button);
    document.body.append(ignored);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    cleanup();

    expect(spans).toHaveLength(0);
  });

  test('redacts sensitive input interaction text', () => {
    const { spans, cleanup } = enableInteractionHarness();
    const input = document.createElement('input');
    input.type = 'email';
    input.value = 'user@example.com';
    document.body.append(input);

    input.dispatchEvent(new Event('click', { bubbles: true }));
    cleanup();

    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['target.text']).toBe('[REDACTED]');
  });
});

function enableInteractionHarness(): {
  spans: Array<{ name: string; attributes: Record<string, unknown>; end: ReturnType<typeof vi.fn> }>;
  cleanup: () => void;
} {
  const spans: Array<{ name: string; attributes: Record<string, unknown>; end: ReturnType<typeof vi.fn> }> = [];
  const options = normalizeOptions({
    collectorUrl: 'https://collector.example/otlp',
    enabledInstrumentations: ['interaction']
  }, new ErrorIsolator());
  const cleanups = enableCustomInstrumentations({
    tracer: {
      startSpan: vi.fn((name: string, config: { attributes: Record<string, unknown> }) => {
        const span = { end: vi.fn() };
        spans.push({ name, attributes: config.attributes, end: span.end });
        return span;
      })
    },
    logger: {},
    meter: {},
    session: {},
    options: options!,
    isolator: new ErrorIsolator()
  } as never);
  return { spans, cleanup: () => cleanups.forEach((cleanup) => cleanup()) };
}
