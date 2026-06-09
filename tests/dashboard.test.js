import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

// Only the auth guard is exercised here. The dashboard's stats query uses
// COUNT(*) FILTER (WHERE ...) plus date functions that pg-mem cannot model
// faithfully — pg-mem ignores the FILTER predicate and returns COUNT(*) of all
// rows, and throws on some of the date funcs — so count correctness cannot be
// asserted under pg-mem (see docs/testing.md "What isn't covered").
//
// The overdue regression this guards (due_date is TEXT) was validated against a
// real Postgres instead:
//   `due_date < CURRENT_DATE`            -> ERROR: operator does not exist: text < date  -> 500
//   `due_date <> '' AND due_date < $2`   -> correct count (mirrors /api/tasks/today)
describe('GET /api/dashboard', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });
});
