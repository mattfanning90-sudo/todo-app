import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('signup password policy', () => {
  it('rejects passwords under 12 chars with error=weak', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'a@b.com', password: 'Short1A' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=weak&mode=signup');
  });

  it('rejects passwords missing complexity (no digit)', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'a@b.com', password: 'NoDigitsHere' });
    expect(res.headers.location).toBe('/login?error=weak&mode=signup');
  });

  it('rejects passwords missing uppercase', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'a@b.com', password: 'all_lower_1234' });
    expect(res.headers.location).toBe('/login?error=weak&mode=signup');
  });

  it('accepts a strong password and redirects to /', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'strong@b.com', password: 'StrongPass1234', name: 'S', username: 'strongs' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('login', () => {
  it('lets a signed-up user log in and access /api/user', async () => {
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'bob@b.com', password: 'GoodPass1234X', name: 'Bob', username: 'bob' });

    const agent = request.agent(app);
    const login = await agent
      .post('/auth/login')
      .type('form')
      .send({ email: 'bob@b.com', password: 'GoodPass1234X' });
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe('/');

    const me = await agent.get('/api/user');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('bob@b.com');
    expect(me.body.username).toBe('bob');
  });

  it('returns null from /api/user for unauthenticated requests', async () => {
    const res = await request(app).get('/api/user');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
