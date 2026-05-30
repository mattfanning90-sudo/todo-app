# Taskly Redesign — Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the web client (`public/`) to the Taskly look and a 3-tab IA — Today · Board · Profile — preserving every existing feature, and add the cross-board `GET /api/tasks/today` endpoint that the Today tab needs.

**Architecture:** One new read endpoint on the existing Express server (TDD via Vitest + pg-mem). The frontend stays framework-free: vanilla JS in `public/app.js` (a single IIFE with a `__actions` data-action registry), styles in `public/app.css`, markup in `public/index.html`. The IA change is mostly **reorganization + CSS** — the kanban keeps its column/list DOM (so existing drag + `createTaskCard` logic is untouched) and gains the continuous-flow *look* via CSS; Today and Profile are new screen containers; a small `showTab()` router toggles the three screens.

**Tech Stack:** Node/Express, vanilla JS (no build), CSS custom properties, Vitest + pg-mem + supertest.

**Spec:** `docs/superpowers/specs/2026-05-31-taskly-redesign-design.md`.

---

## Testing reality (read first)

- **Server logic is TDD** — `GET /api/tasks/today` gets a real failing-then-passing test in the pg-mem harness (Task 1).
- **Frontend DOM has no unit harness** (see `docs/testing.md` → "What isn't covered"). Frontend tasks use **manual browser verification** with exact click-through steps, and every task ends by running `npm test` to keep the server suite + CSP tests green as the regression gate.
- **CSP constraint:** `script-src-attr 'none'` blocks inline `onclick`. Every handler is `data-action="fnName"` registered in the `__actions` object near the bottom of `app.js` (see `docs/frontend.md`). The provided React mockups use inline handlers — they are **visual reference only**.

**Running the app for manual checks:** the app needs a dev Postgres. `DATABASE_URL=<dev-postgres> npm run dev`, then open `http://localhost:3000`. Sign up a fresh account at `/login` (this seeds a default "My Board" + 6 categories via `ensureDefaultBoard`/`DEFAULT_CATEGORIES`). Tests do **not** need a DB (pg-mem).

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `server.js` | API | **Modify** — add `GET /api/tasks/today` after `/api/tasks/count` (~line 797) |
| `tests/tasks-today.test.js` | endpoint test | **Create** |
| `public/app.css` | styles | **Modify** — add Taskly design tokens + `.tk-*` component classes; restyle shell, board (continuous flow), cards |
| `public/index.html` | markup | **Modify** — sidebar → 3-tab nav + wordmark + user footer; main → 3 screen containers; add bottom-nav + quick-add modal |
| `public/app.js` | behavior | **Modify** — add `showTab()` router, `progressRing()`/`tagChip()` helpers, `renderToday()`, board continuous-flow render tweak + header, `renderProfile()`, new `__actions` entries; retire dead sidebar view-tab buttons |

---

## Task 1: Backend — `GET /api/tasks/today` (TDD)

**Files:**
- Create: `tests/tasks-today.test.js`
- Modify: `server.js` (insert after the `/api/tasks/count` handler, ~line 797)

**Endpoint contract:** returns today's + overdue, not-done, not-archived tasks across **every board the user owns or is a member of**, with `board_name` and category fields for display. `due_date` is `YYYY-MM-DD` **text**, so we pass today's date as a JS-computed param and compare as strings (ISO dates sort lexicographically — pg-mem-safe, no `TO_CHAR`). The `due_date <> ''` guard is essential: the default `due_date` is `''`, and `'' < '2026-05-31'` is true, so without the guard every dateless task would look "overdue".

- [ ] **Step 1: Write the failing test**

Create `tests/tasks-today.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { signupAndAgent } from './helpers/agent.js';

const isoOffset = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('GET /api/tasks/today', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/tasks/today');
    expect(res.status).toBe(401);
  });

  it('returns today + overdue across all boards, excluding future/archived/done/dateless', async () => {
    const agent = await signupAndAgent();
    const today = isoOffset(0);
    const yesterday = isoOffset(-1);
    const tomorrow = isoOffset(1);

    // Second board (owned). First POST /api/tasks below lazily creates the default board.
    const b2 = await agent.post('/api/boards').send({ name: 'Work' });
    expect(b2.status).toBe(200);
    const board2 = b2.body.id;

    await agent.post('/api/tasks').send({ text: 'Due today' });              // default board, set due below
    // set due_date=today via the create payload instead:
    const t1 = await agent.post('/api/tasks').send({ text: 'Due today board1', due_date: today });
    const t2 = await agent.post('/api/tasks').send({ text: 'Overdue board2', due_date: yesterday, boardId: board2 });
    await agent.post('/api/tasks').send({ text: 'Future', due_date: tomorrow });
    await agent.post('/api/tasks').send({ text: 'No due date' });            // due_date '' → excluded
    const done = await agent.post('/api/tasks').send({ text: 'Old but done', due_date: yesterday });
    await agent.put(`/api/tasks/${done.body.id}`).send({ stage: 'done' });   // overdue+done → excluded

    const res = await agent.get('/api/tasks/today');
    expect(res.status).toBe(200);
    const texts = res.body.map(r => r.text).sort();
    expect(texts).toEqual(['Due today board1', 'Overdue board2']);

    const due = res.body.find(r => r.text === 'Due today board1');
    expect(due).toHaveProperty('board_name');
    expect(due).toHaveProperty('cat_color'); // null is fine; key must exist
    expect(due).toHaveProperty('priority');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/tasks-today.test.js`
