import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { signupAndAgent } from './helpers/agent.js';

describe('tasks CRUD', () => {
  it('creates, lists, and deletes a task scoped to the signed-in user', async () => {
    const agent = await signupAndAgent();

    const create = await agent
      .post('/api/tasks')
      .send({ text: 'Write tests', stage: 'backlog' });
    expect(create.status).toBe(200);
    expect(create.body.text).toBe('Write tests');
    expect(create.body.stage).toBe('backlog');
    const id = create.body.id;

    const list = await agent.get('/api/tasks');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(id);

    const del = await agent.delete(`/api/tasks/${id}`);
    expect(del.status).toBe(200);

    const after = await agent.get('/api/tasks');
    expect(after.body).toHaveLength(0);
  });

  it('rejects task text over 2000 chars with a 400', async () => {
    const agent = await signupAndAgent();
    const res = await agent.post('/api/tasks').send({ text: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('requires auth for /api/tasks', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('PUT preserves unrelated fields when only a subset is sent', async () => {
    const agent = await signupAndAgent();
    const create = await agent.post('/api/tasks').send({
      text: 'Recurring report',
      stage: 'backlog',
      priority: 'high',
      recurrence: 'weekly',
      due_date: '2026-06-01',
    });
    expect(create.status).toBe(200);
    const id = create.body.id;

    // iOS-style toggleDone: send only stage. Previously this wiped
    // recurrence, priority, due_date back to defaults.
    const put = await agent.put(`/api/tasks/${id}`).send({ stage: 'done' });
    expect(put.status).toBe(200);

    const list = await agent.get('/api/tasks');
    const task = list.body.find(t => t.id === id);
    expect(task.stage).toBe('done');
    expect(task.priority).toBe('high');
    expect(task.recurrence).toBe('weekly');
    expect(task.due_date).toBe('2026-06-01');
  });

  it('PUT honours an explicit empty value to clear a field', async () => {
    const agent = await signupAndAgent();
    const create = await agent.post('/api/tasks').send({
      text: 'Task with recurrence',
      stage: 'backlog',
      recurrence: 'daily',
    });
    const id = create.body.id;

    // Explicitly clear recurrence by sending ''.
    const put = await agent.put(`/api/tasks/${id}`).send({ recurrence: '' });
    expect(put.status).toBe(200);

    const list = await agent.get('/api/tasks');
    const task = list.body.find(t => t.id === id);
    expect(task.recurrence).toBe('');
  });

  it('rejects POST /api/tasks without CSRF protection header', async () => {
    // Build the agent the normal way (which auto-injects X-Requested-With),
    // then make a raw supertest call that omits the header to simulate a
    // cross-origin form-based CSRF attack.
    const agent = await signupAndAgent();
    const res = await request.agent(app)
      .post('/api/tasks')
      .set('Cookie', agent.jar.getCookies('http://127.0.0.1').join('; '))
      .send({ text: 'csrf attempt' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('csrf_protection');
  });

  it('rejects a category_id belonging to another board with 400', async () => {
    const agent = await signupAndAgent();
    // Second board + a category that lives on it.
    const board2 = (await agent.post('/api/boards').send({ name: 'Second' })).body;
    const cat2 = (await agent
      .post(`/api/categories?board=${board2.id}`)
      .send({ name: 'B2 only', color: '#34A853' })).body;

    // Creating a task on the default board must not accept board2's category.
    const create = await agent
      .post('/api/tasks')
      .send({ text: 'cross-board cat', category_id: cat2.id });
    expect(create.status).toBe(400);

    // Same guard on update.
    const task = (await agent.post('/api/tasks').send({ text: 'ok' })).body;
    const put = await agent
      .put(`/api/tasks/${task.id}`)
      .send({ category_id: cat2.id });
    expect(put.status).toBe(400);
  });
});

describe('GET /api/tasks/count', () => {
  it('returns the active task count', async () => {
    const agent = await signupAndAgent();
    await agent.post('/api/tasks').send({ text: 'one' });
    await agent.post('/api/tasks').send({ text: 'two' });
    await agent.post('/api/tasks').send({ text: 'three' });

    const res = await agent.get('/api/tasks/count');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 3 });
  });

  it('returns 0 for archived count when nothing is archived', async () => {
    const agent = await signupAndAgent();
    await agent.post('/api/tasks').send({ text: 'still open' });

    const res = await agent.get('/api/tasks/count?archived=true');
    expect(res.body).toEqual({ count: 0 });
  });

  it('counts archived tasks separately from active', async () => {
    const agent = await signupAndAgent();
    const a = (await agent.post('/api/tasks').send({ text: 'a' })).body;
    const b = (await agent.post('/api/tasks').send({ text: 'b' })).body;
    await agent.put(`/api/tasks/${a.id}`).send({ archived: true });

    const active = await agent.get('/api/tasks/count');
    const archived = await agent.get('/api/tasks/count?archived=true');
    expect(active.body.count).toBe(1);
    expect(archived.body.count).toBe(1);
  });
});

describe('GET /api/tasks?archived=true pagination', () => {
  it('caps the result at the requested limit (max 500)', async () => {
    const agent = await signupAndAgent();
    // Create five archived tasks
    for (let i = 0; i < 5; i++) {
      const t = (await agent.post('/api/tasks').send({ text: `t${i}` })).body;
      await agent.put(`/api/tasks/${t.id}`).send({ archived: true });
    }

    const res = await agent.get('/api/tasks?archived=true&limit=2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});
