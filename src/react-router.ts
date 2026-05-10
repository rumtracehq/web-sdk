import type { Attributes, RumInstance } from './types';

export interface RumRouterTrackerProps {
  rum: RumInstance;
  pattern?: string;
  params?: Attributes;
}

export function trackReactRouterNavigation(rum: RumInstance, pattern: string, params: Attributes = {}): void {
  const span = rum.startSpan('routeChange', {
    'router.type': 'react-router',
    'route.pattern': pattern,
    'route.params': JSON.stringify(params)
  });
  span.end();
}

export function RumRouterTracker(props: RumRouterTrackerProps): null {
  if (props.pattern) trackReactRouterNavigation(props.rum, props.pattern, props.params ?? {});
  return null;
}