Expected: FAIL — the auth test passes incidentally (unknown route returns 401? no — unmatched routes 404). Both fail because the route doesn't exist yet (404, not 401/200).

- [ ] **Step 3: Implement the endpoint**

In `server.js`, immediately after the `/api/tasks/count` handler (the `}));` around line 797), insert:

```js
app.get('/api/tasks/today', requireAuth, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { rows } = await pool.query(
    `SELECT t.id, t.text, t.stage, t.due_date, t.priority, t.status,
            t.board_id, b.name AS board_name,
            c.name AS cat_name, c.color AS cat_color, t.completed_at
       FROM tasks t
       JOIN boards b ON b.id = t.board_id
       LEFT JOIN categories c ON c.id = t.category_id
      WHERE (b.owner_user_id = $1 OR EXISTS (
               SELECT 1 FROM board_members bm
                WHERE bm.board_id = b.id AND bm.member_user_id = $1))
        AND (t.archived IS NULL OR t.archived = false)
        AND (
              t.due_date = $2
           OR (t.due_date <> '' AND t.due_date < $2 AND t.stage <> 'done')
        )
      ORDER BY t.due_date ASC`,
    [req.user.id, today]
  );
  res.json(rows);
}));
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/tasks-today.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: all green (previous count + 2).

- [ ] **Step 6: Commit**

```bash
git add server.js tests/tasks-today.test.js
git commit -m "feat(api): add GET /api/tasks/today (cross-board today + overdue)"
```

---

## Task 2: Design tokens + shared component CSS

**Files:**
- Modify: `public/app.css` (add a tokens block near `:root`, plus `.tk-*` classes; keep existing `--primary` etc. so nothing breaks mid-migration)

The app already uses CSS custom properties and a `[data-theme="dark"]` toggle. Add Taskly tokens as new variables (don't rip out the old ones yet — screens migrate incrementally).

- [ ] **Step 1: Add tokens**

Add to `public/app.css` inside the existing `:root { … }`:

```css
:root {
  /* Taskly tokens */
  --tk-accent: #FF6B47;
  --tk-accent-hover: #E8522E;
  --tk-bg: #F2F2F7;
  --tk-card: #FFFFFF;
  --tk-text: #1E1E2E;
  --tk-muted: rgba(30,30,46,0.45);
  --tk-line: rgba(30,30,46,0.08);
  --tk-prio-high: #FF6B47;
  --tk-prio-med: #F59E0B;
  --tk-prio-low: #9CA3AF;
  --tk-shadow: 0 1px 4px rgba(30,30,46,0.06);
  --tk-radius: 16px;
}
[data-theme="dark"] {
  --tk-bg: #16161D;
  --tk-card: #1E1E28;
  --tk-text: #F2F2F7;
  --tk-muted: rgba(242,242,247,0.5);
  --tk-line: rgba(255,255,255,0.08);
}
```

- [ ] **Step 2: Add shared component classes**

Append to `public/app.css`:

```css
/* Taskly primitives */
.tk-chip { font-size:11px; font-weight:600; letter-spacing:.04em; padding:2px 8px;
  border-radius:99px; white-space:nowrap; display:inline-block; }
.tk-prio-dot { width:7px; height:7px; border-radius:99px; flex:0 0 auto; }
.tk-card { background:var(--tk-card); border:1px solid var(--tk-line);
  border-radius:var(--tk-radius); box-shadow:var(--tk-shadow); }
.tk-ring-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
.tk-ring-label { position:absolute; text-align:center; }
.tk-filter-chip { padding:7px 16px; border-radius:99px; font-size:13px; font-weight:600;
  cursor:pointer; background:rgba(30,30,46,.06); color:var(--tk-muted); border:none;
  display:inline-flex; align-items:center; gap:6px; }
