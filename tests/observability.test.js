import { describe, it, expect } from 'vitest';
import request from 'supertest';
import * as Sentry from '@sentry/node';
import instrument from '../instrument.js';

// /metrics is gated by RESTORE_SECRET; set it before importing the app so the
// shared requireSecret middleware has a configured secret in the test env.
process.env.RESTORE_SECRET = 'test-restore-secret';
const { app } = await import('../server.js');

const SECRET = { 'x-restore-secret': 'test-restore-secret' };
const readMetrics = () => request(app).get('/metrics').set(SECRET);

describe('observability: Sentry is inert under test', () => {
  it('does not initialise a Sentry client when NODE_ENV=test', () => {
    // instrument.js guards on NODE_ENV !== 'test', so no client is created and
    // nothing is ever sent during the suite.
    expect(Sentry.getClient()).toBeUndefined();
  });
});

describe('observability: /healthz exposes pool saturation', () => {
  it('still returns ok:true and now includes pool counts', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).toHaveProperty('pool');
    for (const k of ['total', 'idle', 'waiting']) {
      expect(res.body.pool).toHaveProperty(k); // value may be null under pg-mem
    }
  });
});

describe('observability: gated /metrics SLI endpoint', () => {
  it('401s without the secret', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('returns auth + pool + uptime counters with the secret', async () => {
    const res = await readMetrics();
    expect(res.status).toBe(200);
    expect(res.body.auth).toBeDefined();
    expect(typeof res.body.auth.loginSuccess).toBe('number');
    expect(typeof res.body.auth.loginFail).toBe('number');
    expect(res.body).toHaveProperty('pool');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('increments loginFail on a failed login', async () => {
    const before = (await readMetrics()).body.auth.loginFail;
    await request(app).post('/auth/login')
      .set('Accept', 'application/json').set('X-Requested-With', 'fetch')
      .send({ email: 'nobody-here@example.com', password: 'wrongpassword1X' });
    const after = (await readMetrics()).body.auth.loginFail;
    expect(after).toBe(before + 1);
  });

  it('increments loginSuccess on a successful login', async () => {
    await request(app).post('/auth/signup').type('form')
      .send({ email: 'metrics-login@example.com', password: 'StrongPass1234', name: 'M', username: 'metricslogin' });
    const before = (await readMetrics()).body.auth.loginSuccess;
    await request(app).post('/auth/login')
      .set('Accept', 'application/json').set('X-Requested-With', 'fetch')
      .send({ email: 'metrics-login@example.com', password: 'StrongPass1234' });
    const after = (await readMetrics()).body.auth.loginSuccess;
    expect(after).toBe(before + 1);
  });
});

describe('observability: scrubEvent strips sensitive request fields (PII safety)', () => {
  const { scrubEvent } = instrument;

  it('removes request body, cookies, query_string, and sensitive headers', () => {
    const out = scrubEvent({
      request: {
        data: { email: 'a@b.com', password: 'hunter2' },        // plaintext password
        cookies: { 'connect.sid': 's:abc.def' },                 // session id
        query_string: 'secret=topsecret',                        // RESTORE_SECRET
        headers: {
          cookie: 'connect.sid=s:abc.def',
          authorization: 'Bearer x',
          'x-session-cookie': 'connect.sid=…',
          'x-restore-secret': 'topsecret',
          'user-agent': 'jest',                                  // non-sensitive — keep
        },
      },
    });
    expect(out.request.data).toBeUndefined();
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.query_string).toBeUndefined();
    expect(out.request.headers.cookie).toBeUndefined();
    expect(out.request.headers.authorization).toBeUndefined();
    expect(out.request.headers['x-session-cookie']).toBeUndefined();
    expect(out.request.headers['x-restore-secret']).toBeUndefined();
    expect(out.request.headers['user-agent']).toBe('jest');
  });

  it('is a no-op when the event has no request', () => {
    expect(scrubEvent({})).toEqual({});
    expect(scrubEvent({ request: {} })).toEqual({ request: {} });
  });
});

describe('observability: error-handler contract survives the Sentry handler', () => {
  it('a 5xx still returns exactly { error, requestId }', async () => {
    // Sentry.setupExpressErrorHandler is inserted right before the terminal
    // handler; this proves it calls next(err) and does not alter the response.
    const agent = request.agent(app);
    await agent.post('/auth/signup').type('form')
      .send({ email: 'contract500@example.com', password: 'StrongPass1234', name: 'C', username: 'contract500' });
    // Non-integer task id → pg-mem integer-cast error → 500 via wrap() + terminal handler.
    const res = await agent.put('/api/tasks/not-an-integer')
      .set('X-Requested-With', 'fetch')
      .send({ text: 'x' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error', requestId: res.headers['x-request-id'] });
  });
});
