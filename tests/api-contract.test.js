import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

// API contract (A3). The web + iOS clients consume these response shapes; iOS
// hand-mirrors them in ios-app/src/api/types.ts. These tests assert the server
// actually emits every key the iOS types declare — so a server-side rename or
// dropped column breaks THIS build instead of silently surfacing on TestFlight.
//
// Keep the key lists in sync with ios-app/src/api/types.ts.
//
// SCOPE — what this (pg-mem) layer can and can't assert:
//  - It asserts KEY PRESENCE: a dropped/renamed server column fails the build.
//  - It does NOT assert jsonb WIRE SHAPE. pg-mem skips migration 012 (the
//    TEXT→jsonb conversion), so here `subtasks`/`owners` come back as the raw
//    string "[]", whereas prod (jsonb) returns a parsed array. Asserting
//    Array.isArray(subtasks) would pass in prod but FAIL here. So the
//    array-vs-string contract for jsonb fields — and /api/dashboard, whose
//    COUNT(*) FILTER + DATE/INTERVAL queries pg-mem can't run — are
//    contract-tested in the real-Postgres layer (A5), not here.

// ios-app/src/api/types.ts → interface Task (required, non-optional keys).
// Optional/joined keys (archived?, assigned_to_name?, assigned_to_username?) are
// not asserted — they're absent on some responses by design.
const TASK_KEYS = [
  'id', 'text', 'status', 'stage', 'category_id', 'due_date', 'priority',
  'recurrence', 'subtasks', 'assigned_to_user_id', 'cal_start', 'cal_end',
  'archived_at', 'completed_at', 'position', 'board_id',
];

// ios-app/src/api/types.ts → interface TodayTask (all keys required).
const TODAY_TASK_KEYS = [
  'id', 'text', 'stage', 'due_date', 'priority', 'status', 'subtasks',
  'category_id', 'recurrence', 'assigned_to_user_id', 'cal_start', 'cal_end',
  'board_id', 'board_name', 'cat_name', 'cat_color', 'completed_at',
];

let agent;
let boardId;

beforeEach(async () => {
  agent = request.agent(app);
  await agent.post('/auth/signup').type('form').send({
    email: 'contract@example.com', password: 'StrongPass1234', name: 'Contract', username: 'contractuser',
  });
  const boards = await agent.get('/api/boards').set('X-Requested-With', 'fetch');
  boardId = boards.body[0].id;
});

describe('API contract: GET /api/tasks → iOS Task', () => {
  it('every task carries every key the iOS Task type requires', async () => {
    await agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch').send({
      text: 'contract task', board_id: boardId, stage: 'in_progress', priority: 'high', due_date: '2026-06-13',
    });
    const res = await agent.get(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    for (const task of res.body) {
      for (const key of TASK_KEYS) {
        expect(task, `GET /api/tasks response is missing iOS Task key "${key}"`).toHaveProperty(key);
      }
    }
  });
});

describe('API contract: GET /api/tasks/today → iOS TodayTask', () => {
  it('every today-task carries every key the iOS TodayTask type requires', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await agent.post(`/api/tasks?board=${boardId}`).set('X-Requested-With', 'fetch').send({
      text: 'today task', board_id: boardId, priority: 'medium', due_date: today,
    });
    const res = await agent.get('/api/tasks/today').set('X-Requested-With', 'fetch');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const task = res.body.find(t => t.text === 'today task');
    expect(task, 'expected the task due today to appear in /api/tasks/today').toBeTruthy();
    for (const key of TODAY_TASK_KEYS) {
      expect(task, `GET /api/tasks/today response is missing iOS TodayTask key "${key}"`).toHaveProperty(key);
    }
  });
});
