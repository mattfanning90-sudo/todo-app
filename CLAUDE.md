# Notes for Claude

Short, durable guidance for working on this repo. Update when a class of
mistake recurs; keep it scannable.

## Deploys

- `main` auto-deploys to Railway. Merging a PR ships immediately — no
  separate deploy step.
- Migrations run on boot inside `init()` in `database.js`. A failing
  migration aborts boot and the process exits, putting the app in a
  crash-loop until the migration is fixed and a new deploy succeeds.
- Production smoke check after a deploy: hit `/healthz` once it's added
  (slice C); until then, check that `/` returns a logged-out redirect.

## Postgres migration safety

### `ALTER COLUMN ... TYPE jsonb` (or any type change)

**You must drop the column's existing DEFAULT before the type cast, then
set the new DEFAULT.** Postgres validates the column default expression
against the *new* type separately from the row data, and the `USING`
clause doesn't apply to it. The error reads:

```
default for column "<col>" cannot be cast automatically to type <new_type>
```

Combine all of it in one statement so the rewrite holds
`ACCESS EXCLUSIVE` exactly once:

```sql
ALTER TABLE t
  ALTER COLUMN c DROP DEFAULT,
  ALTER COLUMN c TYPE jsonb USING COALESCE(NULLIF(c, '')::jsonb, '[]'::jsonb),
  ALTER COLUMN c SET DEFAULT '[]'::jsonb;
```

This bit us in commit `998a6ac` after `c41511d` (PR #7). Don't repeat.

### General migration rules

- One numbered file per change; never rewrite a migration that's
  already been recorded in `_migrations`. If the previous attempt was
  rolled back (so it's NOT in `_migrations`), editing the file in place
  is fine and intentional.
- The runner's `BEGIN`/`COMMIT` are issued through `pool.query`, so they
  may not share a connection with the migration itself. Treat each
  migration as if it might run outside a transaction — write idempotent
  DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`) wherever possible.
- For destructive operations on a populated `tasks` table, note the
  expected lock duration in the PR description before merging.

## Test harness

- `npm test` runs Vitest against an in-process `pg-mem`.
- pg-mem doesn't model `pg_advisory_lock`, full `LATERAL` joins, the
  `ALTER COLUMN … TYPE jsonb USING` migration, or `COLLATE "default"`.
  Stubs and skips for these live in `tests/setup.js`.
- Anything that needs real-Postgres semantics (lock contention, jsonb
  query plans, distributed cron behaviour under load) requires the
  Docker-Postgres test layer that hasn't been built yet.

## Frontend conventions

- `public/index.html` (authenticated app), `public/login.html`,
  `public/local.html` are the three served pages. `index.html` at the
  repo root is leftover and not served.
- After slice C lands: no inline `onclick=` / `<script>` — use
  `data-action` + the event delegator in `app.js`. Adding a new inline
  handler will be silently blocked by CSP.

## Roll-out style

- For changes with wider blast radius (env-var prereqs, CSP changes,
  destructive migrations), prefer staged PRs: A → B → C against `main`,
  each landing before the next is opened.
- Use draft PRs while the previous slice is being deployed and verified.
