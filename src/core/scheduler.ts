export function scheduleDeferred(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1000 });
    return;
  }
  setTimeout(fn, 0);
}
