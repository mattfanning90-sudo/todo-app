# Task Reminders + Notifications Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OS notifications for tasks with a due date (on-device local notifications), plus a notifications settings page consolidating reminder + email-digest controls, on web and iOS.

**Architecture:** Three preference columns on `users` drive everything. A board-spanning `GET /api/reminders/agenda` endpoint returns upcoming due tasks; a shared pure `computeFireAt(due_date, reminder_time, lead_days)` turns each into a fire time. iOS hands fire times to `expo-notifications` (fires when closed); web polls while running and fires via a service worker. No server push infra. Spec: `docs/superpowers/specs/2026-06-13-task-reminders-design.md`.

**Tech Stack:** Node/Express + Postgres (server), vanilla JS + service worker (web), Expo SDK 55 / React Native + `expo-notifications` (iOS). Tests: vitest (pg-mem + realpg) + supertest (server), jest (iOS).

**Conventions (load-bearing):** snake_case to match `ios-app/src/api/types.ts` + the A3 contract test. Additive idempotent migration applied pre-deploy by `scripts/migrate.js`. Web handlers via `data-action`/`__actions` (CSP blocks inline `onclick`). iOS deps via `npx expo install`, all `@react-navigation/*` on v6.

---

## File structure

**Server**
- Create `migrations/014_reminder_settings.sql` — 3 additive columns on `users`.
- Modify `server.js` — extend `GET /api/user`; add `PUT /api/user/reminders` + `GET /api/reminders/agenda`.
- Create `tests/reminders.test.js` (pg-mem) — endpoint validation/persistence + agenda basics.
- Create `tests/realpg/reminders-agenda.test.js` (A5) — date-horizon + cross-board correctness.
- Modify `tests/api-contract.test.js` (A3) — new `/api/user` keys + agenda block.

**Web**
- Create `public/sw.js` — minimal service worker hosting `showNotification`.
- Create `public/reminders.js` — `computeFireAt`, fire/dedupe logic, the polling loop (pure + thin DOM glue), loaded before `app.js`.
- Modify `public/app.js` — notifications settings view + `__actions` handlers; replace `openDigestPicker`.
- Modify `public/index.html` — add `screen-notifications` section + `<script src="/reminders.js">`.
- Modify `server.js` helmet CSP — ensure `worker-src 'self'` (only if current policy blocks workers).
- Create `tests/reminders-firetime.test.js` (web pure logic) OR colocate in `public/` test — vitest.

**iOS**
- Modify `ios-app/src/api/types.ts` — `User` new fields + `ReminderTask`.
- Modify `ios-app/src/api/client.ts` — `updateReminders`, `getReminderAgenda`.
- Create `ios-app/src/notifications/reminders.ts` — `computeFireAt` + `reconcileReminders`.
- Modify `ios-app/src/screens/SettingsScreen.tsx` — add Task reminders section.
- Modify `ios-app/app.json` — `expo-notifications` plugin.
- Modify `ios-app/App.tsx` (or root) — run reconciler on foreground/auth.
- Create `ios-app/__tests__/reminders.test.ts` — `computeFireAt` + reconciler (mock expo-notifications).

---

## Task 1: Migration — reminder columns on `users`

**Files:** Create `migrations/014_reminder_settings.sql`

