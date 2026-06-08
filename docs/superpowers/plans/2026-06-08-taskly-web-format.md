# Taskly Web — Format Alignment (Top Bar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Taskly mockup's clean top bar — **current tab title (left) + search + bell (right)** — replacing the slim bell-only strip the header was collapsed to during the earlier header reconciliation.

**Architecture:** Pure frontend (`public/`). The header markup already contains the search button + bell (the bell visible, search hidden via a CSS rule); the change is: un-hide search, add a tab-title element that `showTab()` updates, and restyle `.app-header` from right-aligned-slim to the mockup's title-left / icons-right bar. No JS logic beyond a one-line title update.

**Tech Stack:** Vanilla JS (`public/app.js` IIFE, `__actions`), CSS, `index.html`.

**Spec:** `docs/superpowers/specs/2026-06-07-taskly-web-board-design.md` (Format alignment section).

**Scope note:** Profile is **already** the mockup layout — `renderProfile()` (app.js:318) renders the avatar + 2×2 real-data stat grid + settings list. The mockup's decorative "role" line and "Edit" button have no real data behind them, so they're intentionally omitted (YAGNI). No Profile change needed. This plan is the top bar only.

---

## Testing reality

Server logic is unchanged → `npm test` (Vitest) is a regression gate (the CSP test in `tests/health.test.js` must stay green; no inline handlers added). The top bar is browser-only → manual verification. (Note: the repo's `node_modules` was recently repaired with `npm ci`; if `npm test` crashes with a `tinyglobby`/`picomatch` error, run `npm ci` first — it's an iCloud-sync corruption issue, not a code problem.)

---

## File structure

| File | Change |
|---|---|
| `public/index.html` | **Modify** — add `<h2 id="topbar-title">` to `.header-left` |
| `public/app.js` | **Modify** — `showTab()` updates `#topbar-title` |
| `public/app.css` | **Modify** — un-hide `#search-btn`; add `.tk-topbar-title`; restyle `.app-header` to title-left/icons-right |

---

## Task 1: Restore the top bar (title + search + bell)

**Files:** `public/index.html`, `public/app.js`, `public/app.css`

- [ ] **Step 1: Add a tab-title element to the header**

In `public/index.html`, inside `<div class="header-left">` (the block at line ~18), add a title element after the `viewing-banner` span (line ~28):
```html
    <h2 class="tk-topbar-title" id="topbar-title">Today</h2>
```
(The `sidebar-toggle` and `app-logo` above it stay in the DOM but remain hidden by CSS — the wordmark lives in the sidebar.)

- [ ] **Step 2: Update the title in `showTab()`**

In `public/app.js`, inside `showTab(tab)` (line ~363), add — right after `currentTab = tab;`:
```js
    const tt = document.getElementById('topbar-title');
    if (tt) tt.textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
```
(Produces `Today` / `Board` / `Profile`.)

- [ ] **Step 3: Un-hide search + restyle the header (CSS)**

In `public/app.css`, find the header-collapse rule (around lines 1086-1092):
```css
.app-header .sidebar-toggle,
.app-header .app-logo,
.app-header #search-btn,
.app-header #theme-toggle,
.app-header .account-wrap,
.app-header .viewing-banner { display:none !important; }
.app-header { justify-content:flex-end; min-height:0; padding-top:8px; padding-bottom:8px; box-shadow:none; }
```
Replace it with (drop `#search-btn` from the hidden list → search now shows; switch the header back to title-left / icons-right):
```css
.app-header .sidebar-toggle,
.app-header .app-logo,
.app-header #theme-toggle,
.app-header .account-wrap,
.app-header .viewing-banner { display:none !important; }
.app-header { justify-content:space-between; box-shadow:none; }
.tk-topbar-title { margin:0; font-size:16px; font-weight:600; color:var(--tk-text); }
.app-header .header-right { display:flex; align-items:center; gap:10px; }
.app-header .hdr-btn { width:36px; height:36px; border-radius:10px; background:rgba(30,30,46,.05); }
```
(Theme + account stay in Profile, so they remain hidden in the bar; the mockup's bar is title + search + bell only.)

- [ ] **Step 4: Verify**

```bash
node --check public/app.js   # must pass
npm test                     # must stay green (CSP test included); if tinyglobby error → run `npm ci` then retry
grep -c "topbar-title" public/index.html   # 1
```

- [ ] **Step 5: Manual verify (browser)**

`DATABASE_URL=<dev> npm run dev`, sign in:
- Top bar reads as a clean white bar: **tab title on the left** (changes Today → Board → Profile as you switch tabs), **search + bell on the right** (no more bell-only strip, no duplicate "Tasks" logo).
- Search icon opens the search overlay (`⌘K` still works); bell opens notifications.
- Sidebar wordmark ("Taskly") + the Board's own switcher are unaffected (no doubled chrome).
- Light + dark theme.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/app.css
git commit -m "feat(web): restore Taskly top bar (tab title + search + bell)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Regression + PR

- [ ] **Step 1: Gates**
```bash
node --check public/app.js
npm test
```
Both green.

- [ ] **Step 2: Open PR**
```bash
git push -u origin feat/taskly-web-format
gh pr create --base main \
  --title "Taskly web — restore top bar (tab title + search + bell)" \
  --body "Completes the format alignment from docs/superpowers/specs/2026-06-07-taskly-web-board-design.md. Restores the mockup's clean top bar (current tab title left, search + bell right) over the slim bell-only strip. Profile already matched the mockup, so no Profile change. Browser QA before merge; main is prod."
```

---

## Self-review against the spec (Format alignment section)

- **Top bar = title + search + bell** → Task 1. ✓
- **Sidebar wordmark + 3 nav + footer** → already present, unchanged. ✓
- **Today matches mockup** → already (board PR / prior). ✓
- **Profile = avatar card + 2×2 stats + settings, real data** → already in `renderProfile()`; mockup's role/Edit omitted (no data). ✓ (no task needed)
- No CSP change; no server change; no new endpoint. ✓