.tk-filter-chip.active { background:var(--tk-accent); color:#fff; }
.tk-divider { display:flex; align-items:center; gap:8px; padding:24px 0 12px; }
.tk-divider .dot { width:8px; height:8px; border-radius:99px; flex:0 0 auto; }
.tk-divider .label { font-size:11px; font-weight:700; letter-spacing:.07em;
  text-transform:uppercase; }
.tk-divider .count { font-size:11px; font-weight:600; color:var(--tk-muted);
  background:rgba(30,30,46,.06); padding:1px 8px; border-radius:99px; }
.tk-divider .rule { flex:1; height:1px; background:var(--tk-line); }
```

- [ ] **Step 3: Manual verify (no break)**

`DATABASE_URL=<dev> npm run dev`, open `http://localhost:3000`. The app should look unchanged (new tokens unused so far). Toggle theme — still works.

- [ ] **Step 4: Commit**

```bash
git add public/app.css
git commit -m "feat(web): add Taskly design tokens + primitive CSS classes"
```

---

## Task 3: App shell — 3-tab nav + screen router

**Files:**
- Modify: `public/index.html` (sidebar contents; wrap board in a screen container; add Today/Profile containers; add bottom-nav)
- Modify: `public/app.js` (add `currentTab` state + `showTab()` + `gotoTab` action; register in `__actions`)
- Modify: `public/app.css` (sidebar wordmark/nav-item styling; `.screen` show/hide; `.tk-tabbar` bottom nav)

- [ ] **Step 1: Replace sidebar inner content**

In `public/index.html`, replace the contents of `<aside class="sidebar" id="sidebar">…</aside>` (lines ~107–177) with the Taskly wordmark + 3 nav buttons + user footer:

```html
<aside class="sidebar" id="sidebar">
  <div class="tk-wordmark">
    <span class="tk-wordmark-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
    Taskly
  </div>
  <nav class="tk-nav">
    <button class="tk-nav-item active" id="tab-today" data-action="gotoTab" data-args='["today"]'>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v3m8-3v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
      Today
    </button>
    <button class="tk-nav-item" id="tab-board" data-action="gotoTab" data-args='["board"]'>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h6v6H3zm0 8h6v6H3zm8-8h10M11 9h7M11 13h10M11 17h7"/></svg>
      Board
    </button>
    <button class="tk-nav-item" id="tab-profile" data-action="gotoTab" data-args='["profile"]'>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>
      Profile
    </button>
  </nav>
  <div class="tk-sidebar-foot">
    <span class="user-avatar" id="sidebar-avatar" aria-hidden="true">?</span>
    <div class="tk-foot-id"><div class="tk-foot-name" id="sidebar-name"></div></div>
  </div>
</aside>
```

- [ ] **Step 2: Wrap board + add screen containers**

In `public/index.html`, inside `<main class="main-content">`, wrap the existing board/archived/dashboard markup in a Board screen and add empty Today + Profile screens. Replace the `content-top`/`mobile-stage-tabs`/`board-scroll`/`archived-view`/`dashboard-view` block's outer grouping so they live under `#screen-board`:

```html
<main class="main-content">
  <section class="screen" id="screen-today"><!-- renderToday() fills this --></section>

  <section class="screen active" id="screen-board">
    <!-- existing content-top, mobile-stage-tabs, board-scroll, archived-view, dashboard-view stay here -->
  </section>

  <section class="screen" id="screen-profile"><!-- renderProfile() fills this --></section>
</main>
```

(Keep the existing inner board markup intact inside `#screen-board`. Dashboard/archived views will be reached from Board overflow / Profile in later tasks; leaving them inside `#screen-board` is fine for now.)

- [ ] **Step 3: Add bottom-nav (mobile)**

Before `</body>` in `index.html`, after the modals, add:

```html
<nav class="tk-tabbar" id="tk-tabbar" aria-label="Primary">
  <button class="tk-tabbar-item active" data-action="gotoTab" data-args='["today"]'>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 2v3m8-3v3M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
    <span>Today</span>
  </button>
  <button class="tk-tabbar-item" data-action="gotoTab" data-args='["board"]'>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h6v6H3zm0 8h6v6H3zm8-8h10M11 9h7M11 13h10M11 17h7"/></svg>
    <span>Board</span>
  </button>
  <button class="tk-tabbar-item" data-action="gotoTab" data-args='["profile"]'>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg>
    <span>Profile</span>
  </button>
</nav>
```

- [ ] **Step 4: Add the router to `app.js`**

Near the top state block (after `let sidebarOpen = true;`, ~line 24) add:

```js
let currentTab = 'today';
```

Add this function (place it near `updateNavActive`, ~line 193):

```js
function showTab(tab) {
  currentTab = tab;
  ['today', 'board', 'profile'].forEach(t => {
    const screen = document.getElementById('screen-' + t);
    if (screen) screen.classList.toggle('active', t === tab);
    const navItem = document.getElementById('tab-' + t);
    if (navItem) navItem.classList.toggle('active', t === tab);
  });
  document.querySelectorAll('.tk-tabbar-item').forEach((el, i) => {
    el.classList.toggle('active', ['today', 'board', 'profile'][i] === tab);
  });
  if (tab === 'today') renderToday();
  if (tab === 'profile') renderProfile();
  closeSidebarMobile();
}
function gotoTab(tab) { showTab(tab); }
```

(`renderToday`/`renderProfile` are added in Tasks 4 & 6. To keep this task runnable in isolation, add temporary no-op stubs `function renderToday(){}` and `function renderProfile(){}` now; Tasks 4 & 6 replace them.)

- [ ] **Step 5: Register actions + default tab**

Add `gotoTab` to the `__actions` object (line ~1866). At the end of `init()` (after the boot paint completes, ~line 380), add `showTab('board');` so the app opens on the Board (the existing default view) until Today is built.

- [ ] **Step 6: Add shell CSS**

Add to `public/app.css`:

```css
.screen { display:none; }
.screen.active { display:block; }
.tk-wordmark { display:flex; align-items:center; gap:10px; padding:24px 20px 16px;
  font-size:18px; font-weight:700; color:var(--tk-text); }
.tk-wordmark-icon { width:32px; height:32px; border-radius:10px; background:var(--tk-accent);
  display:flex; align-items:center; justify-content:center; }
.tk-nav { padding:0 12px; display:flex; flex-direction:column; gap:2px; }
.tk-nav-item { display:flex; align-items:center; gap:12px; width:100%; padding:10px 12px;
  border-radius:10px; border:none; background:transparent; cursor:pointer; font:inherit;
  font-size:14px; color:var(--tk-muted); text-align:left; }
.tk-nav-item.active { background:rgba(255,107,71,.08); color:var(--tk-accent); font-weight:600; }
.tk-sidebar-foot { margin-top:auto; display:flex; align-items:center; gap:10px;
  padding:16px 20px; border-top:1px solid var(--tk-line); }
.tk-tabbar { display:none; position:fixed; bottom:0; left:0; right:0; z-index:50;
  background:var(--tk-card); border-top:1px solid var(--tk-line);
  padding:8px 0 20px; justify-content:space-around; }
.tk-tabbar-item { flex:1; border:none; background:none; cursor:pointer; font:inherit;
  display:flex; flex-direction:column; align-items:center; gap:4px; font-size:10px;
  color:var(--tk-muted); }
.tk-tabbar-item.active { color:var(--tk-accent); font-weight:600; }
@media (max-width:640px) {
  .sidebar { display:none !important; }
  .tk-tabbar { display:flex; }
  .main-content { padding-bottom:90px; }
}
```

- [ ] **Step 7: Manual verify**

`npm run dev`, open `http://localhost:3000`, sign in. Clicking **Board / Today / Profile** in the sidebar (and the bottom nav at narrow width) switches which `.screen` is visible (Today/Profile are empty for now; Board shows the kanban). Active styling follows the selected tab.

- [ ] **Step 8: Test + commit**

Run: `npm test` (CSP/data-action tests still green).
```bash
git add public/index.html public/app.js public/app.css
git commit -m "feat(web): Taskly 3-tab shell + screen router"
```

---

## Task 4: Today screen

**Files:**
- Modify: `public/app.js` (add `progressRing()`, `tagChip()`, `prioColor()`, real `renderToday()`, quick-add handlers; register actions)
- Modify: `public/index.html` (add quick-add modal)
- Modify: `public/app.css` (today rows, ring, quick-add)

- [ ] **Step 1: Add shared render helpers to `app.js`**

Add near the other small helpers (e.g. after `safeColor`, ~line 1266):

```js
function prioColor(p) {
  return p === 'high' ? 'var(--tk-prio-high)'
       : p === 'medium' ? 'var(--tk-prio-med)'
       : p === 'low' ? 'var(--tk-prio-low)'
       : 'var(--tk-prio-low)';
}
function tagChip(name, color) {
  if (!name) return '';
  const c = safeColor(color || '#888');
  return `<span class="tk-chip" style="background:${c}1a;color:${c}">${escapeHtml(name)}</span>`;
}
function progressRing(pct, size = 80, stroke = 6) {
  const r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const off = circ * (1 - (pct || 0) / 100);
  return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--tk-accent)" stroke-width="${stroke}"
      stroke-dasharray="${circ}" stroke-dashoffset="${off}" stroke-linecap="round"
      style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/></svg>`;
}
```

(`${c}1a` appends hex alpha `1a` ≈ 10% for the chip tint — works for 6-digit hex category colors.)

- [ ] **Step 2: Add `renderToday()` (replaces the Task 3 stub)**

```js
let todayTasks = [];
let todayFilterMode = 'all'; // 'all' | 'active' | 'done'

