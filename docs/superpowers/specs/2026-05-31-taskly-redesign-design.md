# Taskly Redesign — Design Spec

_2026-05-31._

## Overview

Redesign both clients (web `public/app.js` + iOS `ios-app/`) to the "Taskly" visual
language and a 3-tab information architecture — **Today · Board · Profile** — while
preserving every existing feature. The design comes from two mockups the user
provided (`WebTodo.jsx` web layout, `TodoApp.jsx` iOS phone layout). Those mockups
are a **visual reference only** — they are React with inline handlers and local
state; the real clients are vanilla JS under a strict CSP (web) and React Native
(iOS), so all interaction is reimplemented natively.

The redesign is a UI/IA change. The API contract is unchanged except for **one new
read endpoint** (`GET /api/tasks/today`) that the cross-board Today tab needs. No
schema migration.

## Goals

- Adopt the Taskly look: coral accent, rounded white cards, soft shadows, progress
  rings, category color chips, continuous-flow kanban.
- Collapse the current ~10-screen IA into 3 primary tabs without losing any feature.
- Keep web ↔ iOS parity (per `docs/cross-platform.md`): every feature lands on both.
- Web first (iterates instantly), then mirror to iOS.

## Non-goals (deferred, still in backlog)

- **Focus / pomodoro tab** — no data model yet; re-added as a 4th tab later.
- AI Quick Capture (F1), Clerk client UI, task sharing, JSON import.
- Within-stage drag reorder polish (cross-stage drag + move buttons already ship).

## Locked decisions

1. **3 tabs:** Today · Board · Profile. Focus deferred entirely (no half-built tab).
2. **Settings live inside Profile** as a tappable list (mockup-faithful), not a tab.
3. **Today aggregates across all boards** (personal agenda) → new `GET /api/tasks/today`.
   Board tab stays per-board.
4. **Profile stats use real dashboard data**, not the mockup's untracked
   Streak / Focus-hrs / On-Time.
5. **Sequencing:** merge `chore/expo-sdk-55-dnd` → `main` first; branch
   `feat/taskly-redesign` off `main`; keep `feat/clerk-auth` separate. Web first,
   then iOS. One design spec (this), two implementation plans (web, then iOS).

---

## Information architecture

| Tab | Primary content | Secondary destinations (reachable, not top-level) |
|---|---|---|
| **Today** | Today's + overdue tasks across all boards; progress ring; All/Active/Done chips; quick-add | top-bar **search** (`/api/search`) + **notifications bell** (`/api/notifications`) |
| **Board** | One board's kanban (continuous-flow), board switcher in header | header **⋯** → Members · Archived · Rename/Delete board; tap card → Task Detail |
| **Profile** | Avatar + real stats (2×2) + settings list | settings rows → Appearance (theme) · Notifications (digest) · Boards · Export · About · Sign out |

**Two board scopes, intentionally distinct:** Today is global (your day across every
board). Board is focused (one selected board). They do **not** share a "current board" —
Today never depends on which board is open.

### Web shell (`WebTodo.jsx` reference)
- 240px left sidebar: Taskly wordmark, 3 nav items (Today/Board/Profile), user footer.
- Top bar: current tab title + search icon + bell icon.
- Content column max-width ~860px.
- Under 640px: sidebar hides, fixed bottom nav appears (`.mobile-nav`).

### iOS shell (`TodoApp.jsx` reference)
- Bottom tab bar, 3 items.
- Search + bell as a small top-right icon cluster on the Today and Board headers
  (the bezel mockup omits them; they route to the existing `SearchScreen` /
  `NotificationsScreen`).

---

## Tab: Today

**Data:** `GET /api/tasks/today` (new — see API section). Returns, across all boards
the user owns or is a member of:
- tasks with `due_date == today` (any stage, not archived) — the "today" set
- plus overdue: `due_date < today AND stage != 'done' AND not archived`

**Layout** (both platforms):
- Header: eyebrow date (e.g. "Thursday, May 29") + `Today` title + **progress ring**.
  - Ring % = (tasks due today that are `done`) ÷ (tasks due today). Overdue tasks are
    listed but excluded from the ring denominator.
- Filter chips: **All / Active / Done** (client-side over the loaded set). Active =
  not done; Done = `stage == 'done'`.
