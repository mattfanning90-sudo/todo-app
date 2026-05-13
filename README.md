# Tasks

A self-hosted kanban + todo app. Single-user or shared boards, three sign-in methods, an iOS companion app, and a small but real CI/test setup. Built with Node + Postgres on the server and vanilla HTML/JS on the web client — no React, no build step.

> **Live deploy:** Railway (auto-deploys from `main`).
> **Stack:** Express 4, Passport (Google OAuth + local), `pg`, Helmet, `node-cron`. Vanilla web client. Expo / React Native iOS client under `ios-app/`.

## Features

| | |
|---|---|
| **Kanban board** | Three stages (backlog → in progress → done). Drag-reorder works on desktop and touch. Long-press initiates drag on mobile. |
| **Boards** | Each user starts with "My Board"; can create more. Each board has its own categories and tasks. |
| **Sharing** | Invite by email or link. Invitees can sign up via the invite token and land on the shared board. Owner controls who's in. |
| **Categories** | Six colour-coded defaults. Click to filter; click again to clear. Add / edit / delete in the sidebar. |
| **Task metadata** | Priority (none/low/medium/high), due date with natural-language parsing, recurrence rules, subtasks, assignee, free-text notes, status. |
| **Archive** | Done tasks can be archived rather than deleted. Archived view is paginated. |
| **Dashboard** | 7-day trend bars, breakdown by priority and category, open / in-progress / overdue counts. |
| **Search** | Global `⌘K`. Fuzzy text match across the user's tasks. |
| **Notifications** | When you're assigned a task or invited to a board. Pruned after 90 days. |
| **Email digest** | Optional daily / weekly / fortnightly summary. Off by default. |
| **Mobile** | Header collapses to an avatar-only account menu; touch-drag with haptics; pull-to-refresh. |
| **iOS app** | Native client under `ios-app/`. Same `/api/*` endpoints. Google sign-in via `expo-auth-session`. |
| **Local mode** | `/local.html` is a no-account version that stores everything in `localStorage`. Useful for trial / offline drafts. |

## Run it locally

```bash
git clone …
cd todo-app
cp .env.example .env          # then edit
npm install
psql -c 'CREATE DATABASE todo'   # or use Docker
npm run dev
```

Open `http://localhost:3000`. Migrations run on first boot.

Run the tests:

```bash
npm test
```

29 tests, ~9 s, no external DB required (uses `pg-mem`).

## Architecture

### Server (`server.js`, `database.js`, `backup.js`)

One Express app, one Postgres pool, one node-cron scheduler. Every endpoint is a `wrap(async (req, res) => …)` wrapper around a single SQL query or short transaction. No ORM, no migrations framework — just numbered `.sql` files in `migrations/` that the boot path executes in order.

### Web client (`public/`)

Three static pages served by `express.static('public')`:

- `index.html` — authenticated app (kanban + sidebar)
- `login.html` — sign in / sign up
- `local.html` — no-account local mode

