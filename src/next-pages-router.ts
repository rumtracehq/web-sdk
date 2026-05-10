import type { RumInstance } from './types';

export async function enableNextPagesRouter(rum: RumInstance): Promise<() => void> {
  const mod = await import('next/router');
  const router = mod.default;
  let active: ReturnType<RumInstance['startSpan']> | undefined;
  const onStart = (url: string) => {
    active = rum.startSpan('routeChange', { 'next.router': 'pages', 'route.url': url });
  };
  const onComplete = (url: string) => {
    active?.setAttribute('route.url', url);
    active?.end();
    active = undefined;
  };
  const onError = (err: Error, url: string) => {
    active?.setAttribute('route.url', url);
    active?.setStatus('ERROR', err.message);
    active?.end();
    active = undefined;
  };
  router.events.on('routeChangeStart', onStart);
  router.events.on('routeChangeComplete', onComplete);
  router.events.on('routeChangeError', onError);
  return () => {
    router.events.off('routeChangeStart', onStart);
    router.events.off('routeChangeComplete', onComplete);
    router.events.off('routeChangeError', onError);
  };
}
