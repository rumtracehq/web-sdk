import { StrictMode, act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RumInstance, SpanHandle } from '../src/types';
import { RumNextAppTracker, trackNextAppNavigation } from '../src/next-app-router';
import { RumRouterTracker, trackReactRouterNavigation } from '../src/react-router';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('router adapter helpers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('trackReactRouterNavigation emits routeChange with pattern and params', () => {
    const rum = fakeRum();

    trackReactRouterNavigation(rum, '/products/:id', { id: '123' });

    expect(rum.startSpan).toHaveBeenCalledWith('routeChange', {
      'router.type': 'react-router',
      'route.pattern': '/products/:id',
      'route.params': JSON.stringify({ id: '123' })
    });
  });

  test('trackNextAppNavigation emits routeChange with app router attributes', () => {
    const rum = fakeRum();

    trackNextAppNavigation(rum, { pathname: '/products/123', search: 'tab=reviews&token=secret', pattern: '/products/[id]' });

    expect(rum.startSpan).toHaveBeenCalledWith('routeChange', {
      'next.router': 'app',
      'route.url': '/products/123?tab=reviews&token=%5BREDACTED%5D',
      'route.pattern': '/products/[id]'
    });
  });

  test('trackNextAppNavigation applies custom redaction keys', () => {
    const rum = fakeRum();

    trackNextAppNavigation(rum, {
      pathname: '/products/123',
      search: 'session_id=abc&tab=reviews',
      redact: { urlQueryKeys: ['session_id'] }
    });

    expect(rum.startSpan).toHaveBeenCalledWith('routeChange', expect.objectContaining({
      'route.url': '/products/123?session_id=%5BREDACTED%5D&tab=reviews'
    }));
  });

  test('RumRouterTracker emits in an effect and deduplicates the same route', async () => {
    const rum = fakeRum();
    const root = createRoot(document.body.appendChild(document.createElement('div')));

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumRouterTracker, { rum, pattern: '/products/:id', params: { id: '123' } })));
    });
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumRouterTracker, { rum, pattern: '/products/:id', params: { id: '123' } })));
    });
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumRouterTracker, { rum, pattern: '/cart' })));
    });

    expect(rum.startSpan).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  test('RumNextAppTracker emits in an effect and deduplicates the same route', async () => {
    const rum = fakeRum();
    const root = createRoot(document.body.appendChild(document.createElement('div')));

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumNextAppTracker, { rum, pathname: '/products/123', search: 'tab=reviews' })));
    });
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumNextAppTracker, { rum, pathname: '/products/123', search: 'tab=reviews' })));
    });
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(RumNextAppTracker, { rum, pathname: '/cart' })));
    });

    expect(rum.startSpan).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});

function fakeRum(): RumInstance {
  const handle: SpanHandle = {
    setAttribute: vi.fn(),
    addEvent: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn()
  };
  return {
    log: Object.assign(vi.fn(), {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn()
    }),
    counter: vi.fn(() => ({ add: vi.fn() })),
    gauge: vi.fn(() => ({ record: vi.fn() })),
    histogram: vi.fn(() => ({ record: vi.fn() })),
    startSpan: vi.fn(() => handle),
    addEvent: vi.fn(),
    setGlobalAttribute: vi.fn(),
    removeGlobalAttribute: vi.fn(),
    setUser: vi.fn(),
    clearUser: vi.fn(),
    flush: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined)
  };
}
