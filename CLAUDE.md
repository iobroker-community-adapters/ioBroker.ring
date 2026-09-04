# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.ring` is an ioBroker adapter for **Ring** doorbells, cameras and intercoms. It talks to the Ring cloud through [`ring-client-api`](https://github.com/dgreif/ring), mirrors every device into the ioBroker object tree, reacts to motion/doorbell push events, and can take snapshots, HD snapshots and livestream recordings — writing the resulting files to disk and exposing them via the Vis file server.

TypeScript (CommonJS output). Sources live in `src/`, the runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). **`build/` is gitignored** — always run the build before starting the adapter or the integration tests.

## Commands

```bash
npm run build                         # tsc -p tsconfig.build.json  -> build/
npm run watch                         # same in watch mode
npm run check                         # type check only (tsconfig.json, noEmit)
npm run lint                          # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix # autofix + prettier formatting

npm run test:package                  # validates package.json / io-package.json / admin JSON (fast)
npm run test:unit                     # @iobroker/testing unit tests
npm run test:integration              # starts a real js-controller + adapter instance
npm run translate                     # translate-adapter -b admin/i18n/en.json
npm run release-patch                 # moves the README changelog into io-package news, builds, tags
```

There is deliberately **no `prepare` script** — `npm ci` / `npm install` does not build. Run `npm run build` yourself after a fresh checkout. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub.

The integration test aborts if a js-controller is already running on the machine ("JS-Controller is already running!"). That is not a failure of your change.

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | `RingAdapter extends Adapter` — lifecycle, state plumbing, sun times, cron registry |
| `src/lib/ringApiClient.ts` | `RingApiClient` — owns the `RingApi` instance, locations, refresh cycle |
| `src/lib/ownRingDevice.ts` | abstract base, and `evaluateKind()` which maps a Ring `deviceType` to an object-ID prefix |
| `src/lib/ownRingCamera.ts` | the big one: every camera/doorbell feature (events, snapshots, livestream, light, siren) |
| `src/lib/ownRingIntercom.ts` | intercom handsets (ding event, unlock) |
| `src/lib/ownRingLocation.ts` | a Ring location and its alarm mode |
| `src/lib/services/` | file paths, image processing (sharp/ffmpeg), text formatting, event throttling |
| `src/lib/constants.ts` | every `ioBroker.StateCommon` definition and state-id constant |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `admin/jsonConfig.json` | the configuration dialog |
| `admin/tab_m.html` + `tab_m.js` + `words.js` | the classic materialize **tab** (not the config dialog) |

`src/lib/adapter-config.d.ts` is hand-maintained. It must stay in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json` — nothing generates it, and a key that is missing from `jsonConfig.json` is silently dropped from `native` the first time a user saves the config.

### `ring-client-api` is ESM only

The package has `"type": "module"`, this build is CommonJS. That has three consequences you must respect:

- **Types** are imported with `import type { X } from 'ring-client-api' with { 'resolution-mode': 'import' };`. Without the attribute `tsc` reports TS1541.
- **Values** must be loaded with `await import('ring-client-api')`. There is exactly one such place: `RingApiClient.getApi()`. Never turn it into a static import — that emits `require()` and dies with `ERR_REQUIRE_ESM` on Node.js before 22.12.
- `module`/`moduleResolution` are `Node16` for that reason. Switching them to `commonjs` would silently rewrite the dynamic `import()` back into `require()`.
- Only the subpaths the package actually exports resolve: `ring-client-api`, `.../rest-client`, `.../streaming/streaming-session`, `.../ffmpeg`, `.../util`. `ring-client-api/lib/...` does not.

`OwnRingDevice.evaluateKind()` spells the device kinds out as string literals instead of using `RingCameraKind` / `RingDeviceType`, because it is static and synchronous and cannot await the module. The literals are the identical values.

### Object IDs

`OwnRingDevice` builds every id as `` `${kind}_${shortId}` ``, where `kind` comes from `evaluateKind()` and `shortId` is the numeric Ring device id. **Changing the mapping of a device type moves the whole object tree of that device**, and nothing cleans up the old branch — mention it in the changelog whenever you add a device kind.

The same `kind` fills the `%k` placeholder in the configurable snapshot/livestream paths (`src/lib/services/file-service.ts`).

All camera features are driven by the Ring API's capability flags (`hasSiren`, `hasLight`) and by push events, **not** by `kind`. A device that lands under `unknown_<id>` still works; it just has an unstable id and spams the log.

### Timers

Never use the global `setTimeout` / `setInterval` in the backend. Use `this.setTimeout()` / `this.setInterval()` / `this.delay()` of adapter-core (typed `ioBroker.Timeout` / `ioBroker.Interval`) so that js-controller stops them on unload. `EventBlocker` takes the adapter for exactly this reason.

`node-schedule` jobs are *not* managed by adapter-core. Register every job with `RingAdapter.registerScheduledJob()` so `onUnload()` cancels it — in compact mode they would otherwise outlive the instance. Job names must contain the namespace, node-schedule keeps one process-wide registry.

### Logging

`OwnRingDevice` exposes `error` / `warn` / `info` / `debug` / `silly` helpers that prefix the device id and description.

**Never dump a `RingCamera` / `RingIntercom` object into the log.** It carries the `RingRestClient`, whose `refreshToken` is a long-lived credential granting full account access — and the "not yet supported" message asks users to paste the log into a public GitHub issue. `evaluateKind()`'s fallback logs a whitelist of fields for that reason. `device.data` is not a safe alternative either: `CameraData` contains `address`, `latitude` and `longitude`.

## Conventions

- Formatting is `@iobroker/eslint-config` (4 spaces, single quotes, prettier). Only ever run `npx eslint -c eslint.config.mjs --fix`; a separately invoked prettier with another config produces endless diffs.
- Explicit return types and member accessibility are expected throughout.
- Changelog entries go under `### **WORK IN PROGRESS**` in `README.md`; `io-package.json` `common.news` is written by the release script, never by hand.