- [ ] **Step 1: Write the migration** (additive, idempotent — mirrors `009_email_digest.sql`)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TEXT DEFAULT '09:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER DEFAULT 0;
```

- [ ] **Step 2: Apply locally** — `node scripts/migrate.js` (or boot the server). Expected: `[migrate] schema up to date`, `_migrations` gains `014_reminder_settings.sql`.
- [ ] **Step 3: Commit** — `git add migrations/014_reminder_settings.sql && git commit -m "feat(reminders): migration — reminder prefs on users (014)"`

## Task 2: `GET /api/user` returns reminder prefs

**Files:** Modify `server.js` (the `app.get('/api/user'`)  handler ~line 702) and the auth responses that echo the user object (signup/login ~586,663,691) so the fields are present after auth too.

- [ ] **Step 1 (test, pg-mem):** in `tests/reminders.test.js` assert a freshly signed-up user's `GET /api/user` includes `reminders_enabled:false`, `reminder_time:'09:00'`, `reminder_lead_days:0`.
- [ ] **Step 2:** Run `npm test -- reminders` → FAIL (keys missing).
- [ ] **Step 3:** Add the columns to the `SELECT` that loads `req.user` (the `deserializeUser`/lookup at server.js ~412: `SELECT id, name, email, username, digest_frequency, reminders_enabled, reminder_time, reminder_lead_days FROM users ...`) and add the keys to the `/api/user` JSON (with safe defaults `?? false / '09:00' / 0`). Mirror in the signup/login user payloads.
- [ ] **Step 4:** Run `npm test -- reminders` → PASS.
- [ ] **Step 5:** Commit `feat(reminders): expose reminder prefs on /api/user`.

## Task 3: `PUT /api/user/reminders`

**Files:** Modify `server.js` (after `PUT /api/user/digest` ~712). Test in `tests/reminders.test.js`.

- [ ] **Step 1 (tests):** valid body persists + round-trips via `/api/user`; rejects bad `time` ("9:00", "24:00", "noon"), bad `lead_days` (3, -1, "1"), non-boolean `enabled` → 400 `invalid_reminders`.
- [ ] **Step 2:** Run → FAIL (404/route missing).
- [ ] **Step 3: Implement**

```js
app.put('/api/user/reminders', requireAuth, wrap(async (req, res) => {
  const { enabled, time, lead_days } = req.body;
  const okTime = typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const okLead = [0, 1, 2].includes(lead_days);
  if (typeof enabled !== 'boolean' || !okTime || !okLead) {
    return res.status(400).json({ error: 'invalid_reminders' });
  }
  await pool.query(
    'UPDATE users SET reminders_enabled = $1, reminder_time = $2, reminder_lead_days = $3 WHERE id = $4',
    [enabled, time, lead_days, req.user.id]
  );
  res.json({ ok: true });
}));
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(reminders): PUT /api/user/reminders`.

## Task 4: `GET /api/reminders/agenda`

**Files:** Modify `server.js` (near `/api/tasks/today` ~969). Tests: pg-mem basics in `tests/reminders.test.js`; correctness in `tests/realpg/reminders-agenda.test.js`.

- [ ] **Step 1 (pg-mem test):** signed-up user with a task due within horizon → appears with keys `id,text,due_date,board_id,board_name`; a `done` task and a dateless task do NOT appear.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** (horizon = 60 days; compute today + max date in JS to avoid pg-mem date arithmetic)

```js
app.get('/api/reminders/agenda', requireAuth, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT DISTINCT t.id, t.text, t.due_date, t.board_id, b.name AS board_name
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       LEFT JOIN board_members bm ON bm.board_id = t.board_id AND bm.member_user_id = $1
      WHERE (b.owner_user_id = $1 OR bm.member_user_id IS NOT NULL)
        AND (t.archived IS NULL OR t.archived = false)
        AND t.stage <> 'done'
        AND t.due_date <> '' AND t.due_date >= $2 AND t.due_date <= $3
      ORDER BY t.due_date ASC
      LIMIT 100`,
    [req.user.id, today, max]
  );
  res.json(rows);
}));
```

- [ ] **Step 4 (realpg test):** in `tests/realpg/reminders-agenda.test.js` seed owned + shared-board tasks across the horizon boundary; assert ordering, exclusion of out-of-horizon/done/archived/dateless, cross-board inclusion.
- [ ] **Step 5:** Run `npm test -- reminders` and (with throwaway PG) `DATABASE_URL=… DB_SSL=disable npm run test:realpg` → PASS.
- [ ] **Step 6:** Commit `feat(reminders): GET /api/reminders/agenda (cross-board, horizon)`.

## Task 5: A3 contract test

**Files:** Modify `tests/api-contract.test.js`.

- [ ] **Step 1:** Add `USER_KEYS` incl. `reminders_enabled, reminder_time, reminder_lead_days` and assert on `GET /api/user`; add `REMINDER_TASK_KEYS = ['id','text','due_date','board_id','board_name']` with a describe block hitting `/api/reminders/agenda` after creating a due task.
- [ ] **Step 2:** Run `npm test -- api-contract` → PASS (after Task 2/4). Commit `test(contract): cover reminder prefs + agenda (A3)`.

## Task 6: Web — shared fire-time logic + tests

**Files:** Create `public/reminders.js` (pure section first). Test `tests/reminders-firetime.test.js`.

- [ ] **Step 1 (test):** `computeFireAt('2026-06-20','09:00',0)` → 2026-06-20T09:00 local; `lead_days:2` → 2026-06-18T09:00; `shouldFire(fireAt, now, firedSet)` true when due & unfired, false when already in firedSet.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the pure fns (exported for tests via `globalThis`/module guard; browser reads them off `window`):

```js
function computeFireAt(due_date, reminder_time, lead_days) {
  const [y, m, d] = due_date.split('-').map(Number);
  const [hh, mm] = reminder_time.split(':').map(Number);
  return new Date(y, m - 1, d - (lead_days || 0), hh, mm, 0, 0);
}
function reminderKey(t, fireAt) { return `${t.id}:${t.due_date}:${fireAt.getTime()}`; }
```

- [ ] **Step 4:** Run → PASS. Commit `feat(reminders-web): fire-time logic + tests`.

## Task 7: Web — service worker + polling loop

**Files:** Create `public/sw.js`; finish `public/reminders.js` (loop); `public/index.html` script tag; `server.js` CSP if needed.

- [ ] **Step 1:** `public/sw.js` — minimal: `self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));` (notifications shown via `registration.showNotification`).
- [ ] **Step 2:** In `reminders.js`: `enableReminders()` → `Notification.requestPermission()` + `navigator.serviceWorker.register('/sw.js')`; `startReminderLoop(getPrefs, fetchAgenda)` → on load/focus/visibilitychange + 30s interval, fetch agenda, for each task `fireAt=computeFireAt(...)`, if `shouldFire` → `reg.showNotification('Task due', { body: text })`, persist key to `localStorage`.
- [ ] **Step 3:** Verify CSP: check helmet config in `server.js` (~69) — if `worker-src`/`default-src` blocks `/sw.js`, add `workerSrc: ["'self'"]`. Confirm `/sw.js` served from `public/` (static).
- [ ] **Step 4:** Manual smoke: load app, enable, set `reminder_time` to ~2 min out on a due-today task, confirm OS banner. Commit `feat(reminders-web): service worker + polling loop`.

## Task 8: Web — notifications settings view

**Files:** Modify `public/app.js` (+ `index.html`).

- [ ] **Step 1:** Add `screen-notifications` section; from Profile's "Notifications" row `data-action="gotoNotifications"` (replaces `openDigestPicker`). Render: reminders toggle, time `<input type=time>`, lead `<select>` (0/1/2), digest frequency control (moved here), back button. Register handlers in `__actions`: `gotoNotifications`, `saveReminders` (→ `PUT /api/user/reminders`, then re-run loop), `saveDigest` (existing endpoint).
- [ ] **Step 2:** On toggle-enable, call `enableReminders()`; if permission denied, revert toggle + inline hint. Invalidate any user cache (instant-paint).
- [ ] **Step 3:** Manual: change settings, reload, values persist; digest still works. Commit `feat(reminders-web): notifications settings view + digest consolidation`.

## Task 9: iOS — install + types + client

**Files:** `ios-app/` deps; `ios-app/src/api/types.ts`; `ios-app/src/api/client.ts`; `ios-app/app.json`.

- [ ] **Step 1:** `cd ios-app && npx expo install expo-notifications` (NOT npm install). Add to `app.json` plugins: `["expo-notifications"]`.
- [ ] **Step 2:** `types.ts` — add to `User`: `reminders_enabled: boolean; reminder_time: string; reminder_lead_days: number;` and `export interface ReminderTask { id:number; text:string; due_date:string; board_id:number; board_name:string; }`.
- [ ] **Step 3:** `client.ts` — `updateReminders(body:{enabled:boolean;time:string;lead_days:number})` → `PUT /api/user/reminders`; `getReminderAgenda()` → `GET /api/reminders/agenda` (NOT board-scoped).
- [ ] **Step 4:** `npx tsc --noEmit` clean. Commit `feat(reminders-ios): expo-notifications + types + client`.

## Task 10: iOS — reconciler + tests

**Files:** Create `ios-app/src/notifications/reminders.ts`; test `ios-app/__tests__/reminders.test.ts`.

- [ ] **Step 1 (test):** `computeFireAt` parity with web; `reconcileReminders` cancels all then schedules one per future task, skips past, caps at 60, no-ops when disabled/denied (mock `expo-notifications`).
- [ ] **Step 2:** Run `cd ios-app && npm test -- reminders` → FAIL.
- [ ] **Step 3: Implement** `computeFireAt` (same as web) + `reconcileReminders({enabled, time, lead_days}, tasks)`: if `!enabled` → `cancelAllScheduledNotificationsAsync()`; else ensure permission, cancel all, sort tasks by due_date, for first 60 compute fireAt, if future `scheduleNotificationAsync({content:{title:'Task due',body:t.text},trigger:fireAt})`.
- [ ] **Step 4:** Run → PASS. Commit `feat(reminders-ios): schedule reconciler + tests`.

## Task 11: iOS — settings UI + foreground reconcile

**Files:** `ios-app/src/screens/SettingsScreen.tsx`; root (`App.tsx`/RootNavigator) for foreground hook.

- [ ] **Step 1:** Add a "Task reminders" section above digest: `Switch` (enabled), a time picker, a lead segmented control (On the day/1 day/2 days). On change → `api.updateReminders(...)` then `reconcileReminders(...)` with fresh agenda. Permission denied → `Alert` to iOS Settings, keep off. Theme tokens.
- [ ] **Step 2:** Wire a foreground trigger: on `AppState` active + after auth, fetch agenda + reconcile.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm test` (incl. boot + nav-version-alignment) green. Commit `feat(reminders-ios): settings UI + foreground reconcile`.

## Task 12: Gates + docs

- [ ] **Step 1:** Web/server: `npm test` (pg-mem incl. contract) PASS; `DATABASE_URL=postgres://…/todo_realpg_test DB_SSL=disable npm run test:realpg` PASS.
- [ ] **Step 2:** iOS: `cd ios-app && npx expo-doctor && npm test` PASS.
- [ ] **Step 3:** Update `docs/cross-platform.md` (note the non-board-scoped agenda exception) + `docs/data-model.md` (new columns) + `docs/platform-parity-report.md`. Commit `docs(reminders): cross-platform + data-model notes`.
- [ ] **Step 4:** Report status + recommend PR split (server / web / iOS); do not push without approval.

---

## Self-review

- **Spec coverage:** migration (T1), `/api/user` (T2), PUT reminders (T3), agenda (T4), contract A3 (T5), web fire-logic (T6), web SW+loop (T7), web settings+digest consolidation (T8), iOS deps/types/client (T9), iOS reconciler (T10), iOS UI+foreground (T11), all three test layers + docs (T12). All spec sections mapped.
- **Type consistency:** `computeFireAt(due_date, reminder_time, lead_days)` and `ReminderTask{id,text,due_date,board_id,board_name}` identical across web + iOS + contract test. PUT body `{enabled,time,lead_days}` consistent T3/T9/T11.
- **Placeholder scan:** endpoint + migration + pure-fn code given in full; UI steps describe concrete controls + handlers (follow existing `SettingsScreen`/`renderProfile` patterns).
