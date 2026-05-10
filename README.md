# rum-web-sdk

Browser Real User Monitoring SDK built on the official OpenTelemetry JavaScript packages.

The SDK exposes one primary entry point:

```ts
import rumtrace from 'rum-web-sdk';

const rum = rumtrace.start('my web app', 'collector-token', {
  collectorUrl: 'https://collector.example.com/otlp',
  environment: 'production',
  release: '1.2.3'
});
```

It sends OTLP/HTTP protobuf telemetry to:

- `<collectorUrl>/v1/traces`
- `<collectorUrl>/v1/logs`
- `<collectorUrl>/v1/metrics`

## Install

```sh
npm install rum-web-sdk
```

Optional router integrations use peer dependencies from the host app:

```sh
npm install react react-router
npm install next react
```

## OpenTelemetry Usage

This package consumes OpenTelemetry JS instead of maintaining a custom OTLP encoder or instrumentation stack.

- Providers: `WebTracerProvider`, `LoggerProvider`, `MeterProvider`
- Exporters: `@opentelemetry/exporter-*-otlp-proto`
- Batching: `BatchSpanProcessor`, `BatchLogRecordProcessor`, `PeriodicExportingMetricReader`
- Auto instrumentation: document load, fetch, XHR, user interaction
- Resource creation: `resourceFromAttributes`

SDK-owned code focuses on the RUM facade, session/user attributes, error isolation, redaction, route helpers, browser error capture, web vitals, and resource timing.

## Basic Usage

```ts
import { start } from 'rum-web-sdk';

const rum = start('checkout-web', 'theirToken', {
  collectorUrl: 'https://collector.example.com/otlp',
  headers: {
    'x-org-id': 'org_123'
  },
  sampleRate: 1,
  enabledInstrumentations: [
    'page-load',
    'route-change',
    'network',
    'error',
    'interaction',
    'web-vitals',
    'resource-timing'
  ]
});

rum.log.info('checkout loaded', { cart_items: 3 });

const span = rum.startSpan('apply coupon');
span.setAttribute('coupon.code', 'SUMMER');
span.end();

rum.counter('cart.added').add(1);
rum.gauge('cart.value').record(149.99);
rum.histogram('checkout.duration').record(842);
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `collectorUrl` | `https://rum-ingest.example.com/otlp` | HTTPS OTLP base URL. Non-HTTPS URLs return a no-op instance. |
| `headers` | `{}` | Extra exporter headers. A provided `Authorization` header overrides the bearer token. |
| `sampleRate` | `1` | Session sampling rate from `0` to `1`. Invalid values fall back to `1`. |
| `environment` | `undefined` | Resource attribute `deployment.environment`. |
| `release` | `undefined` | Resource attribute `service.version`. |
| `enabledInstrumentations` | core browser instrumentations | Limits which instrumentations are registered. |
| `propagateTraceHeaders` | `false` | Enables trace header propagation for allowed network destinations. |
| `propagateTraceHeadersAllowList` | `[]` | String or RegExp URL allow-list for propagation. |
| `captureBodies` | `false` | Reserved for network body capture. Bodies are not captured by default. |
| `redact.urlQueryKeys` | built-in sensitive list | Additional query-string keys to redact. |
| `redact.headerKeys` | `[]` | Header keys to drop from emitted telemetry. |
| `beforeSend` | `undefined` | Reserved hook for final record filtering/mutation. |

## Public API

```ts
interface RumInstance {
  log: LogApi;
  counter(name: string): Counter;
  gauge(name: string): Gauge;
  histogram(name: string): Histogram;
  startSpan(name: string, attributes?: Attributes): SpanHandle;
  addEvent(name: string, attributes?: Attributes): void;
  setGlobalAttribute(key: string, value: AttributeValue): void;
  removeGlobalAttribute(key: string): void;
  setUser(userId: string, attributes?: Attributes): void;
  clearUser(): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Router Adapters

React Router:

```ts
import { trackReactRouterNavigation } from 'rum-web-sdk/react-router';

trackReactRouterNavigation(rum, '/products/:id', { id: '123' });
```

Next.js Pages Router:

```ts
import { enableNextPagesRouter } from 'rum-web-sdk/next-pages-router';

const disable = await enableNextPagesRouter(rum);
```

Next.js App Router:

```ts
import { trackNextAppNavigation } from 'rum-web-sdk/next-app-router';

trackNextAppNavigation(rum, {
  pathname: '/products/123',
  pattern: '/products/[id]'
});
```

## Error Isolation

All public SDK methods and custom browser callbacks are wrapped by `ErrorIsolator`. Internal failures are caught, rate-limited to one console warning per signature per 60 seconds, and converted to no-op behavior where possible.

Invalid initialization arguments return a no-op `RumInstance`, so host application code can keep calling the SDK without defensive checks.

## Redaction

`http.url` query parameters are redacted when their key is one of:

- `password`
- `token`
- `secret`
- `api_key`
- `authorization`
- any key in `options.redact.urlQueryKeys`

Sensitive input interaction text for `password`, `email`, `tel`, and `credit-card` input types is replaced with `[REDACTED]`.

## Build And Test

```sh
npm run typecheck
npm run build
npm test
```

The test suite uses Vitest, Happy DOM, and fast-check. Property tests use the design tag format:

```ts
// Feature: rum-web-sdk, Property 33: Redaction invariants
```

## Current Scope

This is a functional OpenTelemetry-based SDK foundation. It intentionally relies on upstream OpenTelemetry for OTLP protobuf serialization, exporters, batching, and core browser auto-instrumentation. The next hardening steps are full OTLP round-trip properties, mock collector integration tests, offline queue persistence, bundle-size CI, and browser smoke tests.
