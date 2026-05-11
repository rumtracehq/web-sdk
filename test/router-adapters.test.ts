import { describe, expect, test, vi } from 'vitest';
import type { RumInstance, SpanHandle } from '../src/types';
import { trackNextAppNavigation } from '../src/next-app-router';
import { trackReactRouterNavigation } from '../src/react-router';

describe('router adapter helpers', () => {
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
