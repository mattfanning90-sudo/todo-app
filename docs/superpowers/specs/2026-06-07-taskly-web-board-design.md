# Taskly Web — Format Alignment + Responsive Board — Design Spec

_2026-06-07._

## Overview

Bring the **web** client (`public/`) into exact alignment with the user's Taskly mockup
(`WebTodo.jsx`) and rebuild the **Board** as a responsive kanban: side-by-side columns on
desktop/iPad, a vertical stacked flow on phones, with a proper drag-and-drop engine
(**SortableJS**, vendored) plus the accessibility layer WCAG requires. Web only — iOS
mirrors this later.

Decision basis: a deep-research pass (2026-06-07, 100 agents / 22 verified claims) on
production-grade DnD for a no-build, strict-CSP, touch+mouse, responsive vanilla-JS kanban.
Verdict: vendor **SortableJS v1.15.7** (single ~45KB `Sortable.min.js`, confirmed free of
`eval`/`new Function`, CSP `script-src 'self'`-safe), responsive layout is pure CSS with the
same engine in both layouts, and the accessibility (keyboard + screen-reader) layer must be
hand-rolled either way.

## Goals

- Web app reads as the Taskly mockup: coral accent, rounded white cards, the clean top bar
  (title + search + bell), 3-tab sidebar (Today / Board / Profile), progress rings.
- Board: **3 columns side-by-side** on desktop/iPad, **vertical stack** on phones — one DOM,
  switched by CSS.
- Real per-task features ride on the clean card as muted badges (assignee, subtasks,
  recurrence, due/overdue), shown only when present.
- Drag cards between columns + reorder within, on mouse **and** touch.
- Meet **WCAG 2.2 SC 2.5.7 (AA)**: a non-drag alternative (the `← / →` move buttons) +
  keyboard + an `aria-live` announcement on every move.

## Non-goals

- iOS (`ios-app/`) — separate follow-up, mirrors this.
- The Focus tab (deferred; 3 tabs).
- New server endpoints — moves persist via the **existing** `POST /api/reorder` +
  `PUT /api/tasks/:id`.
- Within-card detail redesign — tapping a card still opens the existing detail panel.

## Locked decisions

1. **Match the mockup's visual format** (top bar, sidebar, cards, Today, Profile).
2. **Responsive Board:** columns ≥ breakpoint, vertical stack below it (CSS-only switch).
3. **DnD = vendored SortableJS** (`public/vendor/Sortable.min.js`, v1.15.7), `group:'kanban'`.
4. **Move buttons stay** (WCAG AA non-drag alternative) + keyboard + `aria-live` region.
5. Web first; 3 tabs.

---

## Format alignment (to the mockup)

| Surface | Current build | Align to mockup |
|---|---|---|
| **Top bar** | slim bell-only strip (post header-cleanup) | restore the clean white top bar: current tab title (left) + **search** + **bell** icons (36px rounded), per `WebTodo.jsx` |
| **Sidebar** | wordmark + 3 nav + footer | keep; add the `Menu` label + footer "plan" line to match |
| **Today** | ring + chips + rows | already matches; verify spacing/tokens |
| **Profile** | real stats + settings list (different layout) | adopt the mockup's layout: avatar card (avatar + name + role + Edit) + 2×2 stat grid + settings list — with **real data** (Done / This week / Open / Overdue) slotted into the mockup's grid |
| **Board** | continuous vertical flow + old custom drag | **rebuilt** — see below |

The top bar is the main format regression to undo; the rest is token/spacing fidelity.

---

## The Board

### Layout — responsive, one DOM

- **Container:** a flex/grid row of three `.tk-col` columns (Backlog / In Progress / Done),
  each a vertical card list. Board content widens beyond the 860px reading column
  (to ~1180px) so columns breathe.
- **Desktop / iPad (≥ ~760px):** `grid-template-columns: repeat(3, 1fr)`, columns side by side.
- **Phone (< ~760px):** `@media` flips the container to `flex-direction: column` — the three
  columns stack into the vertical continuous flow. **Same DOM, same Sortable instances** — no
  interaction-mode swap.
- Each column: header (colored dot + UPPERCASE stage label + count pill + `+` quick-add) and a
  `.tk-col-list` (`<ul>`) holding the cards.

### Card

Per the approved mockup: a `.tk-card` with priority bar (top), title, and a meta row carrying
**only the badges the task actually has** —
- **category** tag chip (real category color),
- **subtasks** → `2/5` checklist badge,
- **recurrence** → small repeat ↻ icon,
- **assignee** → 20px gradient-initials avatar,
- **due** → right-aligned; **overdue** in red.