async function renderToday() {
  const el = document.getElementById('screen-today');
  if (!el) return;
  try {
    todayTasks = await apiFetch('GET', '/api/tasks/today');
  } catch { todayTasks = []; }
  const todayStr = new Date().toISOString().slice(0, 10);
  const dueToday = todayTasks.filter(t => t.due_date === todayStr);
  const doneToday = dueToday.filter(t => t.stage === 'done').length;
  const pct = dueToday.length ? Math.round((doneToday / dueToday.length) * 100) : 0;
  const dateLabel = new Date().toLocaleDateString(undefined,
    { weekday: 'long', month: 'long', day: 'numeric' });

  const visible = todayTasks.filter(t =>
    todayFilterMode === 'all' ? true :
    todayFilterMode === 'done' ? t.stage === 'done' : t.stage !== 'done');

  const counts = {
    all: todayTasks.length,
    active: todayTasks.filter(t => t.stage !== 'done').length,
    done: todayTasks.filter(t => t.stage === 'done').length,
  };
  const chip = (mode, label) =>
    `<button class="tk-filter-chip ${todayFilterMode === mode ? 'active' : ''}"
       data-action="setTodayFilter" data-args='["${mode}"]'>${label}
       <span style="opacity:.8;font-size:11px">${counts[mode]}</span></button>`;

  el.innerHTML = `
    <div class="tk-today-head">
      <div>
        <p class="tk-eyebrow">${dateLabel}</p>
        <h1 class="tk-h1">Today</h1>
      </div>
      <div class="tk-ring-wrap">${progressRing(pct, 80, 6)}
        <div class="tk-ring-label"><div class="tk-ring-pct">${pct}%</div>
          <div class="tk-ring-sub">done</div></div></div>
    </div>
    <div class="tk-chip-row">${chip('all','All')}${chip('active','Active')}${chip('done','Done')}</div>
    <div class="tk-today-list">
      ${visible.map(t => todayRow(t, todayStr)).join('') ||
        '<div class="tk-empty">Nothing for today 🎉</div>'}
    </div>
    <button class="tk-add-row" data-action="openQuickAdd">+ Add task…</button>`;
}

function todayRow(t, todayStr) {
  const done = t.stage === 'done';
  const overdue = !done && t.due_date && t.due_date !== '' && t.due_date < todayStr;
  return `<div class="tk-task-row ${done ? 'is-done' : ''}">
    <button class="tk-check ${done ? 'on' : ''}" style="${done ? '' : 'border-color:' + prioColor(t.priority)}"
      data-action="toggleTaskDone" data-args='[${t.id},"${done ? 'backlog' : 'done'}",${t.board_id}]'></button>
    <div class="tk-task-main">
      <div class="tk-task-title">${escapeHtml(t.text)}</div>
      <div class="tk-task-meta">
        <span class="tk-due ${overdue ? 'overdue' : ''}">${t.due_date ? formatDueDate(t.due_date) : ''}</span>
        ${tagChip(t.cat_name, t.cat_color)}
        <span class="tk-board-tag">${escapeHtml(t.board_name || '')}</span>
      </div>
    </div>
    <span class="tk-prio-dot" style="background:${prioColor(t.priority)}"></span>
  </div>`;
}
```

- [ ] **Step 3: Add filter + toggle-done handlers**

```js
function setTodayFilter(mode) { todayFilterMode = mode; renderToday(); }

