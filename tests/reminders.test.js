import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

// Task reminders — preference endpoints + the scheduling agenda (pg-mem layer).
// Date-horizon + cross-board correctness lives in tests/realpg/reminders-agenda.test.js
// (A5), since it leans on TEXT due_date comparisons pg-mem models only loosely.

const ymd = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

let agent, boardId;

beforeEach(async () => {
  agent = request.agent(app);
  await agent.post('/auth/signup').type('form').send({
    email: 'rem@example.com', password: 'StrongPass1234', name: 'Rem', username: 'remuser',
  });
  const boards = await agent.get('/api/boards').set('X-Requested-With', 'fetch');
  boardId = boards.body[0].id;
});

const createTask = (fields) =>
  agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch')
    .send({ board_id: boardId, ...fields });

describe('GET /api/user — reminder prefs', () => {
  it('returns the three reminder fields with defaults for a new user', async () => {
    const res = await agent.get('/api/user').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      reminders_enabled: false, reminder_time: '09:00', reminder_lead_days: 0,
    });
  });
});

describe('PUT /api/user/reminders', () => {
  it('persists a valid update and round-trips via /api/user', async () => {
    const put = await agent.put('/api/user/reminders').set('X-Requested-With', 'fetch')
      .send({ enabled: true, time: '07:30', lead_days: 2 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ok: true });

    const user = await agent.get('/api/user').set('X-Requested-With', 'fetch');
    expect(user.body).toMatchObject({
      reminders_enabled: true, reminder_time: '07:30', reminder_lead_days: 2,
    });
  });

  it('rejects a malformed time', async () => {
    for (const time of ['9:00', '24:00', '07:60', 'noon', '0730']) {
      const res = await agent.put('/api/user/reminders').set('X-Requested-With', 'fetch')
        .send({ enabled: true, time, lead_days: 0 });
      expect(res.status, `time="${time}" should be rejected`).toBe(400);
      expect(res.body.error).toBe('invalid_reminders');
    }
  });

  it('rejects an out-of-range lead_days', async () => {
    for (const lead_days of [3, -1, '1', 1.5]) {
      const res = await agent.put('/api/user/reminders').set('X-Requested-With', 'fetch')
        .send({ enabled: true, time: '09:00', lead_days });
      expect(res.status, `lead_days=${lead_days} should be rejected`).toBe(400);
    }
  });

  it('rejects a non-boolean enabled', async () => {
    const res = await agent.put('/api/user/reminders').set('X-Requested-With', 'fetch')
      .send({ enabled: 'yes', time: '09:00', lead_days: 0 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reminders/agenda', () => {
  it('includes an upcoming dated task with the ReminderTask keys', async () => {
    await createTask({ text: 'pay rent', due_date: ymd(2), stage: 'backlog', priority: 'high' });
    const res = await agent.get('/api/reminders/agenda').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const task = res.body.find(t => t.text === 'pay rent');
    expect(task).toBeTruthy();
    for (const key of ['id', 'text', 'due_date', 'board_id', 'board_name']) {
      expect(task).toHaveProperty(key);
    }
  });

  it('excludes done tasks and dateless tasks', async () => {
    await createTask({ text: 'done task', due_date: ymd(1), stage: 'done' });
    await createTask({ text: 'dateless task', due_date: '', stage: 'backlog' });
    const res = await agent.get('/api/reminders/agenda').set('X-Requested-With', 'fetch');
    const texts = res.body.map(t => t.text);
    expect(texts).not.toContain('done task');
    expect(texts).not.toContain('dateless task');
  });
});
