/**
 * Mirrors web's `getNextDueDate` (public/app.js ~line 1985).
 *
 * Returns the next YYYY-MM-DD due date for a recurring task, or null when the
 * task has no recurrence / no due date / an unrecognised recurrence string.
 *
 * Local-date math: we parse the YYYY-MM-DD string as local parts and work with
 * a local Date, then serialise back the same way. This avoids the UTC-midnight
 * drift that `new Date('YYYY-MM-DD')` / `.toISOString()` causes for users west
 * of UTC. The web reference uses `new Date(dueDate + 'T00:00:00')` (implicitly
 * local) then `.toISOString().split('T')[0]` which CAN drift for the non-after:
 * cases — we match its intent (local calendar math) rather than that specific
 * potential drift.
 */
export function getNextDueDate(dueDate: string | null | undefined, recurrence: string | null | undefined): string | null {
  if (!recurrence || recurrence === 'none') return null;
  if (!dueDate) return null;

  // Parse YYYY-MM-DD as local date parts to avoid UTC drift.
  const [y, m, d] = dueDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;

  if (recurrence === 'daily') {
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + 1);
    return formatLocalDate(base);
  }

  if (recurrence === 'weekly') {
    const base = new Date(y, m - 1, d);
    base.setDate(base.getDate() + 7);
    return formatLocalDate(base);
  }

  if (recurrence === 'monthly') {
    const base = new Date(y, m - 1, d);
    base.setMonth(base.getMonth() + 1);
    return formatLocalDate(base);
  }

  if (recurrence.startsWith('after:')) {
    const days = parseInt(recurrence.split(':')[1], 10);
    if (isNaN(days)) return null;
    // after:N is relative to today (completion date), matching web's `now` usage.
    const now = new Date();
    now.setDate(now.getDate() + days);
    return formatLocalDate(now);
  }

  return null;
}

function formatLocalDate(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