async function toggleTaskDone(taskId, newStage, boardId) {
  await apiPut(`/api/tasks/${taskId}?board=${boardId}`, { stage: newStage, boardId });
  // apiFetch() already removes boot_cache_v1 on any non-GET to /api/tasks (app.js ~line 102) —
  // no manual cache call needed.
  renderToday();
}
```

- [ ] **Step 4: Add quick-add modal markup**

In `index.html`, before `</body>`:

```html
<div class="modal-overlay" id="quickadd-modal" style="display:none" data-action="closeQuickAdd">
  <div class="modal tk-card" data-action="stop" style="max-width:440px;padding:24px;">
    <div class="modal-header"><h2>New Task</h2>
      <button class="modal-close" data-action="closeQuickAdd">×</button></div>
    <input id="quickadd-input" type="text" placeholder="Task title…" autocomplete="off"
      style="width:100%;padding:14px 16px;border-radius:12px;border:1px solid var(--tk-line);
      background:var(--tk-card);color:var(--tk-text);font:inherit;font-size:15px;outline:none;" />
    <button class="tk-btn-primary" data-action="submitQuickAdd"
      style="width:100%;margin-top:12px;">Add Task</button>
  </div>
</div>
```

- [ ] **Step 5: Add quick-add handlers**

```js
function openQuickAdd() {
  const m = document.getElementById('quickadd-modal');
  m.style.display = 'flex';
  const inp = document.getElementById('quickadd-input');
  inp.value = ''; setTimeout(() => inp.focus(), 30);
}
function closeQuickAdd() { document.getElementById('quickadd-modal').style.display = 'none'; }
async function submitQuickAdd() {
  const text = document.getElementById('quickadd-input').value.trim();
  if (!text) return;
  const today = new Date().toISOString().slice(0, 10);
  await apiPost('/api/tasks', { text, stage: 'backlog', due_date: today }); // lands on default board
  closeQuickAdd();
  renderToday();
}
```

(Enter-to-submit: the global `keydown` handler should call `submitQuickAdd` when `#quickadd-modal` is open — add that branch to the existing keyboard handler, mirroring how the task-input handles Enter.)

- [ ] **Step 6: Register actions**

Add to `__actions`: `gotoTab` (already), `setTodayFilter`, `toggleTaskDone`, `openQuickAdd`, `closeQuickAdd`, `submitQuickAdd`.

- [ ] **Step 7: Add Today CSS**

```css
.tk-today-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
.tk-eyebrow { margin:0; font-size:12px; letter-spacing:.08em; text-transform:uppercase;
  font-weight:600; color:var(--tk-muted); }
.tk-h1 { margin:6px 0 0; font-size:34px; font-weight:700; letter-spacing:-.02em; color:var(--tk-text); }
.tk-ring-pct { font-size:18px; font-weight:700; color:var(--tk-text); }
.tk-ring-sub { font-size:10px; color:var(--tk-muted); }
.tk-chip-row { display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap; }
.tk-today-list { display:flex; flex-direction:column; gap:10px; }
.tk-task-row { display:flex; align-items:center; gap:14px; padding:16px 18px; min-height:64px;
  background:var(--tk-card); border:1px solid var(--tk-line); border-radius:var(--tk-radius);
  box-shadow:var(--tk-shadow); }
.tk-task-row.is-done { opacity:.55; box-shadow:none; }
.tk-check { width:26px; height:26px; border-radius:99px; flex:0 0 auto; cursor:pointer;
  border:2px solid var(--tk-prio-low); background:transparent; }
.tk-check.on { background:var(--tk-accent); border:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:center; }
.tk-task-main { flex:1; min-width:0; }
.tk-task-title { font-size:15px; font-weight:500; color:var(--tk-text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tk-task-row.is-done .tk-task-title { text-decoration:line-through; }
.tk-task-meta { display:flex; align-items:center; gap:8px; margin-top:4px; }
.tk-due { font-size:12px; color:var(--tk-muted); }
.tk-due.overdue { color:#DC2626; font-weight:600; }
.tk-board-tag { font-size:11px; color:var(--tk-muted); }
.tk-add-row { margin-top:16px; width:100%; padding:14px 18px; border-radius:var(--tk-radius);
  border:2px dashed var(--tk-line); background:transparent; cursor:pointer; font:inherit;
  font-size:14px; color:var(--tk-muted); text-align:left; }
.tk-empty { padding:32px; text-align:center; color:var(--tk-muted); }
.tk-btn-primary { padding:14px; border-radius:12px; background:var(--tk-accent); border:none;
  color:#fff; font:inherit; font-size:15px; font-weight:600; cursor:pointer; }
```

- [ ] **Step 8: Default to Today**

Change the `init()` line added in Task 3 from `showTab('board')` to `showTab('today')`.

- [ ] **Step 9: Manual verify**

`npm run dev`, sign in. On **Today**: header shows today's date + a progress ring; chips **All / Active / Done** filter the list and show counts; tasks due today/overdue across boards appear with category chip + board name + priority dot; clicking a checkbox toggles done and the ring updates; **+ Add task…** opens the modal, Enter or **Add Task** creates a task that appears in the list. Create a task on a second board with today's due date → it appears here too (cross-board).

- [ ] **Step 10: Test + commit**

Run: `npm test`
```bash
git add public/app.js public/index.html public/app.css
git commit -m "feat(web): Today tab (cross-board agenda, ring, quick-add)"
```

---

## Task 5: Board screen — continuous flow + switcher header + overflow

