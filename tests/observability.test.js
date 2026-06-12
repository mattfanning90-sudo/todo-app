import { describe, it, expect } from 'vitest';
import request from 'supertest';
import * as Sentry from '@sentry/node';

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
