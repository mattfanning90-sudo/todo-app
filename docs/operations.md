# Operations

## Hosting

`main` auto-deploys to Railway. Merging a PR ships immediately — no separate deploy step. Treat every merge with the caution that implies.

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

Three scheduled jobs, each wrapped in `pg_advisory_lock` (via `backup.js#withLeaderLock`) so they run on exactly one instance in horizontally-scaled deploys:

| Cron | Schedule | Lock key |
|---|---|---|
| Backup snapshot | `0 2 * * *` (2 am) | `73810421` |
| Email digest | `0 * * * *` (hourly) | `73810422` |
| Notification TTL cleanup | `0 3 * * *` (3 am) | `73810423` |
| Boot-time backup | once on startup, best-effort | `73810420` |

## Migrations

`database.js#init()` runs every `migrations/*.sql` not yet recorded in `_migrations`, in numeric order. A failing migration aborts boot and exits the process — Railway crash-loops the container until it's fixed.

### Rules

- One numbered file per change; never edit a migration after it's been recorded.
- If a migration was rolled back (so it's NOT in `_migrations`), editing the file in place is fine and intentional — the runner will retry on next boot. This was the recovery path for the original 012 crash.
- Idempotent DDL (`IF NOT EXISTS`) only; the runner's `BEGIN`/`COMMIT` go through `pool.query` and may not share a connection with the migration body. Treat each migration as if it might run outside a transaction.

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