**Files:**
- Modify: `public/app.css` (turn `.board` into a vertical stack; restyle `.task-card`, column headers → dividers; board header)
- Modify: `public/index.html` (Board header: board name + % pill + progress bar + ⋯ overflow)
- Modify: `public/app.js` (board header render + overflow actions; reuse existing switchBoard/members/archived)

**Key decision:** keep the existing `.column` / `ul.task-list` / `getList(stage)` DOM so drag (`setupColumnDrop`, `setupTouchDrag`, `applyDrop`, `moveToStage`) and `createTaskCard` are **unchanged**. The "continuous flow" is achieved by stacking the columns vertically via CSS and restyling each column header into a stage divider.

- [ ] **Step 1: Add the Board header markup**

In `index.html`, at the top of `#screen-board` (before `content-top`), add:

```html
<div class="tk-board-head">
  <div>
    <button class="tk-board-switch" data-action="toggleBoardMenu">
      <span id="tk-board-name">My Board</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <h1 class="tk-h1">Board</h1>
  </div>
  <div class="tk-board-head-right">
    <span class="tk-done-pill" id="tk-done-pill">0% done</span>
    <button class="tk-icon-btn" data-action="openBoardOverflow" aria-label="Board options">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
    </button>
  </div>
</div>
<div class="tk-board-bar"><div class="tk-board-bar-fill" id="tk-board-bar-fill"></div></div>
<div class="tk-overflow-menu" id="tk-overflow-menu" style="display:none">
  <button class="tk-overflow-item" data-action="openMembersModal">Members</button>
  <button class="tk-overflow-item" data-action="viewArchived">Archived</button>
  <button class="tk-overflow-item" data-action="renameCurrentBoard">Rename board</button>
  <button class="tk-overflow-item danger" data-action="deleteCurrentBoard">Delete board</button>
</div>
```

(Reuse the existing `#board-menu` dropdown that `toggleBoardMenu` already drives — keep that element; just relocate/restyle. The `tk-board-switch` button reuses `toggleBoardMenu`.)

- [ ] **Step 2: Update board % + name on render**

Add a helper called whenever the board repaints (call it at the end of the existing task-render path, e.g. after `updateCounts()`):

```js
function updateBoardHead() {
  const lists = STAGES.map(s => getList(s));
  const counts = STAGES.map(s => (getList(s)?.querySelectorAll('.task-card').length) || 0);
  const total = counts.reduce((a, b) => a + b, 0);
  const donePct = total ? Math.round((counts[2] / total) * 100) : 0;
  const pill = document.getElementById('tk-done-pill');
  const fill = document.getElementById('tk-board-bar-fill');
  const nameEl = document.getElementById('tk-board-name');
  if (pill) pill.textContent = donePct + '% done';
  if (fill) fill.style.width = donePct + '%';
  if (nameEl) nameEl.textContent = currentBoard ? currentBoard.name : 'My Board';
}
```

Call `updateBoardHead()` inside `updateCounts()` (append at its end, ~line 131) so it stays in sync.

- [ ] **Step 3: Add overflow + rename/delete actions**

```js
function openBoardOverflow() {
  const m = document.getElementById('tk-overflow-menu');
  m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
async function renameCurrentBoard() {
  document.getElementById('tk-overflow-menu').style.display = 'none';
  const name = prompt('Rename board', currentBoard ? currentBoard.name : 'My Board');
  if (!name || !name.trim()) return;
  const id = currentBoard ? currentBoard.id : (await ensureBoardId());
  await apiPut(`/api/boards/${id}`, { name: name.trim() });
  location.reload();
}
async function deleteCurrentBoard() {
  document.getElementById('tk-overflow-menu').style.display = 'none';
  if (!currentBoard) { alert('Cannot delete your default board.'); return; }
  if (!confirm(`Delete board "${currentBoard.name}"? This cannot be undone.`)) return;
  await apiDelete(`/api/boards/${currentBoard.id}`);
  location.reload();
}
```

