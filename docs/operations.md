# Operations

## Hosting

`main` auto-deploys to Railway. Merging a PR ships immediately — no separate deploy step. Treat every merge with the caution that implies.

### Deploy lifecycle (`railway.json`)

Config-as-code in `railway.json` (overrides the dashboard):

- **`preDeployCommand: node scripts/migrate.js`** — migrations run in a **release phase before the new container serves**. If a migration fails, the deploy fails and the **previous deployment keeps serving** (no crash-loop, no downtime). `scripts/migrate.js` calls `database.js#init()` and exits non-zero on failure.
- **`healthcheckPath: /readyz`** — Railway only promotes the new deployment once `/readyz` returns 200. `/readyz` (readiness, distinct from `/healthz` liveness) checks the DB is reachable **and**, in prod, that `_migrations` count ≥ the shipped migration files — so a half-migrated instance is never routed traffic.

In **production the serving process does not migrate at all** — only the pre-deploy phase does, so a bad migration can never crash-loop the server; `/readyz` is the authoritative gate (503s while migrations are pending, so Railway won't promote a half-migrated instance). Locally (`NODE_ENV` ≠ `production`) the server still auto-migrates on boot for convenience.

CI catches most bad migrations *before* merge: the **`realpg`** job (a required check) runs every migration against a fresh Postgres.

## Required env vars in production

Server refuses to boot if any are missing or `SESSION_SECRET` is too short:

| Var | Why |
|---|---|
| `SESSION_SECRET` | Signs session cookies. Must be ≥ 32 chars. Generate with `openssl rand -hex 32`. |
| `APP_URL` | Public URL of the app; used in digest email links. |
| `DATABASE_URL` | Primary Postgres connection string. |
| `NODE_ENV` | Must be `production` so cookie `secure` flag is set and the fail-fast guards trip. |

## Optional env vars

| Var | Effect when set |
|---|---|
| `DB_CA_CERT` | Enables `rejectUnauthorized: true` against the primary DB. Without it, TLS is on but cert isn't verified; a startup `WARN` is logged. |
| `PG_POOL_MAX` | Pool size, defaults to 20. |
| `BACKUP_DATABASE_URL` | Enables the daily snapshot job. Without this, backups are skipped. |
| `BACKUP_DB_CA_CERT`, `BACKUP_PG_POOL_MAX` | Same pattern for the backup pool. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALLBACK_URL` | Enable Google OAuth on web. Web local auth still works without these. |
| `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` | Additional audiences for `/auth/google/mobile`. |
| `SMTP_USER`, `SMTP_PASS` | Enable digest emails (Gmail SMTP). Without them digest cron runs but `sendEmail` is a no-op. |
| `RESTORE_SECRET` | Required to call `/api/admin/backup`, `/api/admin/restore/:id`, and the SLI endpoint `/metrics`. |
| `SENTRY_DSN`, `SENTRY_BROWSER_DSN` | Activate server / web error tracking (see Observability). Unset → inert. |
| `SENTRY_TRACES_SAMPLE_RATE` | Server performance sampling, default `0.1`. |
| `DB_SSL` | Set to `disable` to connect to a non-SSL Postgres (local dev / CI real-PG tests). **Ignored in production** (gated on `NODE_ENV !== 'production'`). |

## Health check

`GET /healthz` (liveness) runs `SELECT 1` and returns `{"ok": true, "pool": {total, idle, waiting}}` on success, `503` with `{"ok": false, "error": "db_unreachable"}` on failure. `GET /readyz` (readiness — Railway's `healthcheckPath`) additionally asserts migrations are applied in prod (see Deploy lifecycle); a half-migrated instance 503s and isn't promoted.

## Observability (Sentry) — A2

Error tracking + SLIs across all three surfaces. Org `mf-ventures` (**EU/DE** region). Each surface is **inert without its DSN**, so nothing is sent from local/CI.

| Surface | DSN env var | Where set | Notes |
|---|---|---|---|
| Server (`@sentry/node`) | `SENTRY_DSN` | Railway | 5xx/unhandled capture; p95/throughput via Performance (`SENTRY_TRACES_SAMPLE_RATE`, default 0.1). Init in `instrument.js` (required before `express`). `beforeSend` scrubs request body/cookies/query/secret headers. |
| Web (`@sentry/browser`) | `SENTRY_BROWSER_DSN` | Railway | Served to the SPA via `GET /config.js`; CSP `connect-src` auto-derives the ingest host from the DSN. Vendored bundle in `public/vendor/sentry.min.js`. |
| iOS (`@sentry/react-native`) | `EXPO_PUBLIC_SENTRY_DSN` | `ios-app/eas.json` | Build-time inline; see `docs/ios-app.md` (incl. the `promise` dep gotcha + symbolication). |

- **SLIs:** login success/fail + pool saturation counters on a gated `GET /metrics` (`RESTORE_SECRET`); latency/throughput/error-rate from Sentry Performance.
- **Alerting:** Sentry issue-alert email per project; a Sentry **uptime monitor** on `/healthz` (free tier: 1) catches total outages; per-project **spike protection** guards the org-wide quota (5k errors / 5M spans / mo, shared).
- Free tier = 1 user, unlimited projects, 30-day retention. Org auth tokens can't list/manage projects via API/CLI (403) — DSNs come from the UI.

## Graceful shutdown

On `SIGTERM` / `SIGINT` the server stops accepting connections, drains in-flight requests, then closes both Postgres pools. 10 s hard cap before `process.exit(1)`.

## Request tracing

Every request gets an 8-byte hex ID via the first middleware. Echoed via `X-Request-Id` header, included in error responses (`requestId: "..."`), and prefixed to every error log line.

## Distributed cron

Four scheduled jobs, each wrapped in `pg_advisory_lock` (via `backup.js#withLeaderLock`) so they run on exactly one instance in horizontally-scaled deploys:

| Cron | Schedule | Lock key |
|---|---|---|
| Backup snapshot | `0 2 * * *` (2 am) | `73810421` |
| Email digest | `0 * * * *` (hourly) | `73810422` |
| Notification TTL cleanup | `0 3 * * *` (3 am) | `73810423` |
| Auto-archive done tasks | `0 4 * * *` (4 am) | `73810424` |
| Boot-time backup | once on startup, best-effort | `73810420` |

Auto-archive flips `archived = true` on any task with `stage = 'done'` whose `completed_at` is older than `server.js#AUTO_ARCHIVE_AFTER_MS` (24 h). Re-opening a task clears `completed_at`, so the timer resets naturally if a user moves it out of done.

## Migrations

`database.js#init()` runs every `migrations/*.sql` not yet recorded in `_migrations`, in numeric order. It now runs in Railway's **pre-deploy phase** (`scripts/migrate.js`, see Deploy lifecycle): a failing migration **fails the deploy and leaves the previous deployment serving** — no more crash-loop. Each migration runs with `lock_timeout = 10s` so one that can't take its lock (the old instance is still serving during pre-deploy) aborts fast instead of hanging the deploy. There is deliberately **no** `statement_timeout` — a legitimately long table rewrite shouldn't be aborted mid-flight.

### Rules

- One numbered file per change; never edit a migration after it's been recorded. **Append-only — never delete or rename a `.sql` file:** `/readyz`'s prod gate compares `_migrations` row count against the shipped file count, so removing a file would lower the expected count and could read green against a DB that's actually missing a different migration.
- If a migration was rolled back (so it's NOT in `_migrations`), editing the file in place is fine and intentional — the runner will retry on the next deploy. This was the recovery path for the original 012 crash.
- Idempotent DDL (`IF NOT EXISTS`) only.
- **Long lock waits:** if a migration legitimately needs to wait longer than 10s for its lock, raise it in the file itself (`SET LOCAL lock_timeout = '…'` after the implicit BEGIN).
- **`CREATE INDEX CONCURRENTLY` is NOT yet supported** — the runner wraps every migration in a transaction, and CONCURRENTLY can't run inside one. Adding a non-transactional migration path (e.g. a `*.notx.sql` convention) is future work; until then, index migrations take a brief write-blocking lock (fine while `tasks` is small).

### `ALTER COLUMN ... TYPE` gotcha

Postgres validates the column's existing `DEFAULT` against the new type separately from the row data. If incompatible, the migration fails with:

```
default for column "<col>" cannot be cast automatically to type <new_type>
```

Drop the default, change the type, set the new default — in one statement so the rewrite holds `ACCESS EXCLUSIVE` exactly once:

```sql
ALTER TABLE t
  ALTER COLUMN c DROP DEFAULT,
  ALTER COLUMN c TYPE jsonb USING COALESCE(NULLIF(c, '')::jsonb, '[]'::jsonb),
  ALTER COLUMN c SET DEFAULT '[]'::jsonb;
```

This bit production in commit `998a6ac` (hotfix for `c41511d` / PR #7). Apply preemptively for any future `TEXT → jsonb`, `INTEGER → BIGINT`, etc.

## Roll-out style

For changes with wider blast radius (env-var prereqs, CSP changes, destructive migrations), prefer staged PRs: A → B → C against `main`, each landing before the next is opened. Use draft PRs while the previous slice is being deployed and verified.
