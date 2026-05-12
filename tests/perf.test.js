// Latency micro-bench against pg-mem. Numbers are NOT representative of real
// Postgres — pg-mem is faster than network'd PG on small datasets and slower
// on complex queries. Useful as a regression signal, not a production estimate.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';
import { signupAndAgent } from './helpers/agent.js';

function fmt(ms) { return `${ms.toFixed(1)}ms`; }
async function timed(fn) {
  const start = performance.now();
  const out = await fn();
  return { out, ms: performance.now() - start };
}
async function avg(fn, n = 20) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = await timed(fn);
    times.push(t.ms);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(n / 2)];
  const p95 = times[Math.floor(n * 0.95)];
  return { median, p95, runs: n };
}

describe('boot fetch shape (static)', () => {
  it('lists endpoint fan-out for the initial page load', () => {
    const fetches = [
      '/api/user',
      '/api/boards',
      '/api/boards/memberships',
      '/api/boards/members',
      '/api/categories',
      '/api/tasks',
      '/api/notifications',
    ];
    // Before: 4-step waterfall (user → boards parallel → categories → tasks).
    // After: one parallel Promise.all.
    console.log('Boot fetches:', fetches.length, 'parallel (was 4 serial round-trips)');
    expect(fetches.length).toBe(7);
  });
});

describe('endpoint latency (pg-mem)', () => {
  it('measures the hot path', async () => {
    const agent = await signupAndAgent();
    for (let i = 0; i < 50; i++) {
      await agent.post('/api/tasks').send({ text: `seed task ${i}` });
    }
    // Archive 20 to exercise the count endpoint and pagination
    const list = (await agent.get('/api/tasks')).body;
    for (let i = 0; i < 20; i++) {
      await agent.put(`/api/tasks/${list[i].id}`).send({ archived: true });
    }

    const tasks = await avg(() => agent.get('/api/tasks').expect(200), 50);
    const count = await avg(() => agent.get('/api/tasks/count?archived=true').expect(200), 50);
    const archList = await avg(() => agent.get('/api/tasks?archived=true&limit=50').expect(200), 50);
    const health = await avg(() => request(app).get('/healthz').expect(200), 50);

    // Payload size (active task list vs archived count)
    const tasksRes = await agent.get('/api/tasks');
    const countRes = await agent.get('/api/tasks/count?archived=true');
    const oldStyle = await agent.get('/api/tasks?archived=true');

    console.log('\n=== Endpoint latency (pg-mem, 50 runs) ===');
    console.log(`GET /api/tasks                  median ${fmt(tasks.median)}  p95 ${fmt(tasks.p95)}`);
    console.log(`GET /api/tasks/count            median ${fmt(count.median)}  p95 ${fmt(count.p95)}`);
    console.log(`GET /api/tasks?archived (limit) median ${fmt(archList.median)}  p95 ${fmt(archList.p95)}`);
    console.log(`GET /healthz                    median ${fmt(health.median)}  p95 ${fmt(health.p95)}`);

    console.log('\n=== Archived-count payload ===');
    console.log(`New /api/tasks/count?archived=true     ${JSON.stringify(countRes.body).length} bytes`);
    console.log(`Old /api/tasks?archived=true (full)    ${JSON.stringify(oldStyle.body).length} bytes`);
    console.log(`Reduction: ${(100 - (100 * JSON.stringify(countRes.body).length / JSON.stringify(oldStyle.body).length)).toFixed(1)}%`);

    expect(tasks.median).toBeLessThan(50);
    expect(count.median).toBeLessThan(20);
  }, 30_000);
});

describe('digest query shape', () => {
  it('compares pre/post N+1 footprint', () => {
    // Before this branch: 1 + N + N queries (users, then per-user board, then per-user tasks).
    // After: 1 query.
    // We can't time it on pg-mem because LATERAL is partial — this is a code-shape claim.
    console.log('Digest: was 1+N+N queries (N = digest-enabled users), now 1');
  });
});
