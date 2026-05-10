import type { RumInstance } from './types';

export interface RumNextAppTrackerProps {
  rum: RumInstance;
  pathname: string;
  search?: string;
  pattern?: string;
}

export function trackNextAppNavigation(rum: RumInstance, props: Omit<RumNextAppTrackerProps, 'rum'>): void {
  const url = props.search ? `${props.pathname}?${props.search}` : props.pathname;
  const span = rum.startSpan('routeChange', {
    'next.router': 'app',
    'route.url': url,
    'route.pattern': props.pattern ?? props.pathname
  });
  span.end();
}

export function RumNextAppTracker(props: RumNextAppTrackerProps): null {
  trackNextAppNavigation(props.rum, props);
  return null;
}
