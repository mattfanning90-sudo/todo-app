# Architectural Backlog

_Created 2026-06-12 from a three-lens audit of the live codebase — **Staff/Principal Engineer**, **SRE**, and **SVPG Product**. Advisory; nothing here has been implemented._

This is the technical/architectural counterpart to `docs/product-backlog.md` (features). It captures debt, risks, and one-way-door decisions surfaced by reading the actual code — not a wishlist. Items are deduped across the three lenses; the **Lens** column shows who flagged it (multiple = independent convergence, a strong signal).

**Priority:** P0 critical/now · P1 high · P2 medium · P3 later/watch.
**Effort:** S (≤1 day) · M (a few days) · L (week+).
**Door:** ↔ reversible · ⛔ one-way (data migration / hard to undo — ADR it first).

> **Headline read.** For a solo-operator app this is unusually well-built on the mechanics (single-source-of-truth `server.js`, advisory-locked crons, graceful shutdown, fail-fast env guards, idempotent-DDL discipline, perf indexes added after profiling). It is **not over-engineered** — the right instinct at this scale. The debt that matters clusters in three places, and the three lenses converged on them independently:
> 1. **The iOS session/auth path** — fragile capture/replay, the likely root cause of B1, and a recurring silent-failure source.
> 2. **Observability + release safety** — prod failures are currently found by users, not signals; `main`→prod auto-deploy + crash-on-boot migrations = total blast radius on one bad merge.
> 3. **Business rules / validation that leaked into clients or got skipped** — recurrence lives only in web, task enums are unvalidated, the task-insert column list is copy-pasted four ways and already inconsistent.

---

## Progress (updated 2026-06-13)

The whole **P1 tier is shipped**; the detailed analysis below is preserved as the original audit record.