(If there's no `ensureBoardId()` helper, rename on the default board can switch to it first; simplest is to only allow rename/delete when `currentBoard` is set, matching the iOS long-press behavior. Adjust to match existing board-id resolution in `switchBoard`.)

- [ ] **Step 4: Register actions**

Add to `__actions`: `openBoardOverflow`, `renameCurrentBoard`, `deleteCurrentBoard`. (`openMembersModal`, `viewArchived`, `toggleBoardMenu`, `switchBoard` already registered.)

- [ ] **Step 5: Continuous-flow + card CSS**

```css
.tk-board-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px; }
.tk-board-switch { display:inline-flex; align-items:center; gap:6px; background:none; border:none;
  cursor:pointer; font:inherit; font-size:12px; font-weight:600; letter-spacing:.06em;
  text-transform:uppercase; color:var(--tk-muted); padding:0; }
.tk-done-pill { font-size:12px; font-weight:700; color:#047857; background:rgba(16,185,129,.10);
  border-radius:99px; padding:6px 12px; }
.tk-board-bar { height:4px; border-radius:99px; background:var(--tk-line); overflow:hidden; margin-bottom:24px; }
.tk-board-bar-fill { height:100%; border-radius:99px;
  background:linear-gradient(90deg, var(--tk-accent), #10B981); width:0; transition:width .4s ease; }
.tk-icon-btn { width:36px; height:36px; border-radius:10px; border:none; background:rgba(30,30,46,.05);
  cursor:pointer; display:inline-flex; align-items:center; justify-content:center; color:var(--tk-muted); }
.tk-overflow-menu { position:absolute; right:40px; z-index:60; background:var(--tk-card);
  border:1px solid var(--tk-line); border-radius:12px; box-shadow:0 8px 32px rgba(30,30,46,.15);
  padding:6px; min-width:170px; }
.tk-overflow-item { display:block; width:100%; text-align:left; padding:10px 12px; border:none;
  background:none; cursor:pointer; font:inherit; font-size:14px; color:var(--tk-text); border-radius:8px; }
.tk-overflow-item.danger { color:#DC2626; }

/* Continuous flow: stack the existing columns vertically */
.board { display:flex; flex-direction:column; gap:0; }
.column { width:auto; max-width:none; background:transparent; border:none; padding:0; }
.column-header { display:flex; align-items:center; gap:8px; padding:24px 0 12px; }
.column-header::after { content:""; flex:1; height:1px; background:var(--tk-line); }
.column-title { font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
.task-list { display:flex; flex-direction:column; gap:8px; }

/* Card restyle to Taskly */
.task-card { background:var(--tk-card); border:1px solid var(--tk-line); border-radius:14px;
  box-shadow:var(--tk-shadow); padding:14px 16px; }
```

(Existing card internals — priority dot, due badge, tag, stage arrows — are produced by `createTaskCard`; they inherit the new card shell. Fine-tune spacing visually; don't change the card's DOM structure.)

- [ ] **Step 6: Manual verify**

`npm run dev`, sign in, go to **Board**. Cards now read as one continuous vertical flow with stage dividers (Backlog / In Progress / Done) instead of 3 side-by-side columns. The header shows the board name (tap → board switcher), a **% done** pill + gradient bar that reflect real counts. The **⋯** menu opens Members / Archived / Rename / Delete. Move a card with its arrows / drag → it relocates and the % updates. Switch boards → header name + cards update.

- [ ] **Step 7: Test + commit**

Run: `npm test`
```bash
git add public/index.html public/app.css public/app.js
git commit -m "feat(web): Board tab continuous-flow + switcher header + overflow"
```

---

## Task 6: Profile screen

**Files:**
- Modify: `public/app.js` (real `renderProfile()`; reuse dashboard fetch; settings actions)
- Modify: `public/app.css` (profile layout)

The dashboard data already comes from `GET /api/dashboard` (used by `renderDashboard`). Profile reuses that fetch for the 2×2 stats and renders a settings list wired to existing behaviors (`toggleTheme`, `saveDigestFrequency`, `/api/export`, `openHelpModal`, `/auth/logout`, board management).

- [ ] **Step 1: Add `renderProfile()` (replaces the Task 3 stub)**

```js
async function renderProfile() {
  const el = document.getElementById('screen-profile');
  if (!el) return;
  let d = {};
  try { d = await apiFetch('GET', '/api/dashboard'); } catch {}
  const s = d.stats || {};
  const counts = d.counts || {};
  const stat = (val, label) =>
    `<div class="tk-stat tk-card"><div class="tk-stat-val">${val ?? 0}</div>
       <div class="tk-stat-label">${label}</div></div>`;
  const initial = (myName || '?')[0].toUpperCase();
  const row = (label, action, args) =>
    `<button class="tk-set-row" data-action="${action}" ${args ? `data-args='${args}'` : ''}>
       <span>${label}</span>
       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
     </button>`;

  el.innerHTML = `
    <h1 class="tk-h1" style="margin-bottom:24px">Profile</h1>
    <div class="tk-profile-card tk-card">
      <span class="user-avatar large">${initial}</span>
      <div><div class="tk-profile-name">${escapeHtml(myName || '')}</div></div>
    </div>
    <div class="tk-stat-grid">
      ${stat(s.done_total, 'Done')}
      ${stat(s.completed_week, 'This week')}
      ${stat(counts.open, 'Open')}
      ${stat(counts.overdue, 'Overdue')}
    </div>
    <div class="tk-settings tk-card">
      <p class="tk-settings-head">Settings</p>
      ${row('Appearance', 'toggleTheme')}
      ${row('Notifications', 'openDigestPicker')}
      ${row('Boards', 'gotoTab', '["board"]')}
      <a class="tk-set-row" href="/api/export"><span>Export data</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></a>
      ${row('About &amp; help', 'openHelpModal')}
      <a class="tk-set-row danger" href="/auth/logout"><span>Sign out</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></a>
    </div>`;
}
```

- [ ] **Step 2: Digest picker action**

The existing `saveDigestFrequency(value)` is driven by a `<select>`. For Profile, add a small prompt-based picker (keeps it simple; no new modal):

```js
function openDigestPicker() {
  const choice = prompt('Email digest: none / daily / weekly / fortnightly');
  if (!choice) return;
  const v = choice.trim().toLowerCase();
  if (!['none', 'daily', 'weekly', 'fortnightly'].includes(v)) { alert('Invalid option'); return; }
  saveDigestFrequency(v);
}
```

- [ ] **Step 3: Register actions**

Add to `__actions`: `openDigestPicker`. (`toggleTheme`, `openHelpModal`, `gotoTab` already present.)

- [ ] **Step 4: Profile CSS**

```css
.tk-profile-card { display:flex; align-items:center; gap:20px; padding:24px; margin-bottom:24px; }
.tk-profile-name { font-size:20px; font-weight:700; color:var(--tk-text); }
.tk-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px; }
.tk-stat { padding:20px; text-align:center; }
.tk-stat-val { font-size:28px; font-weight:700; color:var(--tk-accent); }
.tk-stat-label { font-size:12px; color:var(--tk-muted); margin-top:4px; }
.tk-settings { overflow:hidden; }
.tk-settings-head { margin:0; padding:14px 20px 10px; font-size:11px; font-weight:700;
  letter-spacing:.07em; text-transform:uppercase; color:var(--tk-muted); }
.tk-set-row { display:flex; align-items:center; justify-content:space-between; width:100%;
  padding:14px 20px; border:none; border-top:1px solid var(--tk-line); background:none;
  cursor:pointer; font:inherit; font-size:15px; color:var(--tk-text); text-decoration:none; }
.tk-set-row.danger { color:#DC2626; }
```

- [ ] **Step 5: Manual verify**

`npm run dev`, sign in, go to **Profile**. Avatar + name show; the 2×2 grid shows real numbers (Done / This week / Open / Overdue) matching your data; **Appearance** toggles light/dark; **Notifications** sets digest (verify via the response / no error); **Boards** jumps to the Board tab; **Export data** downloads JSON; **About & help** opens the help modal; **Sign out** logs out.

- [ ] **Step 6: Test + commit**

Run: `npm test`
```bash
git add public/app.js public/app.css
git commit -m "feat(web): Profile tab (real stats + settings list)"
```

---

## Task 7: Cleanup, parity, regression

**Files:**
- Modify: `public/index.html`, `public/app.js`, `public/app.css` (remove dead sidebar view-tab markup/handlers; ensure top-bar search + bell present on Today/Board; final pass)

- [ ] **Step 1: Remove dead nav**

The old sidebar nav buttons (`#nav-all`, `#nav-today`, `#nav-dashboard`, `#nav-archived`) and their sidebar sections were replaced in Task 3. Delete any now-unused markup left behind and remove their now-orphaned `__actions` entries **only if no longer referenced** (`clearTodayAndFilter`, `filterToday`, `clearTodayFilter` — confirm with a grep before deleting). Keep `viewDashboard`/`renderDashboard` data path (Profile uses `/api/dashboard` directly, but leave `renderDashboard` if still referenced). Keep `viewArchived`, `setFilter`, `switchBoard`, members, search, notifications, theme, digest.

```bash
grep -nE "filterToday|clearTodayFilter|clearTodayAndFilter|nav-all|nav-today|nav-dashboard|nav-archived" public/app.js public/index.html
```
Remove only what the grep shows is fully unused.

- [ ] **Step 2: Top-bar search + bell**

Confirm the existing header right-cluster (search `#search-btn`, bell `#notif-btn`, theme, account) still renders on all three tabs (it lives in `<header>`, outside `.screen`, so it persists). Verify `⌘K` search and the bell dropdown still work. No code change expected — just verify.

- [ ] **Step 3: Instant-paint cache sanity**

The boot cache paints the board instantly. Confirm `init()` still paints the board and that `showTab('today')` (default) renders Today over the top without errors. If the cache paint targets board lists that are now hidden under `#screen-board`, that's fine (Board tab shows them). No change unless console errors appear.

- [ ] **Step 4: Full regression — automated**

Run: `npm test`
Expected: all green, including `tests/tasks-today.test.js` and the CSP/header tests in `tests/health.test.js`.

- [ ] **Step 5: Full regression — manual checklist**

`npm run dev`, sign in, verify end-to-end:
- Today: ring, chips, cross-board rows, toggle-done, quick-add.
- Board: continuous flow, switcher, % bar, ⋯ (members/archived/rename/delete), card move + drag, task detail opens on card click, category chips show real colors.
- Profile: real stats, theme toggle, digest, export, help, sign out.
- Light **and** dark theme on each tab.
- Narrow width (≤640px): sidebar hides, bottom tab bar appears and switches tabs.

- [ ] **Step 6: Commit + open PR**

```bash
git add -A public/
git commit -m "chore(web): retire legacy sidebar nav; final Taskly polish"
git push -u origin feat/taskly-redesign
gh pr create --base main --title "Taskly redesign — web (3-tab IA + /api/tasks/today)" \
  --body "Implements docs/superpowers/specs/2026-05-31-taskly-redesign-design.md for the web client. 3 tabs (Today/Board/Profile), cross-board Today endpoint, continuous-flow board, Profile stats+settings. iOS follows in a separate PR."
```

> **`main` is prod.** This PR auto-deploys on merge. No migration, one additive read endpoint, no env-var changes — safe, but review the diff and the manual checklist before merging.

---

## Self-review against the spec

- **§IA / 3 tabs** → Tasks 3–6. ✓
- **Today = all boards** → Task 1 endpoint + Task 4 render. ✓
- **Board: switcher + continuous flow + ⋯ (members/archived/rename/delete) + card detail + category chips** → Task 5 (detail reuses existing `createTaskCard` click → panel; chips via `tagChip` use real category color). ✓
- **Profile: real stats + settings list (theme/digest/boards/export/about/sign-out)** → Task 6. ✓
- **Design tokens + shared primitives** → Task 2 + helpers in Task 4. ✓
- **CSP/data-action** → every handler registered in `__actions`; no inline `onclick`. ✓
- **Quick-add → primary board, due today** → Task 4 Step 5. ✓
- **Focus deferred** → not built. ✓
- **Branch/sequencing** → PR off `feat/taskly-redesign` (Task 7); the drag-branch merge to `main` is a prerequisite handled outside this plan.

**Note on the test seeding** (Task 1 Step 1): the first `await agent.post('/api/tasks').send({ text: 'Due today' })` line with no `due_date` was left intentionally as a no-op extra task with `due_date:''` (excluded) — it documents the dateless-exclusion case alongside `'No due date'`. If preferred, delete that line; the assertions don't depend on it.
