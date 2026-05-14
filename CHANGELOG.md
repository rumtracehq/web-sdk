# @rumtrace/web-sdk

## 0.3.1

### Patch Changes

- 9f461dc: Added label extraction from user events
- 93194d7: Harden browser delivery and privacy behavior: redact URLs in error stacks, flush debounced errors during cleanup, close active spans on shutdown, avoid oversized unload keepalive sends, handle overlapping Next.js Pages Router navigations, and observe buffered resource timing entries.

## 0.3.0

### Minor Changes

- ce732df: Remove custom metrics support and emit Web Vitals as log telemetry instead of OTLP metrics.

## 0.2.1

### Patch Changes

- 6054456: new ci

## 0.2.0

### Minor Changes

- 0c6248b: Use default collector url
