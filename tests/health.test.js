import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('GET /healthz', () => {
  it('returns 200 with ok:true when the DB is reachable', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // /healthz now also carries pool saturation counts (A2 observability).
    expect(res.body).toHaveProperty('pool');
  });
});

describe('GET /readyz', () => {
  it('returns 200 ready:true when the DB is reachable (readiness gate)', async () => {
    // Railway's healthcheckPath. Outside production the migrations-applied check
    // is skipped, so this asserts the DB-reachable readiness path.
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});

describe('security headers', () => {
  it('sets a strict CSP without unsafe-inline on script-src', async () => {
    const res = await request(app).get('/healthz');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toMatch(/script-src 'self'(;| )/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/script-src-attr 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
  });

  it('echoes a per-request ID in X-Request-Id', async () => {
    const a = await request(app).get('/healthz');
    const b = await request(app).get('/healthz');
    expect(a.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
    expect(b.headers['x-request-id']).toMatch(/^[a-f0-9]{16}$/);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });
});
