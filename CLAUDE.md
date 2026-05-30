# Notes for Claude

Short index. Detailed feature docs live in `docs/` — load only what you need for the task at hand.

| Topic | File |
|---|---|
| Auth (local, Google web, Google mobile, sessions, password policy) | `docs/auth.md` |
| Schema, migration rules, jsonb gotcha | `docs/data-model.md` |
| CSP, `data-action` delegation, instant-paint cache, keyboard shortcuts | `docs/frontend.md` |
| Railway deploy, env vars, /healthz, cron, migration runner | `docs/operations.md` |
| Vitest + pg-mem harness, what it covers and doesn't | `docs/testing.md` |
| Expo client, TestFlight pipeline, Google OAuth gotchas, bundle ID | `docs/ios-app.md` |
| **Web + iOS feature parity, API contract, design tokens** | `docs/cross-platform.md` |
| iOS feature parity status (living doc) | `docs/platform-parity-report.md` |
| Cross-stage drag design spec | `docs/superpowers/specs/2026-05-30-cross-stage-drag-design.md` |
| Cross-stage drag implementation plan | `docs/superpowers/plans/2026-05-30-cross-stage-drag.md` |
| App icon design spec | `docs/superpowers/specs/2026-05-30-app-icon-design.md` |
| App icon implementation plan | `docs/superpowers/plans/2026-05-30-app-icon.md` |

## Cross-platform skill

A personal skill covering this project's cross-platform workflow lives at `~/.claude/skills/cross-platform/SKILL.md`. Before writing any feature that touches `server.js`, `public/app.js`, or `ios-app/`, read that skill and apply its checklist. The short version: every feature must land on both clients; see the checklist in that file.

A public-facing overview lives in `README.md`.

## High-frequency rules (don't repeat these mistakes)

### `ALTER COLUMN ... TYPE` always drops the old DEFAULT first

Postgres won't auto-cast a column's `DEFAULT` expression to the new type, and the `USING` clause doesn't apply to it. Bit prod in `998a6ac` (hotfix for PR #7). Canonical pattern:

```sql
ALTER TABLE t
  ALTER COLUMN c DROP DEFAULT,
  ALTER COLUMN c TYPE <new_type> USING <cast>,
  ALTER COLUMN c SET DEFAULT <new_default>;
```

### Migration runner footgun

The runner's `BEGIN`/`COMMIT` go through `pool.query`, which may hand out different connections. Treat each migration as if it might run outside a transaction — prefer idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Never edit a migration that's already been recorded in `_migrations`.

### `main` is prod

Merging a PR auto-deploys to Railway. Confirm env-var prereqs and migration plans before pressing merge. For changes with wider blast radius (env-var requirements, CSP changes, destructive migrations), stage them as smaller PRs in sequence.

### Frontend handlers go through `data-action`

CSP blocks inline `onclick=`. Adding a new inline handler will be silently rejected by the browser. Use `data-action="funcName"` and register the function in `app.js`'s `__actions` object. See `docs/frontend.md`.
