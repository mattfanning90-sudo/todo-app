import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';

// The jsonb wire-shape contract that the fast pg-mem suite CAN'T check: pg-mem
// skips migration 012 (TEXT→jsonb), so there `subtasks`/`owners` come back as
// the raw string "[]". On real Postgres they're jsonb → parsed arrays, matching
// iOS `Task.subtasks: {...}[] | null`. This guards the string-vs-array drift
// that would crash the iOS client.
describe('real-PG contract: tasks jsonb fields are parsed arrays', () => {
  it('GET /api/tasks returns subtasks as an array (not a string)', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').type('form').send({
      email: 'jsonb@example.com', password: 'StrongPass1234', name: 'J', username: 'jsonbuser',
    });
    const boards = await agent.get('/api/boards').set('X-Requested-With', 'fetch');
    const boardId = boards.body[0].id;

    await agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch').send({
      text: 'task one', board_id: boardId,
      subtasks: [{ text: 'a', done: false }, { text: 'b', done: true }],
    });

    const res = await agent.get(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    const t = res.body.find(x => x.text === 'task one');
    expect(t, 'created task should be returned').toBeTruthy();

    expect(Array.isArray(t.subtasks), 'subtasks must be a parsed array, not a string').toBe(true);
    expect(t.subtasks).toHaveLength(2);
    expect(t.subtasks[0]).toMatchObject({ text: 'a', done: false });

    // owners is the other jsonb column converted by 012 (server-internal, but
    // its array shape is part of the same drift surface).
    expect(Array.isArray(t.owners)).toBe(true);
  });
});