After slice C (PR #11), the inline `<script>` and `<style>` blocks from `index.html` were extracted to `app.js` / `app.css`. All `onclick=` handlers were converted to `data-action="…"` so CSP can ban inline JS entirely.

### iOS client (`ios-app/`)

Expo SDK 51 + TypeScript. Talks to the same `/api/*` endpoints. See `docs/ios-app.md`.

### Tests (`tests/`)

Vitest + pg-mem. The server runs against an in-process Postgres clone, with a handful of helper functions stubbed (advisory locks, `to_regclass`, etc.). See `docs/testing.md`.

## Design choices

### Why vanilla web, no framework

The app started small enough that React would have been overkill. Sticking with vanilla means **zero build step** — `git push` deploys the source verbatim, browser parses it, app runs. Faster iteration, no toolchain rot, simpler error stacks.

The cost: state lives partly in JS globals and partly in DOM `dataset.*`, which is fragile beyond a few hundred lines. We've accepted that for now; if the app keeps growing, the next step is to introduce a tiny store and possibly Preact, not to ship a full SPA build.

### Why Postgres `jsonb` for `tasks.owners` and `tasks.subtasks`

Migration 012 promoted both from `TEXT` to `jsonb`. The reads no longer have to `JSON.parse(t.owners || '[]')` for every row of every board fetch, and the columns can be indexed / queried in SQL if we ever want to. Writes still use `JSON.stringify(value)` which works identically for both column types.

The migration shipped with a bug the first time around: Postgres won't auto-cast a column's existing TEXT `DEFAULT '[]'` to `jsonb`. Crash-looped prod for ~15 minutes. Hotfix `998a6ac` drops the default, changes the type, and sets the new jsonb default in one atomic `ALTER TABLE`. The lesson is in `CLAUDE.md` and `~/.claude/CLAUDE.md`.

### Why migrations run on boot

Simpler than a separate migrate step. The trade-off: a bad migration crash-loops the container and there's no manual gate. We've added a `/healthz` endpoint so the orchestrator can route around bad instances, but the real safety net is the staged-PR pattern (see below) plus the rule that destructive migrations get their own PR.

### Why localStorage cache for instant paint

The board now paints from a `boot_cache_v1` localStorage entry **synchronously** at the top of `init()`, before any `fetch` runs. The network request reconciles in the background. After the first load, perceived latency to see your tasks is effectively zero — the cards are in the DOM the moment the script parses.

Bytes-on-the-wire didn't change. What changed is when the user sees something.

### Why externalize inline JS and tighten CSP

The pre-slice-C CSP allowed `'unsafe-inline'` on `script-src` and `script-src-attr`, which negates most of CSP's value. The trade-off was that 60+ `onclick=` handlers in the HTML would break without it.

Slice C moved the inline `<script>` block to `app.js` and replaced every `onclick="foo()"` with `data-action="foo"`. A single document-level click delegator dispatches to a function registry. Now CSP is `script-src 'self'` / `script-src-attr 'none'` — actually defensive.

### Why distributed cron via `pg_advisory_lock`

If you scale Railway to 2+ instances, every `node-cron` schedule would fire on every instance, producing duplicate backups, duplicate digest emails, and duplicate notification cleanup. Wrapping each cron callback in `withLeaderLock(pool, key, fn)` (which does `pg_try_advisory_lock` on a fixed key) means exactly one instance actually runs the job per tick. No Redis, no etcd, no third party — just Postgres.

### Why Vitest + pg-mem for the test harness

We wanted **fast tests** that don't need a separate database to set up, and we wanted them to exercise real route handlers, real middleware, real auth. pg-mem trades fidelity for speed: most of the schema works, JOINs work, indexes work, but advisory locks and `LATERAL` joins are partial. Stubs in `tests/setup.js` cover the gaps. The full suite runs in ~9 seconds. CI uses the same command.

The next layer up is a Postgres-in-Docker integration test for the things pg-mem can't model. Not built yet.

### Why staged-PR rollouts for risky changes

After the bundled "make everything better" PR #5 crash-looped prod (the JSONB migration bug), we split future changes by blast radius:

- Slice A (#6) — client-side perf, safe `CREATE INDEX` migration. No env vars.
- Slice B (#7) — JSONB migration. Brief table lock. No env vars.
- Slice C (#11) — security hardening + CSP + fail-fast env vars. Required Railway config first.

Each PR lands before the next is opened. If something goes wrong, the rollback target is one merge back, not a 12-file diff.

## Repository layout

```
.
├── server.js                # one big Express app
├── database.js              # pool + migration runner
├── backup.js                # snapshot job + advisory-lock helper
├── migrations/              # numbered SQL, run on boot
├── public/                  # static web client (app.js, app.css, *.html)
├── ios-app/                 # Expo / React Native iOS client
├── tests/                   # Vitest + pg-mem
├── docs/                    # feature docs (see below)
├── CLAUDE.md                # high-frequency rules + pointers
└── README.md                # this file
```

## Deeper docs

| | |
|---|---|
| `docs/auth.md` | Sign-in methods, sessions, password policy, mobile token flow |
| `docs/data-model.md` | Postgres schema, indexes, migration rules |
| `docs/frontend.md` | CSP, `data-action` delegation, instant-paint cache, keyboard shortcuts |
| `docs/operations.md` | Railway, env vars, `/healthz`, distributed cron, graceful shutdown |
| `docs/testing.md` | Vitest harness, pg-mem caveats, coverage summary |
| `docs/ios-app.md` | Expo client overview, auth flow, endpoints used |

## License

MIT. No warranty.
