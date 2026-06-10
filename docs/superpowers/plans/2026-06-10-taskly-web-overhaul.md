# Taskly Web Overhaul + Today Click-into-Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the web Board to the approved Taskly mockup (slim quick-add bar, Import in the ⋯ menu, dot column headers, no colored bars) and make Today tasks open a detail sheet that exposes their subtasks.

**Architecture:** Frontend changes in `public/` (vanilla-JS IIFE `app.js` with `__actions`/`data-action` delegation, `index.html`, `app.css`) plus one additive server field (`subtasks` on `/api/tasks/today`). No new endpoints, no data-model change, no auth change. All handlers via `data-action` (CSP: `script-src 'self'`, `script-src-attr 'none'`).

**Tech Stack:** Node/Express (`server.js`), vanilla JS (`public/app.js`), CSS, Vitest + pg-mem.

**Spec:** `docs/superpowers/specs/2026-06-10-taskly-web-overhaul-design.md`

---

## Testing reality

The UI is browser-only — this harness has no headless browser (`docs/testing.md`). So frontend tasks gate on `node --check public/app.js` + manual browser QA, not unit tests. The **one** server-logic change (Task 1) is covered by Vitest/pg-mem. `npm test` stays green throughout as the regression gate (CSP test in `tests/health.test.js` must stay green — no inline handlers). If `npm test` crashes with a `tinyglobby`/`picomatch` error, run `npm ci` first (iCloud-sync corruption, not a code problem).

## File structure

| File | Responsibility / change |
|---|---|
| `server.js` | Add `t.subtasks` to the `/api/tasks/today` SELECT (Task 1). |
| `tests/tasks-today.test.js` | Assert `subtasks` present (Task 1). |
| `public/index.html` | Quick-add bar; Import item in `#tk-overflow-menu`; `#import-panel` wrapped in a modal; `#task-sheet` modal (Tasks 2, 4). |
| `public/app.js` | `openImport`/`closeImport`; `openTaskSheet`/`closeTaskSheet` + sheet handlers; generalize `openDatePicker`/`clearDueDate`; register actions (Tasks 2, 4, 5, 6). |
| `public/app.css` | `.tk-quick-add`, dot column headers (remove colored bars), import modal, `#task-sheet` + subtask styles (Tasks 2, 3, 4, 5, 6). |
| `ios-app/` | Parity check only (Task 7). |

---

## Task 1: Server — return `subtasks` on `/api/tasks/today`

**Files:** Modify `server.js:832`; Test `tests/tasks-today.test.js`.

- [ ] **Step 1: Add the failing assertion**

In `tests/tasks-today.test.js`, in the existing test `returns today + overdue across all boards…`, after the `expect(due).toHaveProperty('priority');` line, add:
```js
    expect(due).toHaveProperty('subtasks'); // sheet needs subtasks (pg-mem returns the column fine)
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run tests/tasks-today.test.js`
Expected: FAIL — `expected … to have property "subtasks"` (the SELECT omits it).

- [ ] **Step 3: Add `t.subtasks` to the SELECT**

In `server.js`, the `/api/tasks/today` query (around line 832) currently selects:
```js
    `SELECT DISTINCT t.id, t.text, t.stage, t.due_date, t.priority, t.status,
            t.board_id, b.name AS board_name,
            c.name AS cat_name, c.color AS cat_color, t.completed_at
```
Change the first line to include `t.subtasks`:
```js
    `SELECT DISTINCT t.id, t.text, t.stage, t.due_date, t.priority, t.status, t.subtasks,
            t.board_id, b.name AS board_name,
            c.name AS cat_name, c.color AS cat_color, t.completed_at
```

- [ ] **Step 4: Run it, watch it pass + full suite**

Run: `npx vitest run tests/tasks-today.test.js` → PASS.
Run: `npx vitest run` → all green.

- [ ] **Step 5: Commit**

```bash
git add server.js tests/tasks-today.test.js
git commit -m "feat(api): return subtasks on /api/tasks/today (Today detail sheet)"
```

---

## Task 2: Board quick-add bar + Import → overflow menu

**Files:** Modify `public/index.html` (board `.content-top`, `#tk-overflow-menu`), `public/app.js` (`__actions`, `openImport`/`closeImport`), `public/app.css`.

- [ ] **Step 1: Replace the add-task row markup**

