import { getNextDueDate } from '@/utils/recurrence';

describe('getNextDueDate', () => {
  describe('daily', () => {
    it('advances by 1 day', () => {
      expect(getNextDueDate('2026-06-14', 'daily')).toBe('2026-06-15');
    });
    it('rolls over month boundary', () => {
      expect(getNextDueDate('2026-06-30', 'daily')).toBe('2026-07-01');
    });
  });

  describe('weekly', () => {
    it('advances by 7 days', () => {
      expect(getNextDueDate('2026-06-14', 'weekly')).toBe('2026-06-21');
    });
    it('rolls over month boundary', () => {
      expect(getNextDueDate('2026-06-28', 'weekly')).toBe('2026-07-05');
    });
  });

  describe('monthly', () => {
    it('advances by 1 month', () => {
      expect(getNextDueDate('2026-06-14', 'monthly')).toBe('2026-07-14');
    });
    it('advances across year boundary', () => {
      expect(getNextDueDate('2026-12-14', 'monthly')).toBe('2027-01-14');
    });
  });

  describe('after:N', () => {
    it('after:7 returns today + 7 days', () => {
      // Freeze time so the result is deterministic.
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 7);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(getNextDueDate('2026-06-14', 'after:7')).toBe(fmt(expected));
    });
    it('after:1 returns tomorrow', () => {
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 1);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(getNextDueDate('2026-06-14', 'after:1')).toBe(fmt(expected));
    });
  });

  describe('null / no-op cases', () => {
    it('returns null for recurrence "none"', () => {
      expect(getNextDueDate('2026-06-14', 'none')).toBeNull();
    });
    it('returns null for null recurrence', () => {
      expect(getNextDueDate('2026-06-14', null)).toBeNull();
    });
    it('returns null for undefined recurrence', () => {
      expect(getNextDueDate('2026-06-14', undefined)).toBeNull();
    });
    it('returns null when due_date is null', () => {
      expect(getNextDueDate(null, 'daily')).toBeNull();
    });
    it('returns null when due_date is undefined', () => {
      expect(getNextDueDate(undefined, 'weekly')).toBeNull();
    });
    it('returns null for unknown recurrence string', () => {
      expect(getNextDueDate('2026-06-14', 'bogus')).toBeNull();
    });
    it('returns null for after: with no number', () => {
      expect(getNextDueDate('2026-06-14', 'after:')).toBeNull();
    });
  });
});
