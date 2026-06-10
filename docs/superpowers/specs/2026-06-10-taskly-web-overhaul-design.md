# Taskly Web Overhaul + Today Click-into-Detail — Design

**Status:** Approved direction (visual companion, 2026-06-10). Decisions: add-task = **A** (slim top bar); Today detail = **A** (detail sheet/modal).

**Goal:** Finish aligning the web app to the approved Taskly mockup by removing the leftover pre-redesign chrome on the Board, and make Today tasks openable so their subtasks are reachable.

## Scope

**In scope (web, `public/`):**
1. Board overhaul — replace the old add-task row, restyle column headers + cards to the mockup.
2. Today click-into-detail — tapping a Today row opens a detail sheet with subtasks.

**One small server change:** `/api/tasks/today` must also return `subtasks` (additive field; see Feature 2).

**Out of scope (call out, don't build):**
- Unifying the Board card's inline `.status-panel` with the new Today detail sheet (Board keeps its current panel).
- The calendar / Google-Calendar / iCal feature (separate sub-project B).
- Any change to drag-and-drop, auth, or the data model beyond the additive `subtasks` field.

---

## Feature 1 — Board overhaul (`#screen-board`)

The board header (`.tk-board-head`: switcher + `Board` h1 + `% done` pill + ⋯) and the progress bar (`.tk-board-bar`) **already match the mockup — keep them.** The changes:

### 1a. Slim quick-add bar (replaces `.add-task-row`)
- Remove the current `.content-top > .add-task-row` (the `#task-input` + blue `.btn-add-task` "Add Task" + `.import-toggle-btn` "Import") and the always-present `.import-panel` from that spot.
- Add a **slim quick-add bar** directly under the progress bar: a single full-width input (`#task-input`, placeholder `Add a task… (try 'dentist Thursday 2pm')`) and a trailing **accent "+" button** (`data-action="addTask"`). Enter in the input also adds (existing behavior).
- **Behavior unchanged:** still calls the existing `addTask()` → natural-language parse preserved. No new endpoint.

### 1b. Import → ⋯ overflow menu
- Add an **Import** item to the existing board overflow menu (`#tk-overflow-menu`): `<button data-action="openImport">Import</button>`.
- `openImport` opens the existing import panel as a **centered modal** (reuse the existing `#import-panel` markup/handlers — `importTasks`, `clearImport` — just relocate it into a modal overlay shown/hidden by `openImport`/an `×`/backdrop). No logic change to import itself.

### 1c. Column headers (dot + label + count)
- Replace each column's **colored top-bar** with the Taskly header: a small **dot**, an **UPPERCASE label**, and a right-aligned **count pill**.
- Stage colors (dot + label): **Backlog** `#64748B`, **In Progress** `#FF6B47` (accent), **Done** `#10B981`.

### 1d. Cards
- Align `.task-card` to the mockup: thin **priority bar** (color by priority), title, then a meta row with the **tag chip** (category) and **due** text. This is largely a spacing/color tidy of the existing card; no data changes.

---

## Feature 2 — Today click-into-detail (`#screen-today`)

### 2a. Row interaction (`todayRow`)
- **Keep** the round `.tk-check` as the complete toggle (`toggleTaskDone`) — unchanged.
- Make the **`.tk-task-main` body tappable** → `data-action="openTaskSheet"` with the task id. (The check button stays a separate target; tapping it must NOT open the sheet — it already `stopPropagation`s its own action via the delegated handler, but the sheet action lives on `.tk-task-main`, not the row, so the two targets don't overlap.)

### 2b. Detail sheet (`openTaskSheet(taskId)`)
A centered **modal sheet** (`#task-sheet`, hidden by default; backdrop + `×` close), rendered from the task already in `todayTasks`:
- **Header:** task title + close `×`.
- **Chips (read-only):** board name, category (`cat_name`/`cat_color`), priority.
- **Editable:** due date via the **existing calendar picker** (`openDatePicker` + hidden input, reused), priority (small 4-option selector: none/low/medium/high), status note (text input).
- **Subtasks:** list with a checkbox per item (toggle done), inline remove (×), and an "Add subtask…" input + "+". Mirrors the Board card's subtask logic (toggle/add/remove operate on the in-memory task, then persist).
- **Persistence:** every edit (`due_date`, `priority`, `status`, `subtasks`) issues `PUT /api/tasks/:id?board=<board_id>` with the changed field(s) (existing endpoint). On success, update the in-memory `todayTasks` entry and re-`paintToday()` so the row reflects changes (due badge, etc.).

### 2c. Server change (necessary, additive)
The `/api/tasks/today` SELECT (`server.js:832`) currently omits `subtasks`, so the sheet can't show them. **Add `t.subtasks`** to that SELECT list. Additive only — existing `tasks-today.test.js` assertions (board_name / cat_color / priority keys) are unaffected; add an assertion that `subtasks` is present.

---

## Architecture / files

| File | Change |
|---|---|
| `public/index.html` | Quick-add bar markup; add Import item to `#tk-overflow-menu`; wrap `#import-panel` in a modal overlay; add `#task-sheet` modal container. |
| `public/app.js` | `addTask` wiring to the new bar (mostly unchanged); `openImport`/close; `openTaskSheet(taskId)` + sheet render + subtask/due/priority/status handlers; register all in `__actions`. |
| `public/app.css` | Taskly styles: `.tk-quick-add` bar, dot column headers, card tidy, `#task-sheet` sheet + backdrop, subtask rows. |
| `server.js` | Add `t.subtasks` to the `/api/tasks/today` SELECT (one field). |
| `tests/tasks-today.test.js` | Assert `subtasks` present on returned rows. |

## Design tokens (from `:root` in `app.css`)
`--tk-accent #FF6B47`, `--tk-text #1E1E2E`, `--tk-muted rgba(30,30,46,.45)`, card `#fff`, board bg `#F2F2F7`, column bg `rgba(30,30,46,.025)`. Stage colors: Backlog `#64748B`, In Progress `#FF6B47`, Done `#10B981`.

## CSP / interaction rules
- All handlers via `data-action` + `__actions` (no inline `onclick` — `script-src 'self'`, `script-src-attr 'none'`).
- Styles inline are fine (`style-src 'unsafe-inline'`).

## Error handling
- Sheet edits that fail (`apiPut` rejects) leave the modal open and the in-memory state unchanged; rely on the existing `apiFetch` error path (no silent data loss). Empty quick-add input → no-op (existing).

## Testing
- Server: `npm test` (Vitest/pg-mem) stays green; add the `subtasks`-present assertion to `tasks-today.test.js` (pg-mem returns the field fine — it's a column select, not a FILTER/date op).
- UI (quick-add bar, overflow import modal, column headers, cards, Today sheet + subtasks): browser-verified before merge (no headless browser in this harness).

## iOS parity (per cross-platform rule)
iOS already has Taskly styling and a `TaskDetailScreen`. Verify that tapping a Today task on iOS navigates to detail (subtasks visible). If the Today list rows aren't yet wired to navigate, add that wiring in the plan. The web's additive `subtasks` field on `/api/tasks/today` is harmless to the iOS client. No iOS redesign — parity check only.
