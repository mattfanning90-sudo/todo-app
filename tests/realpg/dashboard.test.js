import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';

// /api/dashboard uses COUNT(*) FILTER (WHERE …) + DATE()/INTERVAL — pg-mem
// IGNORES the FILTER predicate (returns COUNT(*) of all rows) and chokes on the
// date funcs, so dashboard.test.js (pg-mem) only checks the auth guard. Here, on
// real Postgres, we assert the counts are actually CORRECT, plus the
// DashboardData contract shape the iOS client depends on.
async function setup() {
  const agent = request.agent(app);
  await agent.post('/auth/signup').type('form').send({
    email: 'dash@example.com', password: 'StrongPass1234', name: 'D', username: 'dashuser',
  });
  const boards = await agent.get('/api/boards').set('X-Requested-With', 'fetch');
  return { agent, boardId: boards.body[0].id };
}
const create = (agent, boardId, body) =>
  agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch')
    .send({ board_id: boardId, ...body }).then(r => r.body);

describe('real-PG: GET /api/dashboard counts + DashboardData contract', () => {
  it('computes open / inProgress / overdue correctly and ships the iOS shape', async () => {
    const { agent, boardId } = await setup();

    await create(agent, boardId, { text: 'backlog A', stage: 'backlog' });                       // open
    await create(agent, boardId, { text: 'wip B', stage: 'in_progress' });                        // open + inProgress
    await create(agent, boardId, { text: 'overdue C', stage: 'backlog', due_date: '2020-01-01' }); // open + overdue
    const d = await create(agent, boardId, { text: 'done D', stage: 'backlog' });
    await agent.put(`/api/tasks/${d.id}?board=${boardId}`).set('X-Requested-With', 'fetch')
      .send({ board_id: boardId, stage: 'done' }); // stage→done sets completed_at (now)

    const res = await agent.get('/api/dashboard').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);

    // iOS DashboardData contract (the shape pg-mem can't validate end-to-end).
    for (const k of ['counts', 'trend', 'byPriority', 'byCategory']) expect(res.body).toHaveProperty(k);
    for (const p of ['high', 'medium', 'low', 'none']) expect(res.body.byPriority).toHaveProperty(p);
    expect(Array.isArray(res.body.trend)).toBe(true);

    // Correct counts — the whole point of real PG. pg-mem (FILTER ignored) would
    // report open=4 here; real Postgres applies the predicate.
    expect(res.body.counts.open).toBe(3);        // A, B, C (D is done → excluded)
    expect(res.body.counts.inProgress).toBe(1);  // B
    expect(res.body.counts.overdue).toBe(1);     // C (past due, not done)
    // `stats` is the legacy web shape — raw pg COUNT(*) strings (the web client
    // coerces them); only `counts` is parsed to numbers. Coerce to assert value.
    expect(Number(res.body.stats.done_total)).toBe(1);     // D
    expect(Number(res.body.stats.completed_week)).toBe(1); // D completed just now
  });
});
