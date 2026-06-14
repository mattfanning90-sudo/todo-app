import { describe, it, expect } from 'vitest';
import '../public/reminders.js'; // UMD: sets globalThis.Reminders (no browser APIs at load)

const { computeFireAt, reminderKey, shouldFire } = globalThis.Reminders;

// Shared fire-time logic (mirrored in ios-app/src/notifications/reminders.ts).
describe('computeFireAt', () => {
  it('fires on the due date at the reminder time when lead is 0', () => {
    const d = computeFireAt('2026-06-20', '09:00', 0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);   // June (0-indexed)
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('subtracts the lead days from the due date', () => {
    const d = computeFireAt('2026-06-20', '07:30', 2);
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(30);
  });

  it('rolls back across a month boundary when lead crosses it', () => {
    const d = computeFireAt('2026-07-01', '09:00', 2);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(29);
  });
});

describe('shouldFire', () => {
  const now = new Date('2026-06-20T10:00:00').getTime();
  const fired = new Set();

  it('is true for a passed, unfired reminder', () => {
    const fireAt = new Date('2026-06-20T09:00:00');
    expect(shouldFire(fireAt, now, fired, 'k1')).toBe(true);
  });

  it('is false for a future reminder', () => {
    const fireAt = new Date('2026-06-20T11:00:00');
    expect(shouldFire(fireAt, now, fired, 'k2')).toBe(false);
  });

  it('is false once the key has been recorded as fired', () => {
    const fireAt = new Date('2026-06-20T09:00:00');
    const seen = new Set(['k3']);
    expect(shouldFire(fireAt, now, seen, 'k3')).toBe(false);
  });
});

describe('reminderKey', () => {
  it('is stable per task + due date + fire moment', () => {
    const fireAt = new Date('2026-06-20T09:00:00');
    const k = reminderKey({ id: 7, due_date: '2026-06-20' }, fireAt);
    expect(k).toBe('7:2026-06-20:' + fireAt.getTime());
  });
});
