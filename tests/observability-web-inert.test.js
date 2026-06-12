import { describe, it, expect } from 'vitest';
import request from 'supertest';

// This file proves the INERT state. server.js computes the Sentry ingest origin
// (and bakes it into the CSP connect-src) once at module load, so the with-DSN
// and without-DSN states need two separate import contexts. Here we ensure no
// browser DSN is set before importing, so the CSP must be unchanged.
delete process.env.SENTRY_BROWSER_DSN;
const { app } = await import('../server.js');

describe('web observability: inert without SENTRY_BROWSER_DSN', () => {
  it('CSP connect-src is just self — no Sentry/ingest host injected', async () => {
    const res = await request(app).get('/healthz');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/connect-src[^;]*'self'/);
    expect(csp).not.toMatch(/connect-src[^;]*sentry/);
    expect(csp).not.toMatch(/ingest/);
  });

  it('/config.js reports sentryDsn null so the client SDK stays inert', async () => {
    const res = await request(app).get('/config.js');
    expect(res.text).toContain('"sentryDsn":null');
  });
});