- Task rows: circular checkbox (border = priority color; filled coral when done),
  title (strikethrough when done), due/relative-time, **category chip** (real color),
  priority dot. Tapping the **checkbox** toggles done (`PUT /api/tasks/:id`
  stage→done/backlog + `completed_at`). Tapping the **row body** opens Task Detail.
- Overdue tasks are visually flagged (e.g. red due badge) and sorted to the top.
- **Quick-add:** web modal / iOS bottom-sheet with a single title field. Creates a
  task (`POST /api/tasks`) on the user's default board, `stage: 'backlog'`,
  `due_date: today`. Full detail is set by opening the task afterward. (Forward-compat
  with AI Quick Capture, which will replace the single field.)

**Priority mapping:** schema is `none/low/medium/high`. `none` → gray/no dot.
Mockup's 3-level `high/med/low` maps to `high/medium/low`.

---

## Tab: Board

**Data:** existing `GET /api/tasks?board=N`, `GET /api/boards`, `/memberships`,
`/members`, `/categories`.

**Header = board switcher:** the mockup's static "Sprint 14 / Board" becomes:
- Board name + chevron → sheet/dropdown listing **My Boards** and **Shared with me**
  (from `/api/boards` + `/api/boards/memberships`), with **+ New Board**
  (`POST /api/boards`).
- `% done` pill + gradient progress bar computed from real stage counts of the open
  board.
- **⋯ overflow** → **Members** (existing `BoardMembersScreen` / web members modal:
  invite, revoke, remove), **Archived** (existing archived view: restore/delete),
  **Rename** (`PUT /api/boards/:id`), **Delete** (`DELETE /api/boards/:id`).

**Kanban — continuous vertical flow** (already shipped on iOS, new layout for web):
- Stage dividers: colored dot + UPPERCASE label + count, for `Backlog / In Progress /
  Done`.
- Cards: priority bar, title, category chip + due, and `← Back` / `Move →` buttons
  (`PUT /api/tasks/:id` stage change; web reuses existing move logic, iOS reuses
  `onMoveStage`). Cross-stage **drag** remains on iOS (reanimated-dnd); web keeps its
  existing drag or move-buttons — buttons are the guaranteed path on both.
- **Tap card → Task Detail** (web in-place panel; iOS `TaskDetailScreen` modal) with
  the full existing field set: status/notes, recurrence, assignee, calendar
  (`cal_start`/`cal_end`), subtasks, category (create/delete), priority, due, archive,
  delete.

**Categories** are the tag chips. `TagChip` takes the category's **real color**
(`categories.color`), not a hardcoded map. Category management stays in Task Detail
(create/delete), matching current behavior.

---

## Tab: Profile

**Data:** existing `GET /api/dashboard`, `GET /api/user`, `PUT /api/user/digest`.

- Avatar (initials, gradient) + real name (`/api/user`).
- **2×2 stats grid, real data:** **Done** (`stats.done_total`), **This week**
  (`stats.completed_week`), **Open** (`counts.open`), **Overdue** (`counts.overdue`).
- **Settings list** (rows with chevrons) wired to real settings:
  - **Appearance** → light/dark theme toggle (existing theme system; tokens get dark
    variants).
  - **Notifications** → digest frequency picker (`none/daily/weekly/fortnightly` via
    `PUT /api/user/digest`).
  - **Boards** → board management (same surface as Board ⋯, listed here too).
  - **Export Data** → `GET /api/export`.
  - **About** → static info.
  - **Sign out** → `POST /auth/logout`.
- Mockup's "Integrations" row is dropped (no integrations exist).

---

## New API

### `GET /api/tasks/today`
`requireAuth`. Returns today's + overdue tasks across all boards the user owns or is a
member of, shaped for display.

```sql
SELECT t.id, t.text, t.stage, t.due_date, t.priority, t.status,
       t.board_id, b.name AS board_name,
       c.name AS cat_name, c.color AS cat_color,
       t.completed_at
FROM tasks t
JOIN boards b ON b.id = t.board_id
LEFT JOIN categories c ON c.id = t.category_id
WHERE (b.owner_user_id = $1 OR EXISTS (
        SELECT 1 FROM board_members bm
        WHERE bm.board_id = b.id AND bm.member_user_id = $1))
  AND (t.archived IS NULL OR t.archived = false)
  AND (
        t.due_date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')          -- due today, any stage
     OR (t.due_date < TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')         -- overdue
         AND t.stage != 'done')
  )
ORDER BY t.due_date ASC, t.priority DESC;
```

