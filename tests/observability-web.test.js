import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Set the browser DSN before importing the app so the CSP connect-src host
// (computed at module load from the DSN) includes the Sentry ingest origin.
process.env.SENTRY_BROWSER_DSN = 'https://pub@o4509999.ingest.us.sentry.io/123456';
const { app } = await import('../server.js');

describe('web observability: /config.js runtime config', () => {
  it('serves JS that sets window.__APP_CONFIG__ with the browser DSN', async () => {
    const res = await request(app).get('/config.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('window.__APP_CONFIG__');
    expect(res.text).toContain('o4509999.ingest.us.sentry.io');
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('reports sentryDsn null when unset (read at request time)', async () => {
    const saved = process.env.SENTRY_BROWSER_DSN;
    delete process.env.SENTRY_BROWSER_DSN;
    const res = await request(app).get('/config.js');
    expect(res.text).toContain('"sentryDsn":null');
    process.env.SENTRY_BROWSER_DSN = saved;
  });
});

describe('web observability: CSP allows the Sentry ingest origin', () => {
  it('connect-src includes the ingest origin derived from the DSN, plus self', async () => {
    const res = await request(app).get('/healthz');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/connect-src[^;]*'self'/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/o4509999\.ingest\.us\.sentry\.io/);
  });

  it('does not weaken script-src (vendored bundle is same-origin)', async () => {
    const res = await request(app).get('/healthz');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'(;| )/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});

describe('web observability: vendored SDK + boot are served', () => {
  it('serves the vendored Sentry browser bundle', async () => {
    const res = await request(app).get('/vendor/sentry.min.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('@sentry/browser');
  });

  it('serves sentry-boot.js', async () => {
    const res = await request(app).get('/sentry-boot.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sentry.init');
  });
});

describe('web observability: HTML wires the SDK via external scripts only', () => {
  for (const page of ['/index.html', '/login.html']) {
    it(`${page} references config.js + SDK + sentry-boot by src, with no inline script`, async () => {
      const res = await request(app).get(page);
      expect(res.status).toBe(200);
      const html = res.text;
      expect(html).toContain('src="/config.js"');
      expect(html).toContain('src="/vendor/sentry.min.js"');
      expect(html).toContain('src="/sentry-boot.js"');
      // CSP/no-inline invariant: no <script> tag carries an inline body (all have src=).
      expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/);
    });
  }
});