| # | Item | Status |
|---|---|---|
| **A1** | B1 iOS session | 🟡 **Monitoring** — stopped reproducing post-deploy; client 401-resilience + gated `B1_DEBUG` diagnostics shipped (#58), then stood down. See [[b1-ios-session-finding]]. |
| **A2** | Observability (Sentry + SLIs) | ✅ **Shipped & live** — server + web Sentry in prod, iOS wired (#59, #60, #61, #62). Pending operator: uptime monitor, spike protection, iOS `eas build`. |
| **A3** | API contract test | ✅ **Shipped** (#66) — `/api/tasks` + `/api/tasks/today` vs iOS types. |
| **A4** | Deploy safety | ✅ **Shipped** (#68 + #69) — migrations run in Railway's pre-deploy phase; prod serving process no longer migrates; `/readyz` readiness gate. Crash-loop path gone. |
| **A5** | Real-Postgres test layer | ✅ **Shipped** (#67) — now a **required** CI check; covers dashboard counts + jsonb wire-shape. |
| **A6–A11** | P2 (correctness & debt) | ⬜ Not started. |
| **A12–A16** | P3 (acceptable debt) | ⬜ Deferred, deliberately. |

Also: tech-debt issue **#64** tracks the `auto-archive` test flake + the `express`/`qs` audit.

---

## P0 — Critical (now)

| # | Item | Lens | Effort | Door |
|---|---|---|---|---|
| **A1** | **Fix B1 iOS session persistence + harden the auth path** | Product · Staff · SRE | S (fix) / M (with test) | ↔ |

**A1 — the whole iOS roadmap is gated on this.** Login succeeds, the next API call 401s ("Could not load boards"); web is unaffected.

- **Candidate root cause (from audit, verify before fixing):** `setMobileSessionHeader` (`server.js:345`) signs `req.sessionID` and emits the cookie *inside the `req.login` callback, before `req.session.save()` is guaranteed to have flushed to the store*. The cookie can reference a session the store hasn't committed yet. Web works because the browser only re-sends the cookie after the response fully flushes; iOS replays immediately and races the write. That matches the exact "login works, next call 401s" signature.
- **Fix:** move header/body emission inside an explicit `req.session.save(...)` callback on all three auth routes — login (`server.js:542`), signup (`517`), Google (`440`). Never hand a client a cookie for an unpersisted session.
- **Harden (same code path, near-zero marginal cost):**
  - Only clear the stored session on a 401 from auth/identity endpoints, not blanket — today any transient 401 nukes the cookie and logs the user fully out (`ios-app/src/api/client.ts:81–84`).
  - Make the iOS client distinguish "session expired" from "never authenticated" so the failure is observable, not silent.
  - **Secret boot-guard:** `setMobileSessionHeader` falls back to `'dev-secret-change-me'` (`server.js:347`). Refuse to boot prod if `SESSION_SECRET` is unset — otherwise every mobile session is forgeable. Catastrophic-if-true, cheap to prevent.
- **Lock it in:** add a session-persistence integration test (login → authed request round-trips the cookie) — the current pg-mem suite cannot catch this class.

> Ships as its own hotfix branch off `main`, per the B1 plan in `docs/product-backlog.md`.

> [!update] Investigation 2026-06-12 — candidate root cause **not confirmed**; partial fix shipped
> Branch `fix/b1-ios-session-diagnostics`. The audit's "emit-before-save" theory does **not hold**: passport 0.7's `req.login()` already calls `req.session.save()` *before* its callback ([`node_modules/passport/lib/sessionmanager.js:47`](../node_modules/passport/lib/sessionmanager.js)), so the signed cookie always references a persisted session. The existing `tests/ios-session.test.js` exercises the **real** `connect-pg-simple` store (pg-mem replaces only the `pg` driver) and passes 4/4 — the server replay flow is verified sound. B1 is **not reproducible at the server layer**; the cause is client/transport/environment.
> **Shipped (low-risk, evidence-backed):** (1) `ios-app/src/api/client.ts` no longer wipes the session on a blanket 401 — a single unrecognised 401 no longer hard-logs-out the user (the destructive half of the symptom); (2) gated server diagnostics (`B1_DEBUG=1`) that log PII-safe sid-prefix comparison on issuance and on every 401, to pinpoint whether the replayed cookie is rejected (signature/secret) vs accepted-but-no-passport-user; (3) warn-only `SESSION_SECRET` prod guard (no crash-loop). Both suites green (web 51, iOS 61).
> **Next:** set `B1_DEBUG=1` in Railway, reproduce on TestFlight, read `[b1-auth]` logs → that isolates the real root cause. Did **not** rewrite the auth save flow (would be a speculative change against passing tests).
>
> **Stood down 2026-06-12:** post-merge/deploy, B1 **no longer reproduces** (boards load on TestFlight). With the auth code verified sound, the deploy's process restart most likely cleared an environmental/state cause. Monitoring is staged (`B1_DEBUG=1` set, auto-arms on next deploy); the merged client-resilience fix de-fangs any recurrence. **Status: monitoring, not active.** Reopen if `[b1-auth]` logs a failure.

---

## P1 — High (foundations that unlock roadmap / close the incident-detection gap)

| # | Item | Lens | Effort | Door |
|---|---|---|---|---|
| **A2** | **Observability: error tracking + SLIs + alerts** | SRE | M | ↔ |
| **A3** | **API contract test (web ↔ iOS response shapes)** | Staff · Product | S–M | ↔ |
| **A4** | **Deploy safety: separate migrate-from-serve + readiness gate** | SRE | M | ↔ |
| **A5** | **Real-Postgres test layer for FILTER / date / jsonb queries** | Staff | M | ↔ |

- **A2 — single highest-leverage reliability move.** Observability today is `console.error` to stdout (`server.js:1214`). No aggregation, no alerting, no symptom monitor — which is *why the iOS 401 was found by a user, not a signal*. Wire in error tracking (Sentry or equiv) at the server error handler and the iOS `request()` catch. Define 2–3 SLIs that track real pain — login success rate, `/api/*` 5xx rate, p95 latency — each with one alert + runbook. Add `pool.totalCount/idleCount/waitingCount` (pg exposes these; `pool.max=20`, `database.js:18`) so connection-pool saturation is observable instead of an outage. Add top-level `unhandledRejection`/`uncaughtException` handlers (none today) so silent crashes leave a structured trace.
- **A3 — parity is the spine; make it a guarantee not a checklist.** Both clients consume raw `SELECT t.*` rows and iOS hand-mirrors the shape in `types.ts`. `/api/dashboard` already pays the "ship both legacy + mobile shapes" tax (`server.js:1153–1177`) — the contract is implicit and drifting. A single test asserting the JSON keys of `/api/tasks` and `/api/dashboard` against the iOS types makes a column rename break the build instead of TestFlight. **Do this before F1** adds a new endpoint both clients must consume identically. Don't reach for OpenAPI/codegen yet (YAGNI for two endpoints).
- **A4 — one bad merge = total outage with manual recovery.** `main`→prod auto-deploys, and a failed migration aborts boot → Railway crash-loops (`database.js:53`, `docs/operations.md:59`); staging was deleted. Separate "run migrations" from "serve traffic" so a migration failure is a visible deploy-step failure, not a serving crash-loop. Add a readiness check (distinct from liveness/`SELECT 1`) so a half-migrated instance isn't sent traffic. Boot the real image against an ephemeral prod-schema Postgres before promoting. Set a policy now: future index migrations use `CREATE INDEX CONCURRENTLY` (011/013 take write-blocking locks today — fine while `tasks` is small) and statement/lock timeouts so a blocked migration fails fast.
- **A5 — the fast suite is blind exactly where the logic is subtle.** `docs/testing.md:56` admits pg-mem ignores `COUNT(*) FILTER (WHERE …)` (returns unfiltered counts) and can't run the jsonb migration or the LATERAL digest join — so `/api/dashboard`, today-overdue logic, and the digest are effectively untested and pass green when wrong. Add a small docker-compose Postgres CI job for just the ~6 aggregate/date/jsonb queries pg-mem can't model. Keep pg-mem for the fast 90% — targeted, not a rewrite.

---

## P2 — Medium (correctness & cheap debt paydown)

| # | Item | Lens | Effort | Door |
|---|---|---|---|---|
| **A6** | **Validate `stage` / `priority` / `recurrence` enums on write** | Staff | S | ↔ |
| **A7** | **Move recurrence ("spawn on done") into the server** | Staff | M | ↔ |
| **A8** | **Extract a single task-row writer / column list** | Staff | S | ↔ |
| **A9** | **Digest: claim-before-send + surface SMTP failures** | SRE | S | ↔ |
| **A10** | **Backups: prefer Railway PITR, full-column capture, age alert, restore drill** | SRE | M | ↔ |
| **A11** | **F1 LLM harness: rate-limit / timeout / fallback-to-raw-task (reusable for F4)** | Product | M | ↔ |

- **A6** — `POST/PUT /api/tasks` accept arbitrary `stage`/`priority`/`recurrence` strings, no allowlist, no CHECK (`server.js:854–937`). `digest_frequency` *is* validated — so the omission is inconsistent, not principled. A bad `stage` silently breaks the `stage <> 'done'`/FILTER logic. Add a small shared validation map → 400. No Zod/Joi (YAGNI).
- **A7 — a live parity break.** The recurring-task rule lives entirely in the web client (`public/app.js:1912–1933`); iOS renders the 🔁 badge but has **no spawn logic** — marking a recurring task done on iOS silently drops the recurrence. Derive the next occurrence server-side on the `stage→done` transition (already detected at `server.js:947`); both clients inherit it.
- **A8** — the `INSERT INTO tasks (...)` column list + jsonb stringify is hand-copied in **four** places (create `server.js:882`, share `1016`, import `1093`, `backup.js:146`) and they already disagree — share/import drop `assigned_to_user_id`. One `insertTask(client, fields)` helper; decide deliberately whether share/import should carry the assignee.
- **A9** — `runDigests` sends the email *then* writes `digest_last_sent` (`server.js:1299`); a crash between them re-sends next run. SMTP failure returns `false` and is dropped with only a log line. Claim-first (mark before send, idempotent on a date bucket) and count SMTP failures as a signal.
- **A10** — backups are 7 daily full-table JSON dumps gated on `BACKUP_DATABASE_URL` (silently skip if unset, `backup.js:24`); `users` uses an explicit column list so new columns are silently excluded from backups; restore is a best-effort merge never tested against real data. Prefer Railway native PITR as system-of-record; if this stays primary, `SELECT *` the users dump, add a "backup age > 26h" alert, and do a real restore drill.
- **A11 — build it once, for two consumers.** F1 (AI Quick Capture) is the first hard external dependency (Anthropic). Enforce per-user rate-limit + timeout + **always fall back to creating the raw task** (the `chrono.parse` local path at `server.js:866` is the fallback floor) server-side, before the call — not "assumed" via prompt caps. Build it as a small internal LLM-call module so F4 (Smart Breakdown) reuses it nearly free. Don't generalize past two consumers. **This is most of F1's non-UI work — build it with F1, not as a fast-follow.**

---

## P3 — Later / watch (acceptable debt — mostly "leave it, deliberately")

| # | Item | Lens | Effort | Door |
|---|---|---|---|---|
| **A12** | **`due_date` TEXT → DATE migration** | Staff | M | ⛔ |
| **A13** | **Fix the migration-runner *docs* (it IS transactional)** | Staff | S | ↔ |
| **A14** | **`/api/reorder` O(n) UPDATE loop → batch / fractional positions** | Staff | S–M | ↔ |
| **A15** | **Extract email/HTML builders + a `tasks` module (name the seams)** | Staff | M | ↔ |
| **A16** | **TLS cert verification: decide accept-risk vs. block prod** | SRE | S | ↔ |

- **A12** — `due_date TEXT DEFAULT ''` (`004_tasks.sql:15`) forces a hand-written `due_date <> ''` guard on every date query (load-bearing comments at `server.js:846, 1129, 1224`); one forgotten guard shows dateless tasks as overdue, and it blocks real date indexing. Migrating to `DATE` is a **one-way door** (touches stored data, the drop-default-first ALTER footgun, and both clients' `'' vs null` expectations). ADR + spike against a prod snapshot before committing. Medium value — schedule, don't rush. If kept TEXT, at least centralize the overdue/today predicate in one SQL helper.
- **A13** — CLAUDE.md/`data-model.md` warn the runner is non-transactional, but `database.js:46–58` already checks out a single `client` and runs BEGIN/migration/COMMIT on it — the footgun applies to `pool.query` code, not this runner. Update the docs so future authors stop coding defensively around a fixed problem. Keep idempotent-DDL as belt-and-suspenders, not a stated necessity.
- **A14** — `/api/reorder` issues one UPDATE per task on every drag (`server.js:988`), rewriting every position; fine now, laggy/lock-contending on large boards. First thing to fix *if boards grow*: `UPDATE … FROM (VALUES …)` batch or fractional/gap positions. Don't pre-optimize import.
- **A15** — `server.js` (~1381) / `app.js` (~2404) are acceptable at this scale; resist a big restructure (over-engineering risk). Two cheap high-cohesion extractions that pay for themselves: email/HTML builders → `email.js`, and the task data-access+validation → a `tasks` module (pairs with A6/A8). Tie each to work already happening in that area.
- **A16** — missing `DB_CA_CERT` → `rejectUnauthorized: false` (TLS on, cert unverified) with only a startup WARN (`database.js:9`). Make it a deliberate accept-risk decision or block prod without a CA, rather than drift.

---

## Recommended sequence (against the product roadmap)

1. **A1 first, above everything** — it's an architectural session-persistence bug, not a cookie quirk, and it gates the *entire* iOS half of a parity-mandated product. Ship as a hotfix with a persistence test + the secret boot-guard (same code path).
2. **A2 next** — wire error tracking + a few SLIs/alerts. It's the precondition for everything else: it converts every other risk here from invisible-until-outage into observable. Closes the "iOS 401 went unnoticed" class.
3. **Before F1 ships**, lay the two foundations F1 actually needs: **A3** (contract test, so a new endpoint can't silently break one client) and **A11** (the LLM harness with hard rate-limit/timeout/raw-task fallback, so the headline feature degrades gracefully and can't run up an unbounded bill). **A4** (deploy safety) slots in here too — it's the difference between a bad merge being a deploy-step failure vs. a prod outage.
4. **A5–A10** are cheap correctness/debt items — batch them as filler between features; A7 (recurrence parity) and A6 (enum validation) are the highest-value of these.
5. **A12–A16 are acceptable debt** — defer deliberately. In particular, **F3 Energy Buckets should clear product discovery as a view-layer prototype before it earns a schema migration** (it reshapes the board model both clients render, straight into the ALTER footgun).

---

_Provenance: full per-lens findings (Staff-Eng 10 items, SRE 10 items, Product 8 items) were produced by the role-agent suite on 2026-06-12 and synthesized here. Re-run by launching the staff-engineer, sre, and svpg-product agents against this repo._
