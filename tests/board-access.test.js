import { describe, it, expect } from 'vitest';
import { signupAndAgent } from './helpers/agent.js';

// Assignment and task-sharing must be constrained to collaborators on the board,
// so a client can't push a task/notification to an arbitrary user id. Category
// deletion is owner-only.
describe('board-member access control', () => {
  async function twoUsers() {
    const alice = await signupAndAgent({ email: 'alice2@example.com', password: 'Sup3rSecretPass', username: 'alice2' });
    const bob = await signupAndAgent({ email: 'bob2@example.com', password: 'Sup3rSecretPass', username: 'bob2' });
    const bobUser = (await bob.get('/api/user')).body;
    return { alice, bob, bobUser };
  }

  it('rejects assigning a task to a non-board-member (POST and PUT) with 400', async () => {
    const { alice, bobUser } = await twoUsers();
    const create = await alice.post('/api/tasks').send({ text: 'task', assigned_to_user_id: bobUser.id });
    expect(create.status).toBe(400);

    const task = (await alice.post('/api/tasks').send({ text: 'task2' })).body;
    const put = await alice.put(`/api/tasks/${task.id}`).send({ assigned_to_user_id: bobUser.id });
    expect(put.status).toBe(400);
  });

  it('allows assigning to a user who is a board member', async () => {
    const { alice, bobUser } = await twoUsers();
    const inv = await alice.post('/api/boards/invite').send({ email: 'bob2' }); // username invite → immediate join
    expect(inv.body.joined).toBe(true);
    const create = await alice.post('/api/tasks').send({ text: 'task', assigned_to_user_id: bobUser.id });
    expect(create.status).toBe(200);
  });

  it('rejects sharing a task with a non-board-member with 400', async () => {
    const { alice, bobUser } = await twoUsers();
    const task = (await alice.post('/api/tasks').send({ text: 'shareable' })).body;
    const res = await alice.post(`/api/tasks/${task.id}/share`).send({ recipient_user_id: bobUser.id });
    expect(res.status).toBe(400);
  });

  it('lets only the board owner delete categories (member gets 403)', async () => {
    const { alice, bob } = await twoUsers();
    const aliceBoard = (await alice.get('/api/boards')).body[0];
    const cat = (await alice.post(`/api/categories?board=${aliceBoard.id}`).send({ name: 'Owned', color: '#34A853' })).body;
    await alice.post('/api/boards/invite').send({ email: 'bob2' }); // bob joins alice's board
    const res = await bob.delete(`/api/categories/${cat.id}?board=${aliceBoard.id}`);
    expect(res.status).toBe(403);
  });
});