A drag **handle** region (the card body) so a tap on a button/avatar doesn't start a drag.
Tapping the card body (not a control) opens the existing **task detail** panel. The
`← Back` / `Move →` buttons remain on every card (see Accessibility).

### Drag-and-drop — SortableJS

- **Vendor:** download `Sortable.min.js` v1.15.7 from the npm tarball → `public/vendor/Sortable.min.js`;
  load via `<script src="/vendor/Sortable.min.js" defer></script>` in `index.html`. Confirmed
  CSP-safe (`script-src 'self'`, no `eval`/`new Function` — re-grep the exact vendored file
  before shipping). Its drag-mirror uses inline styles, which our CSP already permits
  (`style-src 'self' 'unsafe-inline'`, see `docs/frontend.md`).
- **Init:** after the board renders, `Sortable.create()` on each of the 3 `.tk-col-list`
  `<ul>`s with `{ group: 'kanban', animation: 150, handle: '.tk-card-body',
  forceFallback: true, fallbackOnBody: true, onEnd }`.
  - `group:'kanban'` (shared) → cards move **between** columns and **reorder within**.
  - `forceFallback:true` + `touch-action:none` on cards → avoids iOS-Safari page-scroll
    jitter (research gotcha).
  - `handle:'.tk-card-body'` → taps on the move buttons / avatar don't start a drag.
- **Persist on `onEnd`** (not `onSort`): read the target column's `data-stage` and the card's
  new index, then call the **existing** APIs — `PUT /api/tasks/:id` for the stage change and
  `POST /api/reorder` for the new ordering. Reuse the current `moveToStage` / `saveOrder`
  logic; SortableJS replaces only the drag mechanics, not the persistence.
- Remove the old hand-rolled drag (`setupTouchDrag`, `setupColumnDrop`, `applyDrop`, the ghost
  overlay, `resolveStageFromBounds`-style math) — SortableJS supersedes it.

### Accessibility (required, hand-rolled)

WCAG 2.2 SC 2.5.7 (AA) requires a single-pointer non-drag path; W3C's literal example is a
kanban with arrow buttons. So:
- The **`← Back` / `Move →` buttons stay on every card** (in stacked phone mode they read as
  up/down; in columns as left/right) — already CSP-clean via `data-action`. They are the
  required non-drag alternative, not just a phone affordance.
- **Keyboard:** the move buttons are real `<button>`s (focusable, Enter/Space activate). No
  separate page-wide keyboard-drag mode for v1 — the move buttons satisfy AA.
- **`aria-live="polite"`** visually-hidden region (one per app), updated on **every** move
  (drag OR button): `"<task title> moved to <target stage> from <source stage>"`. Wire it into
  the single `onEnd`/`moveToStage` path so drag and button moves both announce.

---

## Architecture / integration

Stays within the existing vanilla-JS conventions (`docs/frontend.md`):
- **`public/index.html`** — restore the top bar markup; add the `<script>` for the vendored
  Sortable; the board container/columns markup.
- **`public/app.css`** — `.tk-col*` column styles + the `@media` stack switch; top-bar restyle;
  Profile layout.
- **`public/app.js`** (the IIFE) — render the 3-column board DOM; `initSortable()` called after
  each board render; `onEnd` → existing persistence; `announce(msg)` helper for the live region;
  move buttons keep their `data-action` handlers. All new handlers registered in `__actions`.
- **`public/vendor/Sortable.min.js`** — the vendored library (new file).

No server changes. No new endpoint. The board's data still comes from `GET /api/tasks?board=N`
and persists via `POST /api/reorder` + `PUT /api/tasks/:id`.

## Testing

- **Server:** unchanged → existing Vitest suite stays green (`npm test`).
- **CSP regression:** the `tests/health.test.js` CSP assertions must still pass; confirm the new
  `<script src="/vendor/Sortable.min.js">` is `'self'` (no inline). Re-grep the vendored file for
  `eval(`/`new Function` = 0 before commit.
- **Frontend DOM:** no automated harness (per `docs/testing.md`) → manual browser pass:
  desktop columns + drag between/within; resize to phone width → vertical stack, drag still
  works; move buttons move + announce; iOS Safari touch drag (forceFallback) doesn't jitter;
  keyboard tab-to-button + Enter moves + announces; tap card → detail opens.

## Risks

- **iOS Safari touch** — the known SortableJS rough edge; `forceFallback` + `touch-action:none`
  is the mitigation, but it needs a real-device check (manual QA).
- **~45KB** added to first load — acceptable (one-time, cached; the instant-paint cache is for
  task data, not libs), but note it.
- **Removing the old drag** touches `app.js`'s board path — do it as one PR off `main`, manual
  QA before merge (`main` is prod).
- **Vendored-file drift** — pin v1.15.7; re-verify eval-free on any future bump.
