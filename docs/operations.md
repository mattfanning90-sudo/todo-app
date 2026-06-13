# Operations

## Hosting

`main` auto-deploys to Railway. Merging a PR ships immediately — no separate deploy step. Treat every merge with the caution that implies.

### Deploy lifecycle (`railway.json`)

Config-as-code in `railway.json` (overrides the dashboard):

- **`preDeployCommand: node scripts/migrate.js`** — migrations run in a **release phase before the new container serves**. If a migration fails, the deploy fails and the **previous deployment keeps serving** (no crash-loop, no downtime). `scripts/migrate.js` calls `database.js#init()` and exits non-zero on failure.
- **`healthcheckPath: /readyz`** — Railway only promotes the new deployment once `/readyz` returns 200. `/readyz` (readiness, distinct from `/healthz` liveness) checks the DB is reachable **and**, in prod, that `_migrations` count ≥ the shipped migration files — so a half-migrated instance is never routed traffic.

> Transitional (A4a): `server.js` boot **also** still runs migrations as an idempotent fallback. A follow-up (A4b) removes the boot path once the pre-deploy phase is confirmed in a real deploy.

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
| `RESTORE_SECRET` | Required to call `/api/admin/backup`, `/api/admin/restore/:id`. |

## Health check

`GET /healthz` runs `SELECT 1` and returns `{"ok": true}` on success, `503` with `{"ok": false, "error": "db_unreachable"}` on failure. Point your load balancer / orchestrator at it.

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

`database.js#init()` runs every `migrations/*.sql` not yet recorded in `_migrations`, in numeric order. It now runs in Railway's **pre-deploy phase** (`scripts/migrate.js`, see Deploy lifecycle): a failing migration **fails the deploy and leaves the previous deployment serving** — no more crash-loop. Each migration runs with `lock_timeout = 10s` + `statement_timeout = 120s`, so one that can't take its lock (or runs away) aborts fast instead of hanging the deploy.

### Rules

- One numbered file per change; never edit a migration after it's been recorded.
- If a migration was rolled back (so it's NOT in `_migrations`), editing the file in place is fine and intentional — the runner will retry on the next deploy. This was the recovery path for the original 012 crash.
- Idempotent DDL (`IF NOT EXISTS`) only.
- **Index migrations on a hot table:** plain `CREATE INDEX` takes a write-blocking lock and will trip `lock_timeout` under load. Use `CREATE INDEX CONCURRENTLY` — but it **can't run inside the runner's transaction**, so it needs its own non-transactional migration step (don't bundle it with other DDL).

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