In `public/index.html`, replace the whole `<div class="content-top"> … </div>` block (the `.add-task-row` with `#task-input` + `.btn-add-task` + `.import-toggle-btn`, and the `.import-panel`) with the slim quick-add bar **plus** the import panel relocated into a hidden modal:
```html
    <div class="tk-quick-add">
      <input id="task-input" type="text" placeholder="Add a task… (try 'dentist Thursday 2pm')" />
      <button class="tk-quick-add-btn" data-action="addTask" aria-label="Add task">+</button>
    </div>

    <div class="tk-modal-backdrop" id="import-modal" style="display:none" data-action="closeImport">
      <div class="import-panel" id="import-panel" data-action="stop">
        <div class="import-modal-head"><h3>Import from Claude</h3>
          <button class="tk-sheet-x" data-action="closeImport" aria-label="Close">×</button></div>
        <p>Ask Claude: <em>"Send these tasks to my to-do app in this format:"</em></p>
        <code>[
  { "text": "Book flight", "status": "Check dates first", "owner": "alice@gmail.com" },
  { "text": "Send report" }
]</code>
        <textarea id="import-json" placeholder="Paste JSON here…"></textarea>
        <div class="import-actions">
          <button class="btn-import" data-action="importTasks">Import</button>
          <button class="btn-clear-import" data-action="clearImport">Clear</button>
        </div>
        <div class="import-error" id="import-error"></div>
        <div class="import-success" id="import-success"></div>
      </div>
    </div>
```
(`data-action="stop"` on the panel stops backdrop clicks from closing it — that action already exists in the delegation dispatcher.)

- [ ] **Step 2: Add an Import item to the overflow menu**

In `public/index.html`, inside `#tk-overflow-menu`, add as the first item:
```html
      <button class="tk-overflow-item" data-action="openImport">Import</button>
```

- [ ] **Step 3: Replace `toggleImport` with modal open/close in `app.js`**

In `public/app.js`, replace the `toggleImport()` function (around line 867) with:
```js
  function openImport() {
    const m = document.getElementById('tk-overflow-menu'); if (m) m.style.display = 'none';
    document.getElementById('import-modal').style.display = 'flex';
  }
  function closeImport() { document.getElementById('import-modal').style.display = 'none'; }
```

- [ ] **Step 4: Update the `__actions` registry**

In `public/app.js`, in the `__actions` object (around line 2066), replace `toggleImport` with `openImport, closeImport`:
```js
    toggleNewCatForm, saveNewCategory, saveDigestFrequency, openDigestPicker, addTask, openImport, closeImport,
```

- [ ] **Step 5: CSS — quick-add bar + import modal; drop orphaned add-task-row styles**

In `public/app.css`, add (near the other `.tk-` board styles, ~line 1065):
```css
.tk-quick-add { display:flex; gap:8px; align-items:center; background:var(--tk-card,#fff); border:1px solid rgba(30,30,46,.10); border-radius:12px; padding:8px 10px 8px 14px; margin:0 0 16px; }
.tk-quick-add input { flex:1; border:none; background:none; outline:none; font-size:14px; color:var(--tk-text,#1E1E2E); }
.tk-quick-add input::placeholder { color:var(--tk-muted,rgba(30,30,46,.45)); }
.tk-quick-add-btn { width:32px; height:32px; flex-shrink:0; border:none; border-radius:9px; background:var(--tk-accent,#FF6B47); color:#fff; font-size:20px; font-weight:600; line-height:1; cursor:pointer; }
.tk-modal-backdrop { position:fixed; inset:0; background:rgba(30,30,46,.35); z-index:1000; align-items:flex-start; justify-content:center; padding:60px 16px; }
.tk-modal-backdrop .import-panel { display:block; max-width:520px; width:100%; background:var(--tk-card,#fff); border-radius:16px; box-shadow:0 16px 50px rgba(30,30,46,.2); padding:18px; }
.import-modal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
```
Then delete the now-orphaned rules: `.add-task-row` (app.css:379), `.add-task-row input`, `.add-task-row input:focus`, `.add-task-row input::placeholder`, `.btn-add-task`, `.btn-add-task:hover`, `.import-toggle-btn`, `.import-toggle-btn:hover, .import-toggle-btn.active`, the mobile `.add-task-row { flex-wrap:wrap; }` (app.css:895), and remove `.import-toggle-btn, .import-panel` from the mobile hide rule (app.css:836) — the panel now lives in a modal and must not be force-hidden.

- [ ] **Step 6: Verify + commit**

