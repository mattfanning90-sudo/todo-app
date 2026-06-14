/**
 * Mirrors web's `getNextDueDate` (public/app.js ~line 1985).
 *
 * Returns the next YYYY-MM-DD due date for a recurring task, or null when the
 * task has no recurrence (falsy / 'none').
 *
 * Web behaviour mirrored exactly:
 *   - base = dueDate ? parse(dueDate) : today   ← falls back to TODAY (not null)
 *   - daily/weekly/monthly/after:N advance the date
 *   - any OTHER string (legacy: biweekly, weekdays, quarterly, yearly, …) falls
 *     through and returns base UNCHANGED so legacy recurring tasks still spawn
 *   - null/undefined/'none' recurrence → null (no spawn)
 *
 * Local-date math: we parse the YYYY-MM-DD string as local parts and work with
 * a local Date, then serialise back the same way. This avoids the UTC-midnight
 * drift that `new Date('YYYY-MM-DD')` / `.toISOString()` causes for users west
 * of UTC.
 */
export function getNextDueDate(dueDate: string | null | undefined, recurrence: string | null | undefined): string | null {
  if (!recurrence || recurrence === 'none') return null;

  // base: parse dueDate as local calendar date, or fall back to today.
  let base: Date;
  if (dueDate) {
    const [y, m, d] = dueDate.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    base = new Date(y, m - 1, d);
  } else {
    base = new Date();
    // Strip time so date math is clean.
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  }

  if (recurrence === 'daily') {
    base.setDate(base.getDate() + 1);
  } else if (recurrence === 'weekly') {
    base.setDate(base.getDate() + 7);
  } else if (recurrence === 'monthly') {
    base.setMonth(base.getMonth() + 1);
  } else if (recurrence.startsWith('after:')) {
    const days = parseInt(recurrence.split(':')[1], 10);
    if (isNaN(days)) return null;
    // after:N is relative to today (completion date), matching web's `now` usage.
    const now = new Date();
    now.setDate(now.getDate() + days);
    return formatLocalDate(now);
  }
  // Any other string (legacy biweekly/weekdays/quarterly/yearly/unknown):
  // web falls through and returns base unchanged — so legacy recurring tasks
  // still spawn a copy with the same base date.

  return formatLocalDate(base);
}

function formatLocalDate(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
