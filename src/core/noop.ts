import type { Counter, Gauge, Histogram, LogApi, RumInstance, SpanHandle } from '../types';

const noop = () => undefined;

const noopHandle: SpanHandle = {
  setAttribute: noop,
  addEvent: noop,
  setStatus: noop,
  end: noop
};

const noopCounter: Counter = { add: noop };
const noopGauge: Gauge = { record: noop };
const noopHistogram: Histogram = { record: noop };

function makeLog(): LogApi {
  const log = ((_severity, _body, _attributes) => undefined) as LogApi;
  log.trace = noop;
  log.debug = noop;
  log.info = noop;
  log.warn = noop;
  log.error = noop;
  log.fatal = noop;
  return log;
}

export function createNoopRumInstance(): RumInstance {
  return {
    log: makeLog(),
    counter: () => noopCounter,
    gauge: () => noopGauge,
    histogram: () => noopHistogram,
    startSpan: () => noopHandle,
    addEvent: noop,
    setGlobalAttribute: noop,
    removeGlobalAttribute: noop,
    setUser: noop,
    clearUser: noop,
    flush: async () => undefined,
    shutdown: async () => undefined
  };
}
