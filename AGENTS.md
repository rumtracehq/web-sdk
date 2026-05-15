# Agent Notes

## Commands
- Install with `npm ci`; CI uses Node.js 24 and `package-lock.json` lockfile v3.
- CI verification order is `npm run typecheck`, `npm test`, `npm run build`, then `npm run size`.
- Run one Vitest file with `npm test -- test/start.test.ts`; add `-t "test name"` after the file for a focused test name.
- `npm run size` checks `.size-limit.cjs` against files in `dist/`, so run `npm run build` first.
- There is no lint or formatter script in `package.json`; do not invent one.

## Package Shape
- This is a single npm package, `@rumtrace/web-sdk`, with ESM source (`"type": "module"`) and tsup output in `dist/` for both ESM and CJS.
- Public entrypoints are `src/index.ts`, `src/react-router.ts`, `src/next-pages-router.ts`, and `src/next-app-router.ts`; keep `package.json` `exports` and the `build` script entry list in sync when changing them.
- `src/types.ts` is the public API contract; `src/version.ts` reads `package.json` at build time for `SDK_VERSION`.
- Optional React, Next, and React Router integrations are peer dependencies; avoid making them required from the main entrypoint.

## Runtime Architecture
- `src/index.ts` owns `start()`, singleton duplicate-start behavior, no-op fallbacks, session/user/attribute stores, and instrumentation cleanup wiring.
- OpenTelemetry setup lives in `src/otel/setup.ts`; auto-instrumentations are in `src/instrumentation/otel.ts`; SDK-owned browser instrumentation is in `src/instrumentation/custom.ts`.
- HTTP export and offline replay are in `src/pipeline/exporter.ts` and `src/pipeline/offline-queue.ts`; batches are OTLP protobuf bytes from `src/otlp/encode.ts`.
- Collector URLs must be HTTPS in normalized options; network telemetry intentionally skips the collector URL and adds `x-rum-skip` on exporter fetches.

## Tests
- Vitest uses `happy-dom`, global test APIs, and `restoreMocks`; browser globals are usually stubbed in individual tests with `vi.stubGlobal` or property overrides.
- IndexedDB behavior is covered with `fake-indexeddb/auto` in `test/offline-queue.test.ts`; other exporter tests often force the memory queue with `vi.stubGlobal('indexedDB', undefined)`.
- Property-style tests use fast-check and begin with comments like `// Feature: rum-web-sdk, Property 33: ...`; preserve that format for new property tests.

## Releases
- User-facing changes should include a Changesets file from `npm run changeset`; release PRs and npm publishing are automated by `.github/workflows/publish.yml`.
