# Testing

`npm test` runs Vitest against an in-process `pg-mem` Postgres clone. ~9 seconds for the full suite, no external DB required.

## Layout

```
tests/
  setup.js              # pg-mem wiring + function stubs + migration runner
  helpers/agent.js      # supertest agent factory pre-authed as a fresh user
  health.test.js        # /healthz, CSP headers, request IDs
  auth.test.js          # password policy, login, /api/user shape
  tasks.test.js         # CRUD, /api/tasks/count, archived pagination
  digest.test.js        # escapeHtml, isStrongPassword, runDigests smoke
  perf.test.js          # latency + payload-size microbench
vitest.config.js
```

## How the harness works

`tests/setup.js` does three things:

1. **Replaces `pg` with `pg-mem`** by patching `require.cache` so both ESM (`vi.mock`) and CJS (`require('pg')`) resolve to the same in-process adapter.
2. **Stubs functions pg-mem doesn't model** — `pg_try_advisory_lock`, `pg_advisory_lock`, `pg_advisory_unlock`, `to_regclass`, `to_timestamp`, `pg_size_pretty`. Lock stubs return `true`, so `withLeaderLock` keeps its production code path in tests.
3. **Manages clean state** — runs migrations once per fork in `beforeAll`, takes a `memDb.backup()` snapshot, then restores from that snapshot in every `beforeEach` (faster than re-running migrations, and avoids pg-mem's quirk of leaving PK constraint indexes around after `DROP CASCADE`).

The session table is pre-created with pg-mem-compatible DDL so `connect-pg-simple`'s auto-create path (which uses `COLLATE "default"` and `WITH (OIDS=FALSE)`, both unparseable) is skipped via the `to_regclass` check.

## Importing the app under test

`server.js` ends with `module.exports = { app, runDigests, cleanupOldNotifications, escapeHtml, isStrongPassword }`, and the bootstrap block is gated behind `if (require.main === module)`. Tests can import `app` without triggering `app.listen`, cron schedulers, or boot-time backups.

`GoogleStrategy` only registers when its env vars are set, so the test process boots without credentials.

`NODE_ENV=test` makes all rate limiters pass through, so benchmarks can hammer endpoints without hitting `429`s.

## What's covered

29 tests, ~9 s:

- **Headers / infra**: `/healthz` shape, strict CSP, unique `X-Request-Id`.
- **Auth**: signup rejects weak/short/non-complex passwords; valid signup redirects to `/`; login works end-to-end; `/api/user` returns `null` for unauthenticated requests.
- **Tasks**: create/list/delete, length validation, auth requirement, `/api/tasks/count` active vs archived, archived pagination cap.
- **Unit functions**: `escapeHtml` against the five HTML metacharacters; `isStrongPassword` edge cases.
- **Digest**: smoke test that `runDigests()` doesn't crash.
- **Perf bench**: 50-run median + p95 latency for `/api/tasks`, `/api/tasks/count`, archived list, `/healthz`. Payload size comparison.

## What isn't covered

pg-mem can't model:

- `pg_advisory_lock` semantics (we stub it).
- The full `LATERAL` join used in the batched digest query (executes but with reduced fidelity).
- The `ALTER COLUMN ... TYPE jsonb USING` migration (skipped — pg-mem rejects the parser; logged once on first run).
- Real concurrency / lock contention.

For those you need real Postgres. The next layer would be `docker-compose.yml` + Postgres in CI; not built yet.

## Running

- `npm test` — one-shot, exits 0 / 1.
- `npm run test:watch` — re-runs on file changes.
- `npx vitest run tests/auth.test.js` — single file.

If you add a feature, follow the pattern: name the file `tests/<feature>.test.js`, import from `../server.js`, use `signupAndAgent()` from `helpers/agent.js` when you need an authed session.