```bash
node --check public/app.js   # passes
```
Browser QA (do at the end of the plan): quick-add bar adds tasks (incl. NL parse); ⋯ → Import opens the modal; backdrop/× closes it; import still works.
```bash
git add public/index.html public/app.js public/app.css
git commit -m "feat(web): slim Taskly quick-add bar + Import in overflow menu"
```

---

## Task 3: Dot column headers (remove colored top-bars)

**Files:** Modify `public/index.html` (3 `.column-header` blocks), `public/app.css`.

- [ ] **Step 1: Add a dot span to each column header**

In `public/index.html`, in each of the three `.column-header` blocks (lines ~271, ~278, ~285), add a `<span class="column-dot"></span>` as the first child, before `.column-title`:
```html
          <div class="column-header">
            <span class="column-dot"></span>
            <span class="column-title">Backlog</span>
            <span class="column-count" id="count-backlog">0</span>
          </div>
```
(Repeat for In Progress and Done — keep their existing title/count.)

- [ ] **Step 2: CSS — dots, remove colored bars, count pill right**

In `public/app.css`, add near the `#screen-board .column-header` rules (~line 1063):
```css
#screen-board .column-header { border-top:none; }
.column-dot { width:8px; height:8px; border-radius:99px; flex-shrink:0; }
.column[data-stage="backlog"] .column-dot { background:#64748B; }
.column[data-stage="in_progress"] .column-dot { background:#FF6B47; }
.column[data-stage="done"] .column-dot { background:#10B981; }
.column[data-stage="backlog"] .column-title { color:#64748B; }
.column[data-stage="in_progress"] .column-title { color:#FF6B47; }
.column[data-stage="done"] .column-title { color:#10B981; }
#screen-board .column-count { margin-left:auto; }
```
This overrides the colored `border-top` rules at app.css:462-464 (leave those rules in place — the `border-top:none` above wins by specificity+order, and they're harmless if the redesign is ever reverted).

- [ ] **Step 3: Verify + commit**

```bash
grep -c "column-dot" public/index.html   # 3
```
Browser QA later: no colored top-bars; each column shows dot + uppercase label + count pill on the right.
```bash
git add public/index.html public/app.css
git commit -m "feat(web): Taskly dot column headers (drop colored top-bars)"
```

---

## Task 4: Today detail sheet — markup, open/close, row wiring

**Files:** Modify `public/index.html` (add `#task-sheet`), `public/app.js` (`todayRow`, `openTaskSheet`/`closeTaskSheet`, module var, `__actions`), `public/app.css`.

- [ ] **Step 1: Add the sheet container to index.html**

In `public/index.html`, just before the closing of the app shell (next to other modals like `#quickadd-modal`), add:
```html
    <div class="tk-modal-backdrop" id="task-sheet" style="display:none" data-action="closeTaskSheet">
      <div class="tk-sheet" data-action="stop"><div class="tk-sheet-body"></div></div>
    </div>
```

- [ ] **Step 2: Make the Today row body open the sheet**

In `public/app.js`, in `todayRow(t, todayStr)` (line 268), add `data-action`/`data-args` to the `.tk-task-main` div:
```js
      <div class="tk-task-main" data-action="openTaskSheet" data-args='[${t.id}]'>
```
(The `.tk-check` button keeps its own `data-action="toggleTaskDone"`; the delegation picks the closest `[data-action]`, so tapping the check toggles done and tapping the body opens the sheet — no overlap.)

- [ ] **Step 3: Add module var + open/close + a subtasks normalizer**

In `public/app.js`, near the other module-level `let` declarations at the top of the IIFE, add:
```js
  let taskSheetId = null;
```
Add these functions (place them just above `renderProfile` or near the Today functions):
```js
  const normSubs = s => Array.isArray(s) ? s : (() => { try { return JSON.parse(s || '[]'); } catch { return []; } })();

  function openTaskSheet(id) {
    const task = todayTasks.find(t => t.id === id);
    if (!task) return;
    taskSheetId = id;
    const subs = normSubs(task.subtasks);
    const prios = ['none', 'low', 'medium', 'high'];
    const body = document.querySelector('#task-sheet .tk-sheet-body');
    body.innerHTML = `
      <div class="tk-sheet-head">
        <div class="tk-sheet-title">${escapeHtml(task.text)}</div>
        <button class="tk-sheet-x" data-action="closeTaskSheet" aria-label="Close">×</button>
      </div>
      <div class="tk-sheet-chips">
        <span class="tk-sheet-chip">${escapeHtml(task.board_name || '')}</span>
        ${tagChip(task.cat_name, task.cat_color)}
      </div>
      <div class="tk-sheet-field has-due">
        <span class="tk-sheet-label">Due</span>
        <input type="hidden" class="due-date-input" value="${task.due_date || ''}">
        <button class="date-trigger ${task.due_date ? '' : 'empty'}" data-action="openDatePicker">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span class="date-trigger-label">${task.due_date ? formatTriggerDate(task.due_date) : 'Set due date…'}</span>
          <span class="date-clear-x" data-action="clearDueDate"${task.due_date ? '' : ' hidden'}>×</span>
        </button>
      </div>
      <div class="tk-sheet-field">
        <span class="tk-sheet-label">Priority</span>
        <div class="tk-prio-seg">
          ${prios.map(p => `<button class="tk-prio-opt ${task.priority === p ? 'active' : ''}" data-action="setSheetPriority" data-args='["${p}"]'>${p}</button>`).join('')}
        </div>
      </div>
      <div class="tk-sheet-field">
        <span class="tk-sheet-label">Note</span>
        <input type="text" class="tk-sheet-note" placeholder="Add a note…" value="${escapeHtml(task.status || '')}">
      </div>
      <div class="tk-sheet-subs">
        <p class="tk-sheet-label">Subtasks · ${subs.filter(s => s.done).length}/${subs.length}</p>
        <div class="tk-sheet-sublist">${subs.map(sheetSubRow).join('')}</div>
        <div class="tk-sheet-addsub">
          <input type="text" class="tk-sheet-subinput" placeholder="Add subtask…">
          <button class="tk-sheet-subadd" data-action="addSheetSub">+</button>
        </div>
      </div>`;
    const due = body.querySelector('.due-date-input');
    due.addEventListener('change', () => persistSheet({ due_date: due.value }));
    const note = body.querySelector('.tk-sheet-note');
    note.addEventListener('change', () => persistSheet({ status: note.value }));
    const si = body.querySelector('.tk-sheet-subinput');
    si.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSheetSub(); } });
    document.getElementById('task-sheet').style.display = 'flex';
  }
  function closeTaskSheet() { document.getElementById('task-sheet').style.display = 'none'; taskSheetId = null; }
  function sheetSubRow(s) {
    return `<div class="tk-sheet-sub ${s.done ? 'done' : ''}">
      <button class="tk-sheet-sub-check" data-action="toggleSheetSub" data-args='[${s.id}]'></button>
      <span>${escapeHtml(s.text)}</span>
      <button class="tk-sheet-sub-x" data-action="removeSheetSub" data-args='[${s.id}]'>×</button>
    </div>`;
  }
```

- [ ] **Step 4: Register actions**

In `public/app.js`, add to `__actions` (after `openTaskSheet`-related entries; `setSheetPriority`/`toggleSheetSub`/`removeSheetSub`/`addSheetSub`/`persistSheet` are defined in Tasks 5/6):
```js
    openTaskSheet, closeTaskSheet, setSheetPriority, addSheetSub, toggleSheetSub, removeSheetSub,
```

- [ ] **Step 5: CSS — sheet + chips + fields**

In `public/app.css`, add:
```css
#task-sheet .tk-sheet { max-width:360px; width:100%; background:var(--tk-card,#fff); border-radius:18px; box-shadow:0 16px 50px rgba(30,30,46,.2); padding:18px; max-height:84vh; overflow-y:auto; }
.tk-sheet-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.tk-sheet-title { font-size:16px; font-weight:600; color:var(--tk-text,#1E1E2E); line-height:1.3; }
.tk-sheet-x { border:none; background:none; font-size:20px; line-height:1; color:var(--tk-muted,rgba(30,30,46,.45)); cursor:pointer; }
.tk-sheet-chips { display:flex; gap:7px; flex-wrap:wrap; margin:12px 0 4px; }
.tk-sheet-chip { font-size:11px; font-weight:600; padding:3px 9px; border-radius:99px; background:rgba(30,30,46,.05); color:rgba(30,30,46,.6); }
.tk-sheet-field { margin-top:14px; }
.tk-sheet-label { display:block; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--tk-muted,rgba(30,30,46,.45)); margin-bottom:6px; }
.tk-sheet-note { width:100%; border:1px solid rgba(30,30,46,.12); border-radius:10px; padding:9px 11px; font-size:13px; }
.tk-prio-seg { display:flex; gap:6px; }
.tk-prio-opt { flex:1; text-transform:capitalize; font-size:12px; font-weight:600; padding:7px 0; border:1px solid rgba(30,30,46,.12); border-radius:9px; background:#fff; color:rgba(30,30,46,.55); cursor:pointer; }
.tk-prio-opt.active { background:rgba(255,107,71,.10); border-color:rgba(255,107,71,.4); color:#FF6B47; }
.tk-sheet-subs { margin-top:16px; }
.tk-sheet-sub { display:flex; align-items:center; gap:10px; padding:7px 0; font-size:13px; }
.tk-sheet-sub-check { width:18px; height:18px; flex-shrink:0; border:1.5px solid rgba(30,30,46,.25); border-radius:6px; background:#fff; cursor:pointer; }
.tk-sheet-sub.done .tk-sheet-sub-check { background:#FF6B47; border-color:#FF6B47; }
.tk-sheet-sub.done span { color:var(--tk-muted,rgba(30,30,46,.45)); text-decoration:line-through; }
.tk-sheet-sub span { flex:1; }
.tk-sheet-sub-x { border:none; background:none; color:rgba(30,30,46,.35); cursor:pointer; font-size:15px; }
.tk-sheet-addsub { display:flex; align-items:center; gap:8px; margin-top:8px; border-top:1px solid rgba(30,30,46,.07); padding-top:10px; }
.tk-sheet-addsub input { flex:1; border:1px solid rgba(30,30,46,.12); border-radius:9px; padding:8px 10px; font-size:12.5px; }
.tk-sheet-subadd { width:28px; height:28px; flex-shrink:0; border:none; border-radius:8px; background:rgba(255,107,71,.12); color:#FF6B47; font-weight:700; cursor:pointer; }
.tk-task-main { cursor:pointer; }
```

- [ ] **Step 6: Verify**

```bash
node --check public/app.js   # passes (note: persistSheet/setSheetPriority/addSheetSub/toggleSheetSub/removeSheetSub land in Tasks 5-6; node --check only parses, so it passes now, but DO NOT browser-test until Task 6 is done)
```
Commit happens at the end of Task 6 (the sheet isn't functional until its handlers exist).

---

## Task 5: Today sheet — subtasks add / toggle / remove

**Files:** Modify `public/app.js`.

- [ ] **Step 1: Add the subtask handlers**

In `public/app.js`, add near `openTaskSheet`:
```js
  function addSheetSub() {
    const input = document.querySelector('#task-sheet .tk-sheet-subinput');
    const text = input.value.trim();
    if (!text) return;
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks);
    const maxId = subs.length ? Math.max(...subs.map(s => s.id)) : 0;
    subs.push({ id: maxId + 1, text, done: false });
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
  }
  function toggleSheetSub(subId) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks);
    const s = subs.find(x => x.id === subId); if (!s) return;
    s.done = !s.done;
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
  }
  function removeSheetSub(subId) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    const subs = normSubs(task.subtasks).filter(x => x.id !== subId);
    task.subtasks = subs;
    persistSheet({ subtasks: subs });
    openTaskSheet(taskSheetId);
  }
```
(`persistSheet` is defined in Task 6.)

- [ ] **Step 2: Verify**

`node --check public/app.js` passes. (Functional QA after Task 6.)

---

## Task 6: Today sheet — persistence + due/priority/status; generalize the date picker

**Files:** Modify `public/app.js` (`persistSheet`, `setSheetPriority`, generalize `openDatePicker`/`clearDueDate`).

- [ ] **Step 1: Add `persistSheet` + `setSheetPriority`**

In `public/app.js`, near the sheet functions:
```js
  async function persistSheet(patch) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    if (!task) return;
    Object.assign(task, patch);
    await apiPut(`/api/tasks/${task.id}?board=${task.board_id}`, { ...patch, boardId: task.board_id });
    paintToday();
  }
  function setSheetPriority(p) {
    const task = todayTasks.find(t => t.id === taskSheetId);
    if (!task) return;
    persistSheet({ priority: p });
    openTaskSheet(taskSheetId);
  }
```

- [ ] **Step 2: Generalize the date picker to work inside the sheet**

In `public/app.js`, in `openDatePicker` (line 1486), change:
```js
    dpInput = trigger.closest('.task-card').querySelector('.due-date-input');
```
to:
```js
    dpInput = trigger.closest('.task-card, #task-sheet').querySelector('.due-date-input');
```
And in `clearDueDate` (line 1536), change:
```js
    const input = t.closest('.task-card').querySelector('.due-date-input');
```
to:
```js
    const input = t.closest('.task-card, #task-sheet').querySelector('.due-date-input');
```
(The sheet's hidden `.due-date-input` has a `change` listener wired in `openTaskSheet` that calls `persistSheet({ due_date })`; `pickDate`/`clearDueDate` dispatch `change`, so picking/clearing a date in the sheet persists to the Today task — mirroring how the board card persists.)

- [ ] **Step 3: Verify (parse + full suite)**

```bash
node --check public/app.js   # passes
npx vitest run               # green (server-only change from Task 1)
```

- [ ] **Step 4: Browser QA (the whole Today sheet)**

`DATABASE_URL=<dev> npm run dev`, sign in, go to Today:
- Tap a task's body → sheet opens with title, board + category chips, due, priority, note, subtasks.
- Round check on the row still completes (doesn't open the sheet).
- Add / toggle / remove a subtask → persists (reload Today, state holds); the row's subtask count reflects changes.
- Change due via the calendar picker → persists; the row's due badge updates.
- Change priority / note → persists.
- Backdrop / × closes the sheet.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js public/app.css
git commit -m "feat(web): Today detail sheet with subtasks, due, priority, note"
```

---

## Task 7: iOS parity check

**Files:** Read `ios-app/src/screens/TodayScreen.tsx`, `ios-app/src/navigation/*`; modify only if the wiring is missing.

- [ ] **Step 1: Check whether tapping a Today task navigates to detail**

```bash
grep -nE "navigation.navigate|TaskDetail|onPress" ios-app/src/screens/TodayScreen.tsx
```
- [ ] **Step 2:** If a Today row already navigates to `TaskDetailScreen` (which renders subtasks), parity holds → no change; note it in `docs/platform-parity-report.md`.
- [ ] **Step 3:** If it does NOT, add an `onPress` to the Today row that calls `navigation.navigate('TaskDetail', { taskId })` (matching how `BoardScreen`/`BoardListScreen` open detail). Keep the complete-toggle separate. Run `npx tsc --noEmit` and `npm test` in `ios-app/`.
- [ ] **Step 4:** Commit if changed:
```bash
git add ios-app/ docs/platform-parity-report.md
git commit -m "feat(ios): open task detail from Today (subtasks) — web parity"
```

---

## Task 8: Final regression + PR

- [ ] **Step 1: Gates**
```bash
node --check public/app.js
npx vitest run                 # all green
grep -c "onclick=" public/index.html   # 0 (CSP: no inline handlers)
```
- [ ] **Step 2: Push + PR**
```bash
git push -u origin feat/taskly-web-overhaul
gh pr create --base main --title "Taskly web overhaul + Today click-into-detail" --body "Implements docs/superpowers/specs/2026-06-10-taskly-web-overhaul-design.md: slim quick-add bar, Import in ⋯ menu, dot column headers (no colored bars), and a Today detail sheet exposing subtasks (+ due/priority/note). One additive server field (subtasks on /api/tasks/today). Browser-QA'd. main is prod."
```

---

## Self-review against the spec

- **Quick-add bar (A)** → Task 2 ✓
- **Import → overflow** → Task 2 ✓
- **Dot column headers, no colored bars** → Task 3 ✓
- **Card tidy** → folded into existing card styles; the mockup card was already close — Task 3 covers headers; cards need no structural change (priority bar/tag/due already render). ✓ (no separate task needed)
- **Today row body opens sheet; check still completes** → Task 4 Step 2 ✓
- **Sheet: title, board+category chips, due (picker), priority, note, subtasks** → Tasks 4/5/6 ✓
- **Subtasks add/toggle/remove persist** → Task 5 + persistSheet (Task 6) ✓
- **Server: subtasks on today** → Task 1 ✓
- **Category display-only** → sheet renders `tagChip` (read-only), no category editor ✓ (matches spec scope cut)
- **iOS parity** → Task 7 ✓
- **CSP / data-action** → all handlers via `__actions`; Task 8 greps for `onclick=` ✓
- **Type/name consistency:** `taskSheetId`, `normSubs`, `persistSheet`, `sheetSubRow`, `openTaskSheet`, `setSheetPriority`, `addSheetSub`, `toggleSheetSub`, `removeSheetSub` used consistently across Tasks 4-6 ✓
