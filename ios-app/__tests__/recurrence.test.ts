import { getNextDueDate } from '@/utils/recurrence';

// Helper to format a local Date as YYYY-MM-DD (avoids UTC drift in assertions).
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('getNextDueDate', () => {
  describe('null / none recurrence → null (no spawn)', () => {
    it('returns null for recurrence "none"', () => {
      expect(getNextDueDate('2026-06-14', 'none')).toBeNull();
    });
    it('returns null for empty string recurrence', () => {
      expect(getNextDueDate('2026-06-14', '')).toBeNull();
    });
    it('returns null for null recurrence', () => {
      expect(getNextDueDate('2026-06-14', null)).toBeNull();
    });
    it('returns null for undefined recurrence', () => {
      expect(getNextDueDate('2026-06-14', undefined)).toBeNull();
    });
  });

  describe('no due date → falls back to today (web behaviour)', () => {
    it('null dueDate + daily returns today + 1 (not null)', () => {
      const expected = new Date();
      expected.setDate(expected.getDate() + 1);
      expect(getNextDueDate(null, 'daily')).toBe(fmtLocal(expected));
    });
    it('undefined dueDate + weekly returns today + 7 (not null)', () => {
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(getNextDueDate(undefined, 'weekly')).toBe(fmtLocal(expected));
    });
  });

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
      const expected = new Date();
      expected.setDate(expected.getDate() + 7);
      expect(getNextDueDate('2026-06-14', 'after:7')).toBe(fmtLocal(expected));
    });
    it('after:1 returns tomorrow', () => {
      const expected = new Date();
      expected.setDate(expected.getDate() + 1);
      expect(getNextDueDate('2026-06-14', 'after:1')).toBe(fmtLocal(expected));
    });
    it('after: with no number returns null', () => {
      expect(getNextDueDate('2026-06-14', 'after:')).toBeNull();
    });
  });

  describe('legacy / unknown recurrence strings → spawn with base date unchanged', () => {
    it('unknown string returns the base (dueDate) unchanged', () => {
      expect(getNextDueDate('2026-06-14', 'bogus')).toBe('2026-06-14');
    });
    it('"biweekly" returns the base date unchanged', () => {
      expect(getNextDueDate('2026-06-14', 'biweekly')).toBe('2026-06-14');
    });
    it('"yearly" returns the base date unchanged', () => {
      expect(getNextDueDate('2026-06-14', 'yearly')).toBe('2026-06-14');
    });
    it('legacy string with no dueDate returns today unchanged', () => {
      const today = new Date();
      const expected = fmtLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
      expect(getNextDueDate(null, 'biweekly')).toBe(expected);
    });
  });
});
