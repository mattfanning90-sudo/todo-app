# Gated Calendar Section + New Picker + iCal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gate the task detail's calendar fields behind an "Add to calendar" toggle; make Start/End use our date picker + an optional time; add a client-side `.ics` export alongside the Google Calendar link.

**Architecture:** Frontend only (`public/app.js` `createTaskCard` panel + `public/app.css`). No server/schema/endpoint change. `cal_start`/`cal_end` store `YYYY-MM-DD` (all-day) or `YYYY-MM-DDTHH:mm` (timed). All handlers via `data-action`/`__actions` (CSP).

**Tech Stack:** Vanilla JS IIFE, CSS.

**Spec:** `docs/superpowers/specs/2026-06-10-calendar-gating-ical-design.md`

---

## Testing reality
UI + exports are browser-only (no headless browser). Gates: `node --check public/app.js` + manual browser QA (incl. importing a generated `.ics` into a real calendar app). `npm test` (server) stays green — there is no server change. The pure helpers (`splitCalValue`, `combineCalDateTime`, `toGCalDate`, `buildICS`) are the bug-prone parts; verify them by exercising both all-day and timed during QA.

## File structure
| File | Change |
|---|---|
| `public/app.js` | `createTaskCard` panel: replace guests + add-to-gcal blocks with the gated section; add `toggleAddToCalendar`, `splitCalValue`, `combineCalDateTime`, `buildICS`, `downloadICS`; adapt the gcal builder + `toGCalDate`; generalize `openDatePicker`/`clearDueDate` to `data-dp-target`; register actions. |
| `public/app.css` | Toggle switch, gated `.cal-section`/`.cal-on`, Start/End rows, time inputs, export buttons. |

---

## Task 1: Generalize the date picker to `data-dp-target`

**Files:** Modify `public/app.js` (`openDatePicker` ~line 1486, `clearDueDate` ~line 1536).

- [ ] **Step 1: Change `openDatePicker`'s input lookup.** Replace:
```js
    dpInput = trigger.closest('.task-card, #task-sheet').querySelector('.due-date-input');
```
with:
```js
    dpInput = trigger.closest('.task-card, #task-sheet').querySelector(trigger.dataset.dpTarget || '.due-date-input');
```
- [ ] **Step 2: Change `clearDueDate`'s input lookup.** Replace:
```js
    const input = t.closest('.task-card, #task-sheet').querySelector('.due-date-input');
```
with:
```js
    const input = t.closest('.task-card, #task-sheet').querySelector(t.dataset.dpTarget || '.due-date-input');
```
- [ ] **Step 3: Verify.** `node --check public/app.js` passes. (Backward-compatible: existing Due triggers have no `data-dp-target`, so they still resolve `.due-date-input`. Browser-verify the Due picker still works at the end.)
- [ ] **Step 4: Commit.**
```bash
git add public/app.js
git commit -m "refactor(web): date picker reads data-dp-target (default .due-date-input)"
```

---

## Task 2: Pure helpers (split / combine / ics) — add first, used by Tasks 3-4

**Files:** Modify `public/app.js` (add near the other date helpers, e.g. after `toGCalDate`).

- [ ] **Step 1: Add `splitCalValue` + `combineCalDateTime`.**
```js
  // '' | 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:mm'  ->  { date, time }
  function splitCalValue(v) {
    if (!v) return { date: '', time: '' };
    const [date, time] = v.split('T');
    return { date: date || '', time: time ? time.slice(0, 5) : '' };
  }
  function combineCalDateTime(date, time) {
    if (!date) return '';
    return time ? `${date}T${time}` : date;
  }
  function addDaysYmd(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
```
- [ ] **Step 2: Add the `.ics` builder + downloader (pure-ish; uses Blob).**
```js
  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  // timed 'YYYY-MM-DDTHH:mm' -> 'YYYYMMDDTHHMM00' (floating local, no Z); all-day 'YYYY-MM-DD' -> 'YYYYMMDD'
  function icsStamp(v) {
    return v.includes('T') ? v.replace(/[-:]/g, '') + '00' : v.replace(/-/g, '');
  }
  function buildICS({ id, title, notes, calStart, calEnd, guests }) {
    const allDay = !calStart.includes('T');
    const dtStart = allDay ? `DTSTART;VALUE=DATE:${icsStamp(calStart)}` : `DTSTART:${icsStamp(calStart)}`;
    const endVal = calEnd || (allDay ? addDaysYmd(calStart, 1) : `${calStart.split('T')[0]}T${calStart.split('T')[1]}`);
    // timed with no explicit end -> default +60m
    let endStamp;
    if (calEnd) endStamp = icsStamp(calEnd);
    else if (allDay) endStamp = icsStamp(addDaysYmd(calStart, 1));
    else { const d = new Date(calStart); d.setMinutes(d.getMinutes() + 60); endStamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}00`; }
    const dtEnd = allDay ? `DTEND;VALUE=DATE:${endStamp}` : `DTEND:${endStamp}`;
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}${String(now.getUTCMinutes()).padStart(2,'0')}${String(now.getUTCSeconds()).padStart(2,'0')}Z`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taskly//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:taskly-${id}-${now.getTime()}@taskly`, `DTSTAMP:${dtstamp}`,
      dtStart, dtEnd, `SUMMARY:${icsEscape(title)}`,
    ];
    if (notes) lines.push(`DESCRIPTION:${icsEscape(notes)}`);
    (guests || []).forEach(g => lines.push(`ATTENDEE;CN=${icsEscape(g)}:mailto:${g}`));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }
  function downloadICS(filename, ics) {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(a.href);
  }
