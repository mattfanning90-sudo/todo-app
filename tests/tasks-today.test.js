import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { signupAndAgent } from './helpers/agent.js';

const isoOffset = (days) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

describe('GET /api/tasks/today', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/tasks/today');
    expect(res.status).toBe(401);
  });

  it('returns today + overdue across all boards, excluding future/archived/done/dateless', async () => {
    const agent = await signupAndAgent();
    const today = isoOffset(0);
    const yesterday = isoOffset(-1);
    const tomorrow = isoOffset(1);

    // Second board; signupAndAgent() already created this user's default board.
    const b2 = await agent.post('/api/boards').send({ name: 'Work' });
    expect(b2.status).toBe(200);
    const board2 = b2.body.id;

    const t1 = await agent.post('/api/tasks').send({ text: 'Due today board1', due_date: today });
    const t2 = await agent.post('/api/tasks').send({ text: 'Overdue board2', due_date: yesterday, boardId: board2 });
    await agent.post('/api/tasks').send({ text: 'Future', due_date: tomorrow });
    await agent.post('/api/tasks').send({ text: 'No due date' });            // due_date '' -> excluded
    const done = await agent.post('/api/tasks').send({ text: 'Old but done', due_date: yesterday });
    await agent.put(`/api/tasks/${done.body.id}`).send({ stage: 'done' });   // overdue+done -> excluded

    const res = await agent.get('/api/tasks/today');
    expect(res.status).toBe(200);
    const texts = res.body.map(r => r.text).sort();
    expect(texts).toEqual(['Due today board1', 'Overdue board2']);

    const due = res.body.find(r => r.text === 'Due today board1');
    expect(due).toHaveProperty('board_name');
    expect(due).toHaveProperty('cat_color'); // null is fine; key must exist
    expect(due).toHaveProperty('priority');
    expect(due).toHaveProperty('subtasks'); // sheet needs subtasks (pg-mem returns the column fine)
  });
});
