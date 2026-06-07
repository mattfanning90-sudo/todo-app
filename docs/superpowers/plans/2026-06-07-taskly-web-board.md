# Taskly Web Board — Responsive Columns + SortableJS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web Board as a responsive kanban — 3 side-by-side columns on desktop/iPad, vertical stack on phone (CSS-only switch) — with vendored SortableJS for cross-column drag + reorder (mouse + touch), keeping the `←/→` move buttons as the WCAG 2.2 AA non-drag alternative plus an `aria-live` announcer, and removing the old hand-rolled drag.

**Architecture:** Pure frontend change in `public/`. The board DOM is already `.board > 3 .column[data-stage] > ul.task-list#list-<stage>` (the redesign CSS-stacked it). So: (1) CSS flips `.board` from vertical-flow to a 3-column grid that collapses at a phone breakpoint; (2) `Sortable.create()` on each of the 3 `ul.task-list`s with a shared `group`, persisting via the EXISTING `moveToStage`/`saveOrder` paths (`PUT /api/tasks/:id` + `POST /api/reorder`); (3) the old native-DnD wiring is deleted. No server changes, no new endpoint.

**Tech Stack:** Vanilla JS (single IIFE `public/app.js`, `__actions` delegation), CSS, vendored SortableJS v1.15.7 (UMD, CSP `script-src 'self'`-safe). Server unchanged.

**Spec:** `docs/superpowers/specs/2026-06-07-taskly-web-board-design.md`.

**Scope note:** This plan covers the **Board** (the deep-researched core). The remaining format-alignment from the spec — restoring the mockup top bar (title + search + bell) and the Profile avatar-card/2×2-stats layout — is a smaller, separate follow-up plan (`docs/superpowers/plans/2026-06-07-taskly-web-format.md`, written next). The Board ships and is testable on its own.

---

## Testing reality

Server logic is unchanged, so the **Vitest suite** (`npm test`) is purely a regression gate — most important is `tests/health.test.js`'s **CSP assertions** (the new `<script src="/vendor/Sortable.min.js">` must stay `'self'`-compatible). The Board itself is **browser-only / manually verified** (no DOM harness, per `docs/testing.md`). Each task ends with a concrete manual checklist + `npm test`.

**Running locally:** `DATABASE_URL=<dev-postgres> npm run dev` → `http://localhost:3000`, sign in, open the Board tab. Resize the window to cross the phone breakpoint.

---

## File structure

| File | Change |
|---|---|
| `public/vendor/Sortable.min.js` | **Create** — vendored SortableJS v1.15.7 (UMD) |
| `public/index.html` | **Modify** — add the `<script src="/vendor/Sortable.min.js">`; add the `#a11y-live` region |
| `public/app.css` | **Modify** — `#screen-board .board` → responsive grid; `.column` column styling; phone `@media` stack |
| `public/app.js` | **Modify** — add `initSortable()` + `handleSortEnd()` + `announce()`; call `initSortable()` where `setupColumnDrop()` was; delete the old drag (`setupColumnDrop`, `setupTouchDrag`, `applyDrop`, per-card dragstart/dragend, `card.draggable`, `dragSrc` state); add `announce()` to `moveToStage` |

---

## Task 1: Vendor SortableJS

**Files:**
- Create: `public/vendor/Sortable.min.js`
- Modify: `public/index.html` (add the script tag before `app.js`)

- [ ] **Step 1: Download the exact version into the repo**

```bash
mkdir -p public/vendor
# v1.15.7 UMD build from the npm registry tarball (no CDN at runtime — this is a one-time fetch):
curl -fsSL https://registry.npmjs.org/sortablejs/-/sortablejs-1.15.7.tgz -o /tmp/sortable.tgz
tar -xzf /tmp/sortable.tgz -C /tmp
cp /tmp/package/Sortable.min.js public/vendor/Sortable.min.js
```

- [ ] **Step 2: Verify it is CSP-safe (no eval / new Function)**

Run:
```bash
grep -cE "eval\(|new Function|Function\(" public/vendor/Sortable.min.js
```
Expected: `0`. (If non-zero, STOP — do not ship; report it. The research verified v1.15.7 is clean, but confirm the actual file.)

- [ ] **Step 3: Confirm it exposes the global**

Run:
```bash
grep -c "window.Sortable" public/vendor/Sortable.min.js
```
Expected: `≥ 1` (the UMD global-attach branch). Also check the file is ~45KB: `wc -c public/vendor/Sortable.min.js` (~45000).

- [ ] **Step 4: Load it in `index.html` before `app.js`**

