'use client';

import { useEffect } from 'react';
import type { RumInstance, RumOptions } from './types';
import { redactUrl } from './core/redactor';

export interface RumNextAppTrackerProps {
  rum: RumInstance;
  pathname: string;
  search?: string;
  pattern?: string;
  redact?: RumOptions['redact'];
}

const lastAppNavigation = new WeakMap<RumInstance, string>();

export function trackNextAppNavigation(rum: RumInstance, props: Omit<RumNextAppTrackerProps, 'rum'>): void {
  const url = redactUrl(routeUrl(props.pathname, props.search), props.redact?.urlQueryKeys);
  const span = rum.startSpan('routeChange', {
    'next.router': 'app',
    'route.url': url,
    'route.pattern': props.pattern ?? props.pathname
  });
  span.end();
}

export function RumNextAppTracker(props: RumNextAppTrackerProps): null {
  const redactionKey = props.redact?.urlQueryKeys?.join('\0') ?? '';
  useEffect(() => {
    const key = `${props.pathname}|${props.search ?? ''}|${props.pattern ?? ''}|${redactionKey}`;
    if (lastAppNavigation.get(props.rum) === key) return;
    lastAppNavigation.set(props.rum, key);
    trackNextAppNavigation(props.rum, props);
  }, [props.rum, props.pathname, props.search, props.pattern, redactionKey]);
  return null;
}

function routeUrl(pathname: string, search?: string): string {
  if (!search) return pathname;
  return `${pathname}${search.startsWith('?') ? search : `?${search}`}`;
}
