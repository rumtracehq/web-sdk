# @rumtrace/web-sdk

Browser Real User Monitoring SDK built on the official OpenTelemetry JavaScript packages.

The SDK exposes one primary entry point:

```ts
import rumtrace from '@rumtrace/web-sdk';

const rum = rumtrace.start('my web app', 'public-collector-token', {
  collectorUrl: 'https://ingest.rumtrace.com/',
  environment: 'production',
  release: '1.2.3'
});
```

It sends OTLP/HTTP protobuf telemetry to:

- `<collectorUrl>/v1/traces`
- `<collectorUrl>/v1/logs`

## Install

```sh
npm install @rumtrace/web-sdk
```

Optional router integrations use peer dependencies from the host app:

```sh
npm install react react-router
npm install next react
```

## OpenTelemetry Usage

This package consumes OpenTelemetry JS instead of maintaining a custom OTLP encoder or instrumentation stack.

- Providers: `WebTracerProvider`, `LoggerProvider`
- Exporters: `@opentelemetry/exporter-*-otlp-proto`
- Batching: `BatchSpanProcessor`, `BatchLogRecordProcessor`
- Auto instrumentation: document load, fetch, XHR, user interaction
- Resource creation: `resourceFromAttributes`

SDK-owned code focuses on the RUM facade, session/user attributes, error isolation, redaction, route helpers, browser error capture, web vitals, and resource timing. Web Vitals are emitted as log records with `webvital.*` attributes, not OTLP metrics.

## Basic Usage

```ts
import { start } from '@rumtrace/web-sdk';

const rum = start('checkout-web', 'public-collector-token', {
  collectorUrl: 'https://ingest.rumtrace.com/',
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
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `collectorUrl` | `https://ingest.rumtrace.com/` | HTTPS OTLP base URL. Non-HTTPS URLs return a no-op instance. |
| `headers` | `{}` | Extra exporter headers. A provided `Authorization` header overrides the bearer token. |
| `sampleRate` | `1` | Session sampling rate from `0` to `1`. Invalid values fall back to `1`. |
| `environment` | `undefined` | Resource attribute `deployment.environment`. |
| `release` | `undefined` | Resource attribute `service.version`. |
| `enabledInstrumentations` | core browser instrumentations | Limits which instrumentations are registered. |
| `propagateTraceHeaders` | `false` | Enables trace header propagation for allowed network destinations. |
| `propagateTraceHeadersAllowList` | `[]` | String or RegExp URL allow-list for propagation. String entries match exact origins or URL path prefixes after `new URL(entry, location.href)` normalization. |
| `captureBodies` | `false` | Reserved for network body capture. Bodies are not captured by default. |
| `redact.urlQueryKeys` | built-in sensitive list | Additional query-string keys to redact. |
| `beforeSendBatch` | `undefined` | Receives encoded batch metadata `{ kind, size }`; return `false` to drop the batch. |

`beforeSendBatch` runs after OTLP encoding, so it cannot mutate individual telemetry records.

RegExp entries in `propagateTraceHeadersAllowList` are used as provided and can match any URL, so treat them as user-owned propagation policy.

## Public API

```ts
interface RumInstance {
  log: LogApi;
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
import { trackReactRouterNavigation } from '@rumtrace/web-sdk/react-router';

trackReactRouterNavigation(rum, '/products/:id', { id: '123' });
```

Next.js Pages Router:

```ts
import { enableNextPagesRouter } from '@rumtrace/web-sdk/next-pages-router';

const disable = await enableNextPagesRouter(rum, {
  redact: { urlQueryKeys: ['session_id'] }
});
```

Next.js App Router:

```ts
import { trackNextAppNavigation } from '@rumtrace/web-sdk/next-app-router';

trackNextAppNavigation(rum, {
  pathname: '/products/123',
  pattern: '/products/[id]',
  redact: { urlQueryKeys: ['session_id'] }
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

Route, resource, network, and router-adapter URL attributes use the same query redaction policy. Browser error messages are truncated to 1024 characters, and error stacks are truncated to 4096 characters.

Pass the same `redact` object to the optional Next.js router adapters when you use custom query keys there.

Sensitive input interaction text for `password`, `email`, `tel`, and `credit-card` input types is replaced with `[REDACTED]`.

Interaction telemetry uses the SDK's custom click/submit instrumentation by default. Add `data-rum-ignore` to an element or ancestor to suppress interaction spans for that subtree.

`setUser(userId, attributes)` does not automatically redact, hash, or mask values. Do not pass raw PII such as email addresses, phone numbers, names, or internal identifiers unless your telemetry policy allows it. Hash or sanitize user values before calling `setUser`.

## Build And Test

```sh
npm run typecheck
npm run build
npm test
```

## Releases

Releases are managed with Changesets. See [RELEASING.md](./RELEASING.md) for the contributor and npm publishing flow.

The test suite uses Vitest, Happy DOM, and fast-check. Property tests use the design tag format:

```ts
// Feature: rum-web-sdk, Property 33: Redaction invariants
```

## Current Scope

This is a functional OpenTelemetry-based SDK foundation. It intentionally relies on upstream OpenTelemetry for OTLP protobuf serialization, exporters, batching, and core browser auto-instrumentation. The next hardening steps are full OTLP round-trip properties, mock collector integration tests, offline queue persistence, bundle-size CI, and browser smoke tests.
