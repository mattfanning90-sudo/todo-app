# Gated Calendar Section + New Picker + iCal — Design

**Status:** Approved direction (visual companion, 2026-06-10). Decisions: date + **optional** time; gate everything behind an **Add to calendar** toggle (option A); guests inside the section; two exports — **Google Calendar** + **Download .ics**; `.ics` generated **client-side**.

**Goal:** In the task detail panel, hide the calendar fields behind a single "Add to calendar" toggle; make the calendar dates use our new date picker (with an optional time); and add an iCal (`.ics`) export so adding to a calendar isn't Gmail-only.

## Scope

**In (web, board card detail panel — `public/app.js` `createTaskCard` panel + `public/app.css`):**
1. Replace the always-visible "Calendar guests" + "Add to Google Calendar" blocks with a gated section behind an **Add to calendar** toggle.
2. Start/End = our date picker (date) + an **optional** time input.
3. Guests live inside the gated section.
4. Two actions: **Google Calendar** (existing render link, adapted) and **Download .ics** (new, client-side).

**Out (call out, don't build):**
- Calendar in the new **Today detail sheet** (calendar stays in the board card panel).
- **iOS** calendar parity (gating + `.ics` on RN) — deferred to a separate effort; the data stays readable on iOS.
- Any server change, schema change, or new endpoint.

## Data model (no schema change)

`cal_start` / `cal_end` are existing TEXT columns. They store **either** `YYYY-MM-DD` (all-day) **or** `YYYY-MM-DDTHH:mm` (timed) — the presence of `T` distinguishes all-day vs timed. Existing values (from the old `datetime-local` inputs) are already `YYYY-MM-DDTHH:mm`, so they read as timed — backward-compatible.

The **toggle has no stored field.** On render: the section is **expanded iff `cal_start` is non-empty**. The user can also expand it manually (a transient UI flag) to start entering. Turning the toggle **off clears** `cal_start` and `cal_end` (and persists the clear). Guests persist in `task.owners` as today.

## Components

### Add-to-calendar toggle
A switch row labelled "Add to calendar" at the calendar section's position in the panel. `data-action="toggleAddToCalendar"` flips a `.cal-on` class on the section wrapper (CSS shows/hides the body). When toggled **off**, it clears the Start/End hidden inputs + time inputs, removes guest chips' effect on persistence is unchanged (guests stay in owners but the gcal/ics won't include them when there's no event), and saves (`cal_start=''`, `cal_end=''`). Initial state on card build: `.cal-on` present iff `task.cal_start`.

### Start / End fields (date + optional time)
Each of Start and End is: a hidden input holding the **combined** value (`.cal-start` / `.cal-end`, read by `getCardPayload`), a **date-trigger** button (opens the shared picker), and a **time input** (`type="time"`, optional). On change of the date or the time, a `combineCalDateTime(dateStr, timeStr)` helper rebuilds the hidden combined value: `dateStr` alone → `YYYY-MM-DD`; `dateStr` + `timeStr` → `YYYY-MM-DDTHH:mm`; no `dateStr` → `''`. Each change persists the card (existing `apiPut(getCardPayload(card))` path).

### Date picker generalization (the one refactor)
`openDatePicker`/`clearDueDate` currently hard-code `.due-date-input`. Generalize: read the target selector from the trigger's `data-dp-target` attribute, defaulting to `.due-date-input`.
```js
dpInput = trigger.closest('.task-card, #task-sheet').querySelector(trigger.dataset.dpTarget || '.due-date-input');
```
The Due trigger keeps no `data-dp-target` (→ default). The calendar Start/End triggers set `data-dp-target=".cal-start-date"` / `".cal-end-date"` — a **separate hidden date-only input** the picker writes. A change listener on that date-only input recomputes the combined `.cal-start`/`.cal-end` via `combineCalDateTime`. (The picker only ever writes the DATE; the time input supplies the time.)

### Google Calendar export (adapt existing)
The existing `.open-cal-btn` builds `calendar.google.com/calendar/render?action=TEMPLATE&text=…&details=…&dates=…&add=…`. Adapt `toGCalDate` (and the `dates=` assembly) to handle **all-day** (`YYYY-MM-DD` → `YYYYMMDD`, and gcal all-day ranges are `start/endExclusive`) vs **timed** (`YYYY-MM-DDTHH:mm` → `YYYYMMDDTHHmmss`). Guests via `&add=`.

### iCal (.ics) export — client-side
New `.dl-ics-btn` with `data-action`. Build an iCalendar string:
```
BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Taskly//EN\nBEGIN:VEVENT
UID:<task id>-<timestamp>@taskly
DTSTAMP:<now UTC basic>
DTSTART;VALUE=DATE:YYYYMMDD            (all-day)   | DTSTART:YYYYMMDDTHHmmss (timed, local; no Z = floating)
DTEND;VALUE=DATE:YYYYMMDD(+1 exclusive) | DTEND:YYYYMMDDTHHmmss
SUMMARY:<escaped task text>
DESCRIPTION:<escaped notes>
ATTENDEE;CN=<email>:mailto:<email>     (one per guest)
END:VEVENT\nEND:VCALENDAR
```
Escape `, ; \ \n` per RFC 5545; CRLF line endings. Download via a `Blob([ics], {type:'text/calendar'})` + a temporary `<a download="<slug>.ics">` click. No server, CSP-safe (no eval; Blob URLs allowed).

## Files

| File | Change |
|---|---|
| `public/app.js` | In `createTaskCard` panel: replace the guests + add-to-gcal blocks with the gated section markup (toggle, Start/End date-trigger + time, guests inside, Google + .ics buttons). Add `toggleAddToCalendar`, `combineCalDateTime`, `buildICS`, the `.ics` download, adapt the gcal builder, generalize `openDatePicker`/`clearDueDate` to `data-dp-target`. Register actions. Update `getCardPayload` only if input classes change (keep `.cal-start`/`.cal-end` as the combined hidden inputs so it's unchanged). |
| `public/app.css` | `.cal-section`/`.cal-on` show-hide, the toggle switch, Start/End rows, time inputs, the two export buttons. |

No `server.js`, no `index.html`, no migration.

## CSP / interaction rules
All handlers via `data-action` + `__actions`. The `.ics` download uses a programmatically-created `<a>` + `URL.createObjectURL(blob)` — no inline handler, no eval.

## Error handling
- Export buttons with no Start date → no-op (or disabled). `combineCalDateTime` with empty date → `''` (no event). Toggling off clears + persists.

## Testing
- The UI + exports are browser-only (no headless browser): verify the toggle gates correctly; picking a date (picker) + time builds the right `cal_start`; **Google Calendar** opens a correct prefilled event (all-day and timed); **Download .ics** produces a file that imports correctly into Apple Calendar / Google Calendar (all-day and timed; with guests). `npm test` (server) stays green (no server change).
- `buildICS` and `combineCalDateTime` are pure string functions — correctness matters (date formatting, RFC-5545 escaping, all-day `DTEND` exclusivity). Verify by importing a generated `.ics` into a real calendar app during QA.

## iOS parity (deferred)
iOS `TaskDetailScreen` already has `cal_start`/`cal_end`. A date-only `cal_start` (`YYYY-MM-DD`) is a valid string there; confirm iOS doesn't choke on the missing time (it currently expects `datetime-local`-style values). Full iOS parity (gated toggle + `.ics` via expo-sharing) is a separate follow-up, not in this spec.
