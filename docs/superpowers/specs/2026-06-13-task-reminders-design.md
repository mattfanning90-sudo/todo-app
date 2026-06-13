# Task Reminders + Notifications Settings — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorming complete)
**Phase:** 1 of 2 (Phase 2 = activity push, deferred)

## Summary

Add **OS notifications for tasks** driven by due dates, plus a **notifications
settings page** that consolidates the new reminder controls with the existing
email-digest control. Phase 1 uses **on-device local notifications** only — no
server push infrastructure (no APNs, no Expo Push tokens, no web-push/VAPID).

## Goals

- Users get an OS notification reminding them about tasks that have a due date.
- A single notifications settings surface on web and iOS with:
  - **Task reminders**: master on/off, reminder time-of-day, lead option.
  - **Email digest**: frequency (moved here from today's standalone picker).
- Full web + iOS parity at the settings/contract layer.

## Non-goals (explicitly deferred / out of scope)

- Activity push (assigned/shared/invite → OS push). *Phase 2; needs push infra.*
- Web notifications when the browser is fully quit (needs web-push/VAPID — Phase 2).
- Per-task reminder times; sub-day offsets ("1 hour before").
- Notification action buttons (snooze/complete); quiet hours.
- Expanding recurring-task instances — Phase 1 reminds on the stored `due_date` only.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Trigger | Due-date reminders (local), iOS-first + web parity |
| Reminder timing | One global `reminder_time` + a global lead (`0`/`1`/`2` days before). No per-task field. |
| Web mechanism | Web Notifications API + thin service worker; fires while the browser is running (even backgrounded), not when fully quit. |
| Naming | **snake_case** everywhere, to match `ios-app/src/api/types.ts` and the A3 contract test. |
| Storage | Columns on `users` (mirrors `digest_frequency`); no new table. |

## Data model

New migration `migrations/014_reminder_settings.sql` — additive, idempotent
(matches `009_email_digest.sql`):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TEXT DEFAULT '09:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER DEFAULT 0;
```

- `reminders_enabled` — the user's synced *intent*. Firing on a device *also*
  requires that device's OS permission (a device without permission just doesn't
  fire; the setting persists and permitted devices still work).
- `reminder_time` — `HH:MM`, 24h, interpreted in **device-local** time.
- `reminder_lead_days` — `0` = on the due date, `1` = 1 day before, `2` = 2 days before.

Discovered + applied by `database.js init()` (`readdirSync → .sql → .sort()`),
which runs **pre-deploy** via `scripts/migrate.js` (railway.json). Because the
migration is additive, the `/readyz` readiness gate (503 `migrations_pending`
until `_migrations ≥ MIGRATION_COUNT`, server.js) stays clean and downtime-free.
`MIGRATION_COUNT` auto-derives from the migrations dir — no code change needed.

## API

All endpoints `requireAuth` + `wrap`; state-changing ones are covered by the
existing `X-Requested-With` CSRF guard. Sentry auto-captures handler errors.

### `GET /api/user` (extend)
Add three keys to the existing response:
```jsonc
{ ..., "digest_frequency": "none",
  "reminders_enabled": false, "reminder_time": "09:00", "reminder_lead_days": 0 }
```

### `PUT /api/user/reminders` (new)
Body `{ enabled: boolean, time: "HH:MM", lead_days: 0|1|2 }`. Validation:
- `enabled` must be boolean.
- `time` must match `^([01]\d|2[0-3]):[0-5]\d$`.
- `lead_days` must be one of `0`, `1`, `2`.
On success: `UPDATE users SET ...` then `res.json({ ok: true })`. On bad input:
`400 { error: 'invalid_reminders' }`. Mirrors `PUT /api/user/digest`.

### `GET /api/reminders/agenda` (new)
The user's upcoming actionable tasks **across all their boards** (owned + member),
for scheduling. Modeled directly on `/api/tasks/today` (server.js:969) but with a
date *range* instead of `= today`:

```sql
SELECT DISTINCT t.id, t.text, t.due_date, t.board_id, b.name AS board_name
  FROM tasks t
  JOIN boards b ON b.id = t.board_id
  LEFT JOIN board_members bm ON bm.board_id = t.board_id AND bm.member_user_id = $1
 WHERE (b.owner_user_id = $1 OR bm.member_user_id IS NOT NULL)
   AND (t.archived IS NULL OR t.archived = false)
   AND t.stage <> 'done'
   AND t.due_date <> ''                 -- load-bearing: '' sorts before all dates
   AND t.due_date >= $2                  -- today (YYYY-MM-DD)
   AND t.due_date <= $3                  -- today + horizon (default 60 days)
 ORDER BY t.due_date ASC
 LIMIT 100
```

Returns `ReminderTask[]` = `{ id, text, due_date, board_id, board_name }`.
**Deliberately NOT `?board=` scoped** — reminders are user-global. This is a
documented exception to the board-scope rule in `docs/cross-platform.md`.

New iOS type:
```ts
export interface ReminderTask {
  id: number; text: string; due_date: string; board_id: number; board_name: string;
}
```

## Scheduling / firing engine

### Shared pure function (implemented + unit-tested on both clients)

`computeFireAt(due_date: 'YYYY-MM-DD', reminder_time: 'HH:MM', lead_days: number): Date`
= `(due_date − lead_days)` at `reminder_time`, in device-local time. Returns a
`Date`. Callers skip any result that is in the past.

### iOS — true OS scheduling (fires even when the app is closed)

`expo-notifications` (installed via `npx expo install`, config plugin in app.json).
A **reconciler** runs on app foreground, after any task mutation, and after a
settings save:
1. If `reminders_enabled` is false or OS permission not granted → cancel all and stop.
2. Fetch `GET /api/reminders/agenda`.
3. `cancelAllScheduledNotificationsAsync()`.
4. For each task compute `fireAt`; if in the future, `scheduleNotificationAsync`
   with a date trigger. Order by soonest; cap at **60** (iOS allows 64 pending).
5. Notification content: title `Task due`, body = task text (+ board name).

### Web — poll-while-running (fires while the browser runs; not when quit)

A thin same-origin service worker (`public/sw.js`) hosts `showNotification`
(better mobile/background reliability than page-context `new Notification`).
- On enabling: `Notification.requestPermission()` + `serviceWorker.register('/sw.js')`.
- App keeps the agenda in memory; a ~30s `setInterval` tick + on-load / on-`focus`
  / `visibilitychange` checks fire any reminder whose `fireAt ≤ now` not yet fired.
- Fired keys (`${task_id}:${due_date}:${fireAt}`) tracked in `localStorage` to
  prevent duplicate fires across ticks/reloads.
- Re-fetch agenda after task mutations, settings save, and on focus.

**Documented asymmetry:** iOS fires when closed; web only while the browser runs.
Closing the web gap needs web-push/VAPID = Phase 2.

## Settings UI (consolidation)

One notifications settings surface per client, with two sections:
- **Task reminders** (new): master toggle (requests OS permission on enable),
  reminder time picker, lead select (On the day / 1 day before / 2 days before).
- **Email digest** (existing): frequency — *moved here* from the standalone picker.

### Web
A dedicated Notifications settings **view**, reached from the Profile tab's
existing "Notifications" row (replaces the `openDigestPicker` prompt in
`public/app.js`), with a back affordance to Profile. All handlers via
`data-action` registered in `__actions` (no inline `onclick` — CSP). Permission
denied → inline hint; toggle stays off.

### iOS
Expand `ios-app/src/screens/SettingsScreen.tsx` (already in ProfileNav,
currently digest-only): add the Task reminders section above the digest section.
Permission denied → `Alert` pointing to iOS Settings; toggle stays off. Theme
tokens throughout; `useFocusEffect` for any focus-driven refresh.

## Edge cases

- No `due_date` → no reminder (agenda excludes `due_date = ''`).
- `fireAt` in the past (incl. lead pushing it before now) → skip (no overdue spam).
- Completed/archived tasks → excluded by the agenda filter on next reconcile.
- Recurrence → reminds on the stored `due_date` only (instance expansion deferred).
- Timezone/DST → device-local interpretation (what users expect for "9am"); no tz column.
- Disabling → iOS cancels all scheduled; web stops firing + may clear fired keys.

## Testing (three CI-required layers + iOS)

- **pg-mem** (`npm test`): `PUT /api/user/reminders` validation + persistence;
  `GET /api/user` includes the new keys; agenda basic filtering.
- **realpg** (`npm run test:realpg`, A5 — required check): agenda date-horizon +
  cross-board + `due_date <> ''` correctness against real Postgres.
- **contract** (`tests/api-contract.test.js`, A3): add the new `/api/user` keys
  and a `/api/reminders/agenda → ReminderTask` key-presence block.
- **iOS jest**: `computeFireAt` + the reconciler (mock `expo-notifications`);
  keep `boot` + `nav-version-alignment` green.
- **web**: `computeFireAt` + the should-fire/already-fired dedupe as pure functions.

## Rollout / ops

- Additive migration through the pre-deploy runner; `/readyz` gate stays clean.
- iOS: `npx expo install expo-notifications` (never `npm install`); add config
  plugin to `app.json`; local notifications need a dev/standalone build to verify
  end-to-end; run `npx expo-doctor` + `npm test` (boot check) before any `eas build`;
  keep all `@react-navigation/*` on v6.
- Web: CSP must allow the same-origin service worker (`worker-src 'self'` if the
  current policy blocks workers — verify against the helmet config).
- Suggested PR split (CSP + migration = wider blast radius): (1) server+migration+tests,
  (2) web, (3) iOS. Buildable on one branch; split at push time.
