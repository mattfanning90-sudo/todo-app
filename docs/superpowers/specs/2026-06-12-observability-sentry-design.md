# Observability (A2) — Sentry + golden signals — Design

_Created 2026-06-12. Implements **A2** from `docs/architectural-backlog.md` (the highest-leverage reliability item). Motivated by B1: a prod failure that went unnoticed until a user hit it, because there is no error tracking, SLIs, or alerting today._

> **Technical claims verified 2026-06-12** via a web-search-backed adversarial workflow against current Sentry/Expo/Railway docs. Key corrections folded in below: Sentry JS SDK is **v10** (not v9); `@sentry/react-native` must be **v8.x** for Expo SDK 55; `setupExpressErrorHandler` is **5xx-only** by default; Sentry free tier gives **unlimited projects + 1 uptime monitor** with **org-wide shared** quotas.

## Problem

Observability is `console.error` to stdout plus 8-byte request IDs ([server.js:45](../../server.js#L45), [:1274](../../server.js#L1274)) and a `SELECT 1` `/healthz`. There is no error aggregation, no client-side error capture (web or iOS), no SLIs, and no alerting. Prod breakage is discovered by users, not signals.

## Scope

**In (chosen: A + B):**
- Error capture, grouping, and **alerting** on all three surfaces: Node server, web browser SPA, iOS app.
- Basic SLIs / golden signals: error rate, p95 latency, throughput, login success rate, pool saturation.
- `unhandledRejection` / `uncaughtException` safety.

**Deferred to backlog ("C, for scale"):** dashboards, formal SLO targets / error budgets, written alert runbooks. _(Add a `B-deferred` note under A2 in the architectural backlog.)_

**Tool:** Sentry, free ("Developer") tier. Chosen over a build-our-own monitor (which would be blind to its own outages and would owe us iOS symbolication) and over log-scraping (no client capture). TestFlight / App Store Connect remains as a free **native**-crash backstop for iOS.

## Architecture — three surfaces, three Sentry projects

Three error surfaces, each its own Sentry project (clean grouping; client DSNs are public by design):

| Surface | SDK | Captures | Key constraint |
|---|---|---|---|
| Server (`server.js`) | `@sentry/node` | API exceptions, unhandled rejections, p95/throughput/error-rate, pool saturation | **No-op in `NODE_ENV=test`** |
| Web (`public/app.js`) | `@sentry/browser` | Browser JS errors | CSP `connect-src` + CSP-safe SDK load |
| iOS (`ios-app/`) | `@sentry/react-native` | JS errors + native crashes (symbolicated) | native dep → `expo install`, EAS source maps, prove-it-boots |

**Master switch:** every SDK initialises only when its DSN env var is present **and** `NODE_ENV !== 'test'`. No DSN (local dev, CI) → inert. The existing 51 web + 61 iOS tests stay green and send nothing.

---

## Surface 1 — Server (`@sentry/node`)

**Dependency:** `@sentry/node@^10` (current major is **v10**, 10.57.x — *not* v9; do **not** also install `@sentry/tracing`, deleted in v8). Plain `npm install` (server-side; the `expo install` rule is iOS-only).

**Init (CommonJS):** new `instrument.js`, required as line 1 of `server.js` **before `require('express')`** — this ordering is load-bearing: the SDK is OpenTelemetry-based and silently fails to auto-instrument if init runs after express/db are imported.

```js
// instrument.js
const Sentry = require('@sentry/node');
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',  // SHA only present on GitHub-triggered deploys
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,                          // docs quickstart sets true — we keep it false
    beforeSend(event) { /* strip cookie / authorization headers */ return event; },
  });
}
module.exports = Sentry;
```
No `--import` flag needed (that's ESM-only); `require('./instrument')` is correct for CommonJS.

**Wiring in `server.js`:**
- `require('./instrument')` as the very first line, before `const express = require(...)`.
- Middleware after the request-ID one ([:45](../../server.js#L45)) sets Sentry scope tag `request_id = req.id` for log↔Sentry correlation.
- `Sentry.setupExpressErrorHandler(app)` after routes, before the existing **terminal** handler at [:1274](../../server.js#L1274) (ours ends the response and never calls `next`, so it must come *after* Sentry's). Sentry captures, then `next(err)` falls through to ours — **response shape `{ error, requestId }` is unchanged** (preserves the future A3 contract).
- **5xx-only by default:** `setupExpressErrorHandler` only sends errors whose response status is `>= 500`. This is *desirable here* — 401s/4xx (incl. the B1-class auth states) pass through to our handler but don't page us. No `shouldHandleError` override needed.

**SLIs (kept off Sentry's event quota where it'd be wasteful — see free-tier note):**
- Error rate / p95 / throughput → Sentry Performance (`tracesSampleRate`), automatic.
- **Login success rate** + **pool saturation** → lightweight **in-process counters** (success/fail tallies; `pool.totalCount/idleCount/waitingCount`) exposed on a **gated `/metrics`** endpoint (RESTORE_SECRET-style auth), with pool counts also added to `/healthz`. We deliberately do **not** emit a Sentry event per failed login — brute-force traffic would burn the org-wide 5k-error/mo quota. Real auth *exceptions* (500s) are still captured by Sentry.
- `unhandledRejection` / `uncaughtException` → captured by the Node SDK's default integrations (`onUncaughtException`/`onUnhandledRejection`), which drain/flush before the process exits. Keep the existing graceful-shutdown path; do not override `onFatalError` (that would disable the default drain).

**Env:** `SENTRY_DSN` (activates), `SENTRY_TRACES_SAMPLE_RATE` (optional, default 0.1).

---

## Surface 2 — Web browser (`@sentry/browser` + CSP)

`public/app.js` is static vanilla JS, no build step, strict Helmet CSP.

- **SDK load (CSP-safe):** vendor the **errors-only static bundle** `bundle.min.js` (Sentry JS **v10.x**, from `browser.sentry-cdn.com/<ver>/bundle.min.js`, with its published SRI hash) into `public/vendor/sentry.min.js`, load via `<script src integrity=…>` — `script-src 'self'` already allows it. **Not** the Loader Script (`js.sentry-cdn.com`): it's a stub that runtime-fetches the real SDK and would break under `script-src 'self'`. Errors-only bundle (not `bundle.tracing`/`replay`) so no tracing/worker code ships. Global is `window.Sentry`.
- **DSN to static JS (CSP-safe):** new route `GET /config.js` emits `window.__APP_CONFIG__ = { sentryDsn, environment, release }`, loaded via `<script src="/config.js">` before `app.js`.
- **CSP change (the blast radius):** add the project's Sentry **ingest host, read from the DSN** (`o<org>.ingest.<region>.sentry.io` — region `us`/`de`; don't hardcode, derive from the DSN) to Helmet CSP `connect-src`. This is why web is its own PR. (Alternative considered: a same-origin `tunnel` proxy route to avoid the CSP change — rejected as more server code for no real gain here.)
- **Init (in `app.js`, early):** `if (window.__APP_CONFIG__?.sentryDsn) Sentry.init({ dsn, environment, release, sendDefaultPii: false, tracesSampleRate: 0 })`. The default `GlobalHandlers` integration auto-captures `window.onerror` + `unhandledrejection`. Inert without a DSN. (No Session Replay → no `worker-src`/`blob:` CSP concern.)

**Env:** `SENTRY_BROWSER_DSN` (read by `/config.js`). Dep: vendored `@sentry/browser` v10 errors-only bundle under `public/vendor/`.

---

## Surface 3 — iOS (`@sentry/react-native`)

Highest-risk PR (native dep + real build).

- **Install:** `npx expo install @sentry/react-native` — **never `npm install`** (the build-16 lesson). For Expo SDK 55 / RN 0.83 this must resolve **v8.x** (≥ 8.8.0 has the SDK-55 Metro import fix; latest 8.14.0). **Do not pin v7** — v8 carries the fix for the SDK-55 / Gradle-9 EAS build failure (expo#42494). Let `expo install` pick the version.
- **Config plugin:** add `@sentry/react-native/expo` to `app.json` `plugins` (`{ organization, project }`). Put the auth token in the **env var, never** in plugin config.
- **`metro.config.js` (REQUIRED, easy to miss):** replace the export with `getSentryExpoConfig(__dirname)` from `@sentry/react-native/metro` — this assigns Debug IDs to bundles/source maps. **Without it, source maps don't symbolicate** even though upload "succeeds."
- **Init:** `Sentry.init({ dsn })` + `Sentry.wrap(App)`. DSN via `process.env.EXPO_PUBLIC_SENTRY_DSN` (inlined by Metro at build time) with `Constants.expoConfig?.extra` fallback. Inert without a DSN.
- **Capture, tuned post-B1:** native crashes automatic; JS errors automatic; in `client.ts`, `Sentry.captureException` for network failures + **non-401** `ApiError`s; **401s → breadcrumbs, not errors** (expected/survivable after the B1 resilience fix — must not page). `tracesSampleRate: 0` (errors only).
- **Symbolication:** Expo plugin + the metro change upload source maps during `eas build` when `SENTRY_AUTH_TOKEN` is present — set it as an **EAS env var with `secret`/sensitive visibility** (`eas env:create --name SENTRY_AUTH_TOKEN --visibility secret`), never in `app.json`/git.
- **Tests stay green:** `jest.mock('@sentry/react-native')` in `ios-app/jest.setup.js` (the package ships an auto-mock; provide a factory with `wrap: c => c` if needed) **and** add `@sentry/react-native` to `transformIgnorePatterns` so jest-expo transforms it (else ESM "unexpected token"). `Sentry.wrap` must not disturb `boot.test.tsx`.
- **Build-image caveat:** v8 requires **Xcode 16.4+** on the EAS build image — verify the build profile. (Android-only note: disable Sentry AGP `autoInstallation` to avoid a startup `IllegalStateException` — not iOS-blocking but worth setting.)
- **Pre-build gate (CLAUDE.md):** `npx expo-doctor` + `npm test` (incl. `nav-version-alignment` + `boot.test`) + simulator boot before `eas build`.

**Env:** `EXPO_PUBLIC_SENTRY_DSN` (+ `extra` fallback), `SENTRY_AUTH_TOKEN` (EAS secret).

---

## Alerting (email default)

Per Sentry project:
- **New / regressed issue → immediate email** (the literal B1-catcher).
- **Error spike** (> N in M min) → email.
- **Availability** (Sentry can't infer a no-events outage from errors): use **Sentry's built-in Uptime Monitor** (the free tier includes **1**) pointed at `/healthz` — it actively probes the URL and alerts on failure. This is better than the originally-sketched GitHub-Actions ping, which the verification found unreliable for alerting (failure emails are per-user, tied to whoever last edited the cron, and scheduled workflows auto-disable after 60 days of repo inactivity). If a second uptime check is ever needed, GHA becomes the fallback with an explicit notify step.
- **Spike protection / rate limits** on each project — quotas are **org-wide and shared**, so a noisy iOS release could otherwise burn the whole error budget and blind the server project.

Slack is an optional toggle (Sentry↔Slack integration) — not required for v1.

---

## Testing

- **Server:** Sentry inert in `NODE_ENV=test` → 51 web tests untouched. Add: error handler still returns `{ error, requestId }`; no init without DSN.
- **Web:** test that CSP `connect-src` includes the Sentry host and `GET /config.js` serves the DSN config.
- **iOS:** `@sentry/react-native` mocked in `jest.setup.js` → 61 tests stay green; test that `client.ts` captures non-401 errors and treats 401 as a breadcrumb.

---

## Staged rollout (each lands + is verified before the next; `main` is prod)

1. **PR1 — Server** (`@sentry/node@^10` + instrument.js + `/metrics` SLIs + pool/healthz). Lowest risk, highest value, catches the B1 class. No client changes.
2. **PR2 — Web browser** (`@sentry/browser` v10 errors bundle + `/config.js` + CSP `connect-src`). Self-contained; CSP is the only blast radius.
3. **PR3 — iOS** (`@sentry/react-native` v8 + metro config + EAS source maps). Gated by expo-doctor + boot test + real `eas build`.

(The Sentry uptime monitor on `/healthz` is dashboard config, set up alongside PR1.)

---

## Prerequisites (account/env — owner does these; code is mine)

1. Create Sentry org + 3 projects (platforms: node, browser, react-native) → 3 DSNs. _(Projects are unlimited on free; the binding limit is the org-wide quota.)_
2. Railway env: `SENTRY_DSN`, `SENTRY_BROWSER_DSN` (+ optional `SENTRY_TRACES_SAMPLE_RATE`). _(Railway auto-injects `RAILWAY_GIT_COMMIT_SHA` for GitHub deploys — no need to set it.)_
3. iOS: `EXPO_PUBLIC_SENTRY_DSN`; `SENTRY_AUTH_TOKEN` as an EAS secret (`--visibility secret`).
4. Configure alert rules → email; set the **uptime monitor** on `/healthz`; enable **spike protection** per project.

## Free tier (Developer plan, verified 2026-06-12)

5,000 errors/mo · 5,000,000 spans/mo · 50 replays/mo · **unlimited projects** · 30-day retention · **1 user**. Quotas are **org-wide/shared** across all projects, and on the free plan over-quota events are **dropped** (no overage billing). Implications baked into the design: low `tracesSampleRate` (0.1 server, 0 clients), no per-login Sentry events, per-project spike protection.

## Risks

- **iOS native dep** (build-16 class) — mitigated by `expo install` (resolves v8.x) + the `metro.config.js` change + the pre-build gate.
- **CSP typo** breaks the web SPA silently — mitigated by isolating PR2 + a CSP test + deriving the ingest host from the DSN.
- **Free-tier quota exhaustion** (org-wide, drop-on-exhaust) — mitigated by sampling + spike protection.
- **PII leakage** — `sendDefaultPii: false` + `beforeSend` header scrub + no request bodies.
- **Init-order trap** — `require('./instrument')` must precede `require('express')` or auto-instrumentation silently no-ops.

## Out of scope

Dashboards, formal SLOs/error budgets, runbooks (backlog); replacing `console.error` logging; web-app performance tracing; APM beyond Sentry's defaults.
