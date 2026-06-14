import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import database from '../../database.js';

const { pool } = database;

// GET /api/reminders/agenda filters on TEXT due_date with a date RANGE
// (>= today AND <= today+60d) plus the cross-board owner/member join. pg-mem
// models TEXT range comparisons loosely, so the horizon bounds + the shared-board
// inclusion are asserted here on real Postgres.

const ymd = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

async function signup(email, username) {
  const agent = request.agent(app);
  await agent.post('/auth/signup').type('form').send({
    email, password: 'StrongPass1234', name: username, username,
  });
  const me = await agent.get('/api/user').set('X-Requested-With', 'fetch');
  const boards = await agent.get('/api/boards').set('X-Requested-With', 'fetch');
  return { agent, userId: me.body.id, board: boards.body[0] };
}
const create = (agent, boardId, body) =>
  agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch')
    .send({ board_id: boardId, ...body }).then(r => r.body);

describe('real-PG: GET /api/reminders/agenda', () => {
  it('applies the 60-day horizon, excludes past/done/dateless, orders by due_date', async () => {
    const { agent, board } = await signup('agenda1@example.com', 'agenda1');

    await create(agent, board.id, { text: 'far',      due_date: ymd(2),  stage: 'backlog' });
    await create(agent, board.id, { text: 'near',     due_date: ymd(1),  stage: 'backlog' });
    await create(agent, board.id, { text: 'past',     due_date: ymd(-3), stage: 'backlog' });
    await create(agent, board.id, { text: 'beyond',   due_date: ymd(90), stage: 'backlog' });
    await create(agent, board.id, { text: 'done',     due_date: ymd(2),  stage: 'done' });
    await create(agent, board.id, { text: 'dateless', due_date: '',      stage: 'backlog' });

    const res = await agent.get('/api/reminders/agenda').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    const texts = res.body.map(t => t.text);

    expect(texts).toEqual(['near', 'far']);          // in-horizon, ordered by due_date ASC
    expect(texts).not.toContain('past');             // due_date < today
    expect(texts).not.toContain('beyond');           // due_date > today + 60d
    expect(texts).not.toContain('done');             // stage = done
    expect(texts).not.toContain('dateless');         // due_date = ''
  });

  it('includes upcoming tasks from a board shared with the user (cross-board)', async () => {
    const owner = await signup('owner@example.com', 'owneruser');
    const member = await signup('member@example.com', 'memberuser');

    await create(owner.agent, owner.board.id, { text: 'shared task', due_date: ymd(3), stage: 'backlog' });
    await pool.query(
      'INSERT INTO board_members (board_id, board_owner_id, member_user_id) VALUES ($1, $2, $3)',
      [owner.board.id, owner.userId, member.userId]
    );

    const res = await member.agent.get('/api/reminders/agenda').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    const shared = res.body.find(t => t.text === 'shared task');
    expect(shared, 'a member should see upcoming tasks on a shared board').toBeTruthy();
    expect(shared.board_id).toBe(owner.board.id);
    expect(shared.board_name).toBe(owner.board.name);
  });
});