(`due_date` is stored as `YYYY-MM-DD` text — compare as text against
`TO_CHAR(CURRENT_DATE,...)`, consistent with existing code.) Response also lets the
client compute the ring: `dueToday = rows where due_date == today`,
`doneToday = those with stage == 'done'`.

Covered by the Vitest + pg-mem harness (`docs/testing.md`): seed two boards (one
owned, one shared), tasks due today / overdue / future / archived, assert the endpoint
returns exactly the today+overdue set with board and category joins.

---

## Design system

One shared token set (from the mockups):

| Token | Value |
|---|---|
| accent | `#FF6B47` |
| accent hover/active | `#E8522E` |
| page bg | `#F2F2F7` (web) / `#F7F7FA` (iOS screen) |
| card bg | `#FFFFFF` |
| text primary | `#1E1E2E` |
| priority high/med/low | `#FF6B47` / `#F59E0B` / `#9CA3AF` (`none` → `#9CA3AF`/hidden) |

Shared component concepts (implemented per platform): **ProgressRing** (SVG arc),
**TagChip** (category color → tinted bg + text), **priority dot/bar**, **task card**,
**stage divider**, **filter chip**, **bottom-sheet/modal add**. Dark theme: each token
gets a dark variant; the existing theme toggle drives it.

---

## Implementation notes

### Web (`public/`)
- **Files:** `index.html` (sidebar + top bar + bottom-nav markup), `app.css`
  (token-based restyle), `app.js` (render + nav state). `login.html`/`login.js`
  restyled to match but functionally unchanged.
- **CSP:** no inline `onclick`. Every handler is `data-action="fn"` registered in
  `app.js`'s `__actions` object (see `docs/frontend.md`). The mockup's inline React
  handlers are **not** portable — reimplement as delegated handlers.
- `app.js` is ~1900 lines in one file. Keep the single-file + `__actions` pattern, but
  organize the new render layer into clear per-tab render functions
  (`renderToday`, `renderBoard`, `renderProfile`) so each is independently legible.
- Preserve the instant-paint cache and keyboard shortcuts described in
  `docs/frontend.md`.

### iOS (`ios-app/`)
- **New nav:** replace the imperative stack root with a 3-item bottom tab navigator
  (Today / Board / Profile). Existing screens become reachable destinations:
  `BoardListScreen` logic → board switcher sheet; `BoardMembersScreen`,
  `ArchivedScreen`, `TaskDetailScreen`, `SearchScreen`, `NotificationsScreen`,
  `DashboardScreen`, `SettingsScreen` are pushed from within tabs (Dashboard folds
  into Profile; Settings folds into Profile's list).
- New shared RN components: `ProgressRing`, `TagChip`, restyled `TaskCard`, tab bar.
- Board tab reuses the shipped continuous-flow + reanimated-dnd drag + move buttons.
- JS-only changes ship via `eas update` (OTA); native nav changes need a build.

### Branches & order
1. Merge `chore/expo-sdk-55-dnd` → `main` (drag validated). **`main` is prod** —
   confirm no migration/env prereqs (there are none for the drag branch beyond SDK 55,
   already validated on build 15).
2. Branch `feat/taskly-redesign` off `main`.
3. Web redesign (incl. the new `/api/tasks/today` endpoint + test) → PR → review.
4. iOS redesign → PR → review.
5. `feat/clerk-auth` proceeds independently.

---

## Risks

- **Web is a large single-file rewrite** of the render layer — mitigate by keeping the
  `__actions` pattern and splitting render functions; ship behind a PR off `main`, not
  incremental commits to prod.
- **iOS nav change** (stack → tabs) is structural and needs a build, not OTA — validate
  on TestFlight before merge.
- **Today cross-board endpoint** adds the only new server surface — keep it read-only
  and fully covered by the pg-mem harness.
- **Parity drift** — web ships first; the iOS plan must mirror the same IA decisions
  (this spec is the shared source of truth).