```
- [ ] **Step 3: Verify.** `node --check public/app.js` passes. Commit.
```bash
git add public/app.js
git commit -m "feat(web): calendar date/time + .ics helper functions"
```

---

## Task 3: Gated calendar section in the task panel (markup + toggle + wiring)

**Files:** Modify `public/app.js` (`createTaskCard` panel innerHTML ~lines 1129-1150, the field refs ~1167-1173, and the wiring block); `public/app.css`.

- [ ] **Step 1: Replace the panel markup.** In `createTaskCard`'s template, replace the two blocks — the `<label>Calendar guests (Gmail)</label> … <div class="owner-chips"></div>` block AND the `<label>Add to Google Calendar</label> <div class="cal-row"> … </div>` block — with one gated section. Keep the `<label>Share to someone's board</label>` block where it is (that is NOT calendar; leave it untouched).
```html
        <div class="cal-section" data-cal>
          <div class="cal-toggle-row">
            <span class="cal-toggle-label">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Add to calendar
            </span>
            <button type="button" class="cal-switch" data-action="toggleAddToCalendar" aria-label="Toggle add to calendar"></button>
          </div>
          <div class="cal-body">
            <div class="cal-field">
              <label>Start</label>
              <div class="cal-dt">
                <input type="hidden" class="cal-start-date">
                <input type="hidden" class="cal-start">
                <button type="button" class="date-trigger cal-trig empty" data-action="openDatePicker" data-dp-target=".cal-start-date">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span class="date-trigger-label">Set date…</span>
                  <span class="date-clear-x" data-action="clearDueDate" data-dp-target=".cal-start-date" hidden>×</span>
                </button>
                <input type="time" class="cal-start-time" />
              </div>
            </div>
            <div class="cal-field">
              <label>End</label>
              <div class="cal-dt">
                <input type="hidden" class="cal-end-date">
                <input type="hidden" class="cal-end">
                <button type="button" class="date-trigger cal-trig empty" data-action="openDatePicker" data-dp-target=".cal-end-date">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span class="date-trigger-label">Set date…</span>
                  <span class="date-clear-x" data-action="clearDueDate" data-dp-target=".cal-end-date" hidden>×</span>
                </button>
                <input type="time" class="cal-end-time" />
              </div>
            </div>
            <div class="cal-field">
              <label>Guests</label>
              <div class="owner-row">
                <input type="email" class="owner-input" placeholder="name@email.com" />
                <button class="owner-add-btn">+ Add</button>
              </div>
              <div class="owner-chips"></div>
            </div>
            <div class="cal-actions">
              <button type="button" class="open-cal-btn">Google Calendar</button>
              <button type="button" class="dl-ics-btn">Download .ics</button>
            </div>
          </div>
        </div>
```
NOTE: `getCardPayload` reads `.cal-start`/`.cal-end` (the combined hidden inputs) — they remain present, so `getCardPayload` is unchanged. The clear-x reuses `clearDueDate` but with `data-dp-target` pointing at the date-only input (Task 1 makes `clearDueDate` honor it); after clearing the date input, a change listener (Step 3) recomputes the combined value.

