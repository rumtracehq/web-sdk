'use client';

import { useEffect } from 'react';
import type { Attributes, RumInstance } from './types';

export interface RumRouterTrackerProps {
  rum: RumInstance;
  pattern?: string;
  params?: Attributes;
}

const lastRouterNavigation = new WeakMap<RumInstance, string>();

export function trackReactRouterNavigation(rum: RumInstance, pattern: string, params: Attributes = {}): void {
  const span = rum.startSpan('routeChange', {
    'router.type': 'react-router',
    'route.pattern': pattern,
    'route.params': JSON.stringify(params)
  });
  span.end();
}

export function RumRouterTracker(props: RumRouterTrackerProps): null {
  const paramsKey = stringifyParams(props.params ?? {});
  useEffect(() => {
    if (!props.pattern) return;
    const key = `${props.pattern}|${paramsKey}`;
    if (lastRouterNavigation.get(props.rum) === key) return;
    lastRouterNavigation.set(props.rum, key);
    trackReactRouterNavigation(props.rum, props.pattern, props.params ?? {});
  }, [props.rum, props.pattern, paramsKey]);
  return null;
}

function stringifyParams(params: Attributes): string {
  try {
    return JSON.stringify(params);
  } catch {
    return String(params);
  }
}
