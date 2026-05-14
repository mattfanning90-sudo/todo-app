import { describe, it, expect } from 'vitest';
import { app, runAutoArchive } from '../server.js';
import { pool } from '../database.js';
import { signupAndAgent } from './helpers/agent.js';

// Move a task's completed_at into the past so runAutoArchive picks it up.
async function ageCompletedAt(taskId, intervalSql) {
  await pool.query(
    `UPDATE tasks SET completed_at = NOW() - INTERVAL '${intervalSql}' WHERE id = $1`,
    [taskId]
  );
}

async function fetchTask(agent, id) {
  const list = await agent.get('/api/tasks?archived=true');
  return list.body.find(t => t.id === id) ?? null;
}

describe('runAutoArchive', () => {
  it('archives done tasks completed more than a day ago', async () => {
    const agent = await signupAndAgent({ email: 'arc1@b.com', username: 'arc1' });
    const t = (await agent.post('/api/tasks').send({ text: 'old done' })).body;
    await agent.put(`/api/tasks/${t.id}`).send({ stage: 'done' });
    await ageCompletedAt(t.id, '2 days');

    await runAutoArchive();

    const archived = await fetchTask(agent, t.id);
    expect(archived).not.toBeNull();
    expect(archived.archived).toBe(true);
    expect(archived.archived_at).not.toBeNull();
  });

  it('leaves done tasks completed under 24h alone', async () => {
    const agent = await signupAndAgent({ email: 'arc2@b.com', username: 'arc2' });
    const t = (await agent.post('/api/tasks').send({ text: 'fresh done' })).body;
    await agent.put(`/api/tasks/${t.id}`).send({ stage: 'done' });
    // completed_at defaults to NOW() on the stage transition — no aging applied.

    await runAutoArchive();

    const active = await agent.get('/api/tasks');
    expect(active.body.find(x => x.id === t.id)).toBeTruthy();
  });

  it('does not touch backlog or in_progress tasks regardless of age', async () => {
    const agent = await signupAndAgent({ email: 'arc3@b.com', username: 'arc3' });
    const b = (await agent.post('/api/tasks').send({ text: 'backlog' })).body;
    const p = (await agent.post('/api/tasks').send({ text: 'in progress' })).body;
    await agent.put(`/api/tasks/${p.id}`).send({ stage: 'in_progress' });
    // Force a completed_at on non-done rows to prove the stage filter holds.
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await pool.query('UPDATE tasks SET completed_at = $1 WHERE id = $2', [past, b.id]);
    await pool.query('UPDATE tasks SET completed_at = $1 WHERE id = $2', [past, p.id]);

    await runAutoArchive();

    const active = await agent.get('/api/tasks');
    const ids = active.body.map(x => x.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(p.id);
  });

  it('is idempotent — re-runs do not bump archived_at on already-archived rows', async () => {
    const agent = await signupAndAgent({ email: 'arc4@b.com', username: 'arc4' });
    const t = (await agent.post('/api/tasks').send({ text: 'twice' })).body;
    await agent.put(`/api/tasks/${t.id}`).send({ stage: 'done' });
    await ageCompletedAt(t.id, '3 days');

    await runAutoArchive();
    const firstAt = (await fetchTask(agent, t.id)).archived_at;

    await runAutoArchive();
    const secondAt = (await fetchTask(agent, t.id)).archived_at;

    expect(secondAt).toEqual(firstAt);
  });
});

describe('PUT /api/user/digest', () => {
  it('accepts the four valid frequencies', async () => {
    const agent = await signupAndAgent({ email: 'dig@b.com', username: 'dig' });
    for (const frequency of ['none', 'daily', 'weekly', 'fortnightly']) {
      const res = await agent.put('/api/user/digest').send({ frequency });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
    const me = await agent.get('/api/user');
    expect(me.body.digest_frequency).toBe('fortnightly');
  });

  it('rejects unknown frequencies with 400', async () => {
    const agent = await signupAndAgent({ email: 'dig2@b.com', username: 'dig2' });
    const res = await agent.put('/api/user/digest').send({ frequency: 'biweekly' });
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).put('/api/user/digest').send({ frequency: 'daily' });
    expect(res.status).toBe(401);
  });
});