In `public/index.html`, immediately BEFORE the existing `<script src="/app.js?v=...">` line near `</body>`, add:
```html
<script src="/vendor/Sortable.min.js" defer></script>
```
(Both `defer` → Sortable is defined before `app.js`'s `init()` runs.)

- [ ] **Step 5: Regression — CSP + suite still green**

Run: `npm test`
Expected: all pass. In particular `tests/health.test.js` (CSP) stays green — the new script is same-origin (`'self'`), no inline, so `scriptSrc: ['self']` already allows it. No `server.js` CSP change is needed (confirmed: `scriptSrc ['self']`, `styleSrc ['self','unsafe-inline',…]` at `server.js:54,58`).

- [ ] **Step 6: Commit**

```bash
git add public/vendor/Sortable.min.js public/index.html
git commit -m "feat(web): vendor SortableJS v1.15.7 (CSP-safe, no eval)"
```

---

## Task 2: Responsive column layout (CSS)

**Files:**
- Modify: `public/app.css` (the redesign's `#screen-board .board`/`.column` overrides at ~lines 1058-1066)

The redesign forced the board vertical with `#screen-board .board { display:flex; flex-direction:column }`. Replace that with a responsive grid: 3 columns on wide viewports, single column (stack) below ~760px. Style `.column` as the approved mockup columns (subtle tint, rounded, padding) with the existing `.column-header` as the stage divider.

- [ ] **Step 1: Replace the board/column overrides**

In `public/app.css`, replace the redesign block (the rules starting `#screen-board .board { display:flex; flex-direction:column; gap:0; }` and the `#screen-board .column { … }` line) with:

```css
/* Board: 3 columns on desktop/iPad, vertical stack on phone */
#screen-board .board { display:grid; grid-template-columns:repeat(3, 1fr); gap:18px; align-items:start; min-width:0; height:auto; }
#screen-board .column { background:rgba(30,30,46,.025); border:1px solid rgba(30,30,46,.06); border-radius:16px; padding:14px 12px; width:auto; max-width:none; min-width:0; }
#screen-board .column-header { display:flex; align-items:center; gap:8px; padding:2px 4px 12px; }
#screen-board .column-header::after { content:none; }
#screen-board .column-title { font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
#screen-board .task-list { display:flex; flex-direction:column; gap:10px; min-height:24px; }
@media (max-width: 760px) {
  #screen-board .board { grid-template-columns:1fr; gap:14px; }
}
```

(Dark theme: `--tk-card`/`--tk-line` already adapt; the literal `rgba(30,30,46,.025)` column tint is subtle in both. If it reads wrong in dark mode during QA, swap to `var(--tk-line)` background — note for the QA pass.)

- [ ] **Step 2: Manual verify**

`npm run dev`, sign in, Board tab:
- Wide window → **3 columns side by side** (Backlog | In Progress | Done), each a tinted rounded column with its header + cards.
- Narrow the window past ~760px → columns **stack vertically** (single column).
- Cards still show priority bar, title, badges, and `←/→` buttons.

- [ ] **Step 3: Commit**

```bash
git add public/app.css
git commit -m "feat(web): responsive board — 3 columns desktop/iPad, stack on phone"
```

---

## Task 3: Swap the drag engine to SortableJS

**Files:**
- Modify: `public/index.html` (add `#a11y-live`)
- Modify: `public/app.js` (add `initSortable`/`handleSortEnd`/`announce`; swap the call at line ~595; delete the old drag wiring; announce in `moveToStage`)

The existing `moveToStage(card, taskId, newStage)` (app.js:1385) and `saveOrder(...stages)` (app.js:380) already persist a stage change (`PUT /api/tasks/:id`) + ordering (`POST /api/reorder`) and rebuild the move buttons + spawn recurrence. SortableJS's `onEnd` reuses that exact logic; we then delete the hand-rolled native drag.

- [ ] **Step 1: Add the visually-hidden live region to `index.html`**

In `public/index.html`, just inside `<body>` (e.g. right after the opening `<body>` tag), add:
```html
<div id="a11y-live" aria-live="polite" class="sr-only"></div>
```
And add the `.sr-only` utility to `public/app.css` (if not already present — grep first):
```css
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
```

- [ ] **Step 2: Add `announce()` + `initSortable()` + `handleSortEnd()` to `app.js`**

Add these inside the IIFE, near `moveToStage` (after `setupColumnDrop`'s old location is fine):
```js
function announce(msg) {
  const el = document.getElementById('a11y-live');
  if (el) el.textContent = msg;
}

let sortables = [];
function initSortable() {
  sortables.forEach(s => s.destroy());
  sortables = STAGES.map(stage => {
    const list = getList(stage);
    return Sortable.create(list, {
      group: 'kanban',
      animation: 150,
      // Don't start a drag from interactive bits or the expanded detail panel:
      filter: '.stage-btn, .icon-btn, button, input, select, textarea, .status-panel, a',
      preventOnFilter: false,
      forceFallback: true,      // unify mouse/touch; avoids iOS Safari native-DnD gaps
      fallbackOnBody: true,
      onEnd: handleSortEnd,
    });
  });
}

function handleSortEnd(evt) {
  const card = evt.item;
  const taskId = Number(card.dataset.taskId);
  const fromStage = evt.from.closest('.column').dataset.stage;
  const toStage = evt.to.closest('.column').dataset.stage;
  if (toStage !== card.dataset.stage) {
    card.dataset.stage = toStage;
    apiPut(`/api/tasks/${taskId}`, { ...getCardPayload(card), stage: toStage });
    rebuildStageButtons(card, taskId, toStage);
    if (toStage === 'done' && card.dataset.recurrence) spawnRecurringTask(card);
    announce(`${(card.querySelector('.task-text')?.textContent || 'Task')} moved to ${STAGE_LABELS[toStage]} from ${STAGE_LABELS[fromStage]}`);
    saveOrder(fromStage, toStage);
  } else {
    saveOrder(toStage);
  }
  updateCounts();
}
```

- [ ] **Step 3: Call `initSortable()` where `setupColumnDrop()` was**

At `public/app.js:595`, replace the `setupColumnDrop();` call with `initSortable();`.

- [ ] **Step 4: Announce on button moves too**

In `moveToStage` (app.js:1385), add an announce after the stage update — insert before the final `saveOrder(oldStage, newStage);`:
```js
    announce(`${(card.querySelector('.task-text')?.textContent || 'Task')} moved to ${STAGE_LABELS[newStage]} from ${STAGE_LABELS[oldStage]}`);
```

- [ ] **Step 5: Delete the old hand-rolled drag**

Remove all of these (now superseded by SortableJS):
- `public/app.js:922` — `card.draggable = true;`
- `public/app.js:1341-1363` — the per-card `card.addEventListener('dragstart', …)` and `dragend` blocks inside `createTaskCard`.
- `public/app.js:1366` — the `setupTouchDrag(card);` call inside `createTaskCard`.
- The function definitions `setupColumnDrop` (app.js:1409), `applyDrop` (app.js:1370), and `setupTouchDrag` (app.js:1578) in full.
- The now-unused state `let dragSrc = null;` (app.js:15) and any `dragSrcStage`/`touchDragInProgress`/`dragActive` declarations that become unused.

After deleting, grep to confirm nothing still references them:
```bash
grep -nE "dragSrc|setupColumnDrop|setupTouchDrag|applyDrop|\.draggable" public/app.js
```
Expected: no remaining references (only the `initSortable`/`handleSortEnd` you added). Fix any stragglers.

- [ ] **Step 6: Syntax check + regression**

```bash
node --check public/app.js   # must pass — IIFE intact, no broken refs
npm test                     # CSP + server suite still green
```

- [ ] **Step 7: Manual verify**

`npm run dev`, Board tab:
- **Drag a card to another column** (mouse) → it stays there, the % pill/bar update, and a refresh shows it persisted.
- **Reorder within a column** (mouse) → order persists across refresh.
- **`←/→` move buttons** still move the card and update counts.
- **Screen reader / live region:** after any move (drag OR button), the `#a11y-live` text reads e.g. *"Build component library moved to Done from In Progress"* (inspect the element, or use VoiceOver).
- **Touch (iPad/phone or devtools touch emulation):** long-press-drag a card across columns without the page scroll-jittering; the column-stack layout (narrow) also drags.
- **No drag from buttons:** pressing `←/→` or the delete icon does NOT start a drag; tapping the card body still expands the detail panel.

- [ ] **Step 8: Commit**

```bash
git add public/app.js public/index.html public/app.css
git commit -m "feat(web): SortableJS board drag + aria-live; remove hand-rolled drag"
```

---

## Task 4: Card + column visual polish to the mockup

**Files:**
- Modify: `public/app.css` (`#screen-board .task-card` and its inner badge styles)

The card already renders the right elements (priority dot, due badge, subtask count, assignee, repeat, move buttons). This task aligns their *look* to the approved columns mockup: priority **bar** on top (not just a dot), tinted category chip, muted meta badges, small gradient assignee avatar.

- [ ] **Step 1: Restyle the card to the mockup**

Append to `public/app.css`:
```css
#screen-board .task-card { padding:12px 14px 11px; cursor:grab; }
#screen-board .task-card .task-text { font-size:13.5px; font-weight:500; color:var(--tk-text); line-height:1.4; }
#screen-board .task-card .task-badges { display:flex; align-items:center; gap:7px; margin-top:9px; flex-wrap:wrap; }
#screen-board .task-card .due-badge { font-size:11px; color:var(--tk-muted); background:none; padding:0; }
#screen-board .task-card .due-badge.overdue { color:#DC2626; font-weight:600; }
#screen-board .task-card .subtask-count,
#screen-board .task-card .assignee-badge { font-size:11px; color:var(--tk-muted); }
#screen-board .task-card .task-age { display:none; }   /* the "Nd open" age is noise in the Taskly card */
#screen-board .task-card .stage-btns { display:flex; justify-content:flex-end; gap:6px; margin-top:10px; }
#screen-board .task-card .stage-btn { padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600; border:1px solid var(--tk-line); background:rgba(30,30,46,.04); color:var(--tk-muted); cursor:pointer; }
#screen-board .task-card .stage-btn.forward { border:none; background:rgba(255,107,71,.10); color:var(--tk-accent); }
```

(Leave `createTaskCard`'s markup as-is — this is CSS only. The priority **bar** vs dot: if the mockup's top priority bar is wanted over the inline dot, that's a follow-up markup tweak; the dot is acceptable for v1. Note for QA.)

- [ ] **Step 2: Manual verify**

Board tab: cards read like the approved mockup (clean title, muted meta badges, coral `Move →` / outlined `← Back`), in both column and stacked layouts; overdue due text is red.

- [ ] **Step 3: Commit**

```bash
git add public/app.css
git commit -m "feat(web): polish board cards to Taskly mockup"
```

---

## Task 5: Final regression + PR

- [ ] **Step 1: Full automated gate**

```bash
node --check public/app.js
npm test
```
Both green (CSP test included).

- [ ] **Step 2: Manual checklist (the things tests can't cover)**

- 3 columns on desktop/iPad; stacks under 760px.
- Drag between + within columns (mouse) persists across refresh.
- Touch drag works without page-jitter (real device or emulation); the iOS-Safari `forceFallback` path is the risk area — check on an actual iPad/iPhone if possible.
- `←/→` buttons move + announce; drag moves + announce (live region).
- Tap card → detail panel expands; pressing buttons doesn't start a drag.
- Light + dark theme.

- [ ] **Step 3: Open PR**

```bash
git push -u origin feat/taskly-web-board
gh pr create --base main \
  --title "Taskly web Board — responsive columns + SortableJS drag" \
  --body "Implements docs/superpowers/specs/2026-06-07-taskly-web-board-design.md (Board portion). 3 columns on desktop/iPad → vertical stack on phone; vendored SortableJS (CSP-safe) for cross-column drag + reorder; move buttons kept as the WCAG 2.2 AA non-drag alternative + an aria-live announcer; old hand-rolled drag removed. No server change. Format alignment (top bar + Profile) follows in a separate PR. main is prod — browser QA (esp. iOS touch drag) before merge."
```

> **`main` is prod.** No server/migration change, but the board interaction is browser-only — do the manual + iOS-touch QA before merging.

---

## Self-review against the spec

- **Responsive columns/stack** → Task 2. ✓
- **SortableJS vendored, CSP-safe** → Task 1 (download + verify no-eval + script-src 'self'). ✓
- **Cross-column drag + within-column reorder, mouse+touch** → Task 3 (`group:'kanban'`, `forceFallback`). ✓
- **Persist via existing `/api/reorder` + `PUT /api/tasks`** → Task 3 reuses `moveToStage`/`saveOrder`; no new endpoint. ✓
- **Move buttons as WCAG AA non-drag alternative + aria-live** → Task 3 (`#a11y-live`, `announce()` in both `onEnd` and `moveToStage`). ✓
- **Remove old hand-rolled drag** → Task 3 Step 5. ✓
- **Card features as badges** → already in `createTaskCard`; Task 4 polishes the look. ✓
- **`handle`/`filter` so taps on buttons don't drag** → Task 3 `filter`. ✓ (Used `filter` rather than the spec's `handle` because the card body doubles as the click-to-expand target — `filter` excludes the interactive bits while keeping the card draggable.)
- **No CSP change** → confirmed (`server.js:54,58`); Task 1 Step 5. ✓
- **Format alignment (top bar + Profile)** → explicitly deferred to a separate follow-up plan (scope note). ⚠ Not in this plan by design.