- [ ] **Step 2: Initialize the fields from the task.** Replace the old `calStartEl.value = task.cal_start || ''; calEndEl.value = task.cal_end || '';` lines with logic that splits the stored value and seeds the date-trigger label, the time input, and the combined hidden input, and sets the section's `.cal-on` state. Add near the other field refs:
```js
    const calSection = card.querySelector('.cal-section');
    function seedCal(prefix, value) {
      const { date, time } = splitCalValue(value);
      const dateInput = card.querySelector(`.cal-${prefix}-date`);
      const combined = card.querySelector(`.cal-${prefix}`);
      const trig = card.querySelector(`[data-dp-target=".cal-${prefix}-date"]`).closest('.cal-trig');
      const timeInput = card.querySelector(`.cal-${prefix}-time`);
      dateInput.value = date;
      timeInput.value = time;
      combined.value = value || '';
      const label = trig.querySelector('.date-trigger-label');
      const clearX = trig.querySelector('.date-clear-x');
      if (date) { trig.classList.remove('empty'); label.textContent = formatTriggerDate(date); if (clearX) clearX.hidden = false; }
      else { trig.classList.add('empty'); label.textContent = 'Set date…'; if (clearX) clearX.hidden = true; }
    }
    seedCal('start', task.cal_start);
    seedCal('end', task.cal_end);
    calSection.classList.toggle('cal-on', !!task.cal_start);
```
(Remove the now-obsolete `calStartEl`/`calEndEl` refs at ~1167-1168 and their `.value =` lines at ~1172-1173, since the markup no longer has `.cal-start`/`.cal-end` as datetime-local inputs — they're now hidden combined inputs seeded above. Search for any other use of `calStartEl`/`calEndEl` in the card scope and update — the gcal builder in Task 4 reads the combined `.cal-start`/`.cal-end` directly.)

- [ ] **Step 3: Wire date/time changes → recompute combined + persist.** Add in the card wiring block:
```js
    ['start', 'end'].forEach(prefix => {
      const dateInput = card.querySelector(`.cal-${prefix}-date`);
      const timeInput = card.querySelector(`.cal-${prefix}-time`);
      const combined = card.querySelector(`.cal-${prefix}`);
      const recompute = () => { combined.value = combineCalDateTime(dateInput.value, timeInput.value); apiPut(`/api/tasks/${task.id}`, getCardPayload(card)); };
      dateInput.addEventListener('change', recompute); // picker dispatches 'change' on the date-only input
      timeInput.addEventListener('change', recompute);
    });
```

- [ ] **Step 4: Add `toggleAddToCalendar` + register it.** Add the function (near the card or as a standalone action that operates on the clicked element's card):
```js
  function toggleAddToCalendar() {
    const card = this.closest('.task-card');
    const section = card.querySelector('.cal-section');
    const on = section.classList.toggle('cal-on');
    if (!on) {
      ['start', 'end'].forEach(p => {
        card.querySelector(`.cal-${p}-date`).value = '';
        card.querySelector(`.cal-${p}-time`).value = '';
        card.querySelector(`.cal-${p}`).value = '';
        const trig = card.querySelector(`[data-dp-target=".cal-${p}-date"]`).closest('.cal-trig');
        trig.classList.add('empty');
        trig.querySelector('.date-trigger-label').textContent = 'Set date…';
        const x = trig.querySelector('.date-clear-x'); if (x) x.hidden = true;
      });
      apiPut(`/api/tasks/${Number(card.dataset.taskId)}`, getCardPayload(card));
    }
  }
```
Register in `__actions`: add `toggleAddToCalendar`.

- [ ] **Step 5: CSS.** Add to `public/app.css`:
```css
.cal-section { border:1px solid rgba(30,30,46,.10); border-radius:12px; padding:11px 12px; margin-top:6px; }
.cal-toggle-row { display:flex; align-items:center; justify-content:space-between; }
.cal-toggle-label { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--tk-text,#1E1E2E); }
.cal-toggle-label svg { stroke:var(--tk-accent,#FF6B47); }
.cal-switch { width:40px; height:23px; border-radius:99px; border:none; background:rgba(30,30,46,.15); position:relative; cursor:pointer; transition:.15s; flex-shrink:0; }
.cal-switch::after { content:""; position:absolute; top:2px; left:2px; width:19px; height:19px; border-radius:99px; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.2); transition:.15s; }
.cal-on .cal-switch { background:var(--tk-accent,#FF6B47); }
.cal-on .cal-switch::after { left:19px; }
.cal-body { display:none; margin-top:12px; border-top:1px solid rgba(30,30,46,.07); padding-top:12px; }
.cal-on .cal-body { display:block; }
.cal-field { margin-bottom:10px; }
.cal-field > label { display:block; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--tk-muted,rgba(30,30,46,.45)); margin-bottom:5px; }
.cal-dt { display:flex; gap:8px; align-items:center; }
.cal-dt .cal-trig { flex:1; }
.cal-start-time, .cal-end-time { width:120px; border:1px solid rgba(30,30,46,.12); border-radius:9px; padding:7px 9px; font-size:13px; }
.cal-actions { display:flex; gap:9px; margin-top:6px; }
.open-cal-btn, .dl-ics-btn { flex:1; font-size:12.5px; font-weight:600; padding:9px 0; border-radius:10px; border:1px solid rgba(30,30,46,.12); background:#fff; color:var(--tk-text,#1E1E2E); cursor:pointer; }
```

- [ ] **Step 6: Verify + commit.** `node --check public/app.js`; `grep -c "onclick=" public/index.html` → 0. Browser-QA later. Commit:
```bash
git add public/app.js public/app.css
git commit -m "feat(web): gate calendar fields behind Add-to-calendar toggle; date+optional-time via shared picker"
```

---

## Task 4: Exports — adapt Google Calendar builder + add .ics

**Files:** Modify `public/app.js` (`toGCalDate` ~1539, the `.open-cal-btn` handler ~1438, add the `.dl-ics-btn` handler).

- [ ] **Step 1: Make `toGCalDate` handle all-day.** Replace `toGCalDate`:
```js
  function toGCalDate(calVal, addMinutes = 0) {
    if (!calVal) return '';
    if (!calVal.includes('T')) return calVal.replace(/-/g, '');      // all-day YYYYMMDD
    const d = new Date(calVal);
    d.setMinutes(d.getMinutes() + addMinutes);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; // timed UTC
  }
```
- [ ] **Step 2: Update the `.open-cal-btn` handler** to read the combined `.cal-start`/`.cal-end` and handle all-day end-exclusivity. Replace its `dates=` assembly:
```js
      const calStart = card.querySelector('.cal-start').value;
      const calEnd = card.querySelector('.cal-end').value;
      if (calStart) {
        const allDay = !calStart.includes('T');
        let end;
        if (calEnd) end = toGCalDate(calEnd);
        else if (allDay) end = toGCalDate(addDaysYmd(calStart, 1));   // exclusive next day
        else end = toGCalDate(calStart, 60);
        url += '&dates=' + toGCalDate(calStart) + '/' + end;
      }
```
(Keep the `text`/`details`/`add` lines; just swap the old `calStartEl.value`/`calEndEl.value` reads for `.cal-start`/`.cal-end`.)

- [ ] **Step 3: Add the `.dl-ics-btn` handler** in the wiring block:
```js
    card.querySelector('.dl-ics-btn').addEventListener('click', e => {
      e.stopPropagation();
      const calStart = card.querySelector('.cal-start').value;
      if (!calStart) return; // nothing to export
      const guests = [...chipsEl.querySelectorAll('.chip')].map(c => c.dataset.email);
      const ics = buildICS({
        id: Number(card.dataset.taskId),
        title: card.querySelector('.task-text').textContent,
        notes: textarea.value.trim(),
        calStart,
        calEnd: card.querySelector('.cal-end').value,
        guests,
      });
      const slug = (card.querySelector('.task-text').textContent || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      downloadICS(`${slug}.ics`, ics);
    });
```

- [ ] **Step 4: Verify + commit.** `node --check public/app.js`. Commit:
```bash
git add public/app.js
git commit -m "feat(web): all-day-aware Google Calendar link + client-side .ics download"
```

---

## Task 5: Final gates + PR

- [ ] **Step 1: Gates.**
```bash
node --check public/app.js
npx vitest run                  # green (no server change)
grep -c "onclick=" public/index.html   # 0
```
- [ ] **Step 2: Browser QA** (record results): Due-date picker still works (regression from Task 1); toggle hides/shows + clears on off; pick Start date (picker) + time → persists (reload holds); all-day (no time) persists; Google Calendar opens a correct event (all-day + timed); Download .ics imports correctly into a real calendar app (all-day + timed + guests).
- [ ] **Step 3: PR.**
```bash
git push -u origin feat/calendar-gating-ical
gh pr create --base main --title "Gated calendar section + new picker + iCal" --body "Implements docs/superpowers/specs/2026-06-10-calendar-gating-ical-design.md. Frontend-only. main is prod."
```

---

## Self-review against the spec
- Toggle gates everything; off clears dates → Task 3 ✓
- Start/End date via shared picker + optional time → Tasks 1 + 3 ✓
- Guests inside section → Task 3 ✓
- Google Calendar (all-day aware) + client-side .ics → Task 4 ✓
- `getCardPayload` unchanged (combined `.cal-start`/`.cal-end` kept) → Task 3 note ✓
- No server/schema change → ✓
- Names consistent: `splitCalValue`, `combineCalDateTime`, `addDaysYmd`, `buildICS`, `downloadICS`, `toggleAddToCalendar`, `seedCal`, classes `.cal-start-date`/`.cal-start`/`.cal-start-time` (+ end) used consistently across Tasks 2-4 ✓
- iOS parity deferred (noted) ✓
