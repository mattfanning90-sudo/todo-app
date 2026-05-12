import { describe, it, expect } from 'vitest';
import { escapeHtml, isStrongPassword, runDigests } from '../server.js';

describe('escapeHtml (used by the digest email body)', () => {
  it('escapes the five characters that matter for HTML injection', () => {
    expect(escapeHtml(`<script>alert("x'&y")</script>`))
      .toBe('&lt;script&gt;alert(&quot;x&#39;&amp;y&quot;)&lt;/script&gt;');
  });

  it('returns empty string for null and undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-strings to strings safely', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('isStrongPassword (signup gate)', () => {
  it('accepts 12+ chars with upper, lower, and digit', () => {
    expect(isStrongPassword('GoodPass1234')).toBe(true);
  });

  it('rejects under 12 chars', () => {
    expect(isStrongPassword('Short1A')).toBe(false);
  });

  it('rejects 12+ chars without a digit', () => {
    expect(isStrongPassword('NoDigitsAllHere')).toBe(false);
  });

  it('rejects 12+ chars without uppercase', () => {
    expect(isStrongPassword('all_lower_1234')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isStrongPassword(null)).toBe(false);
    expect(isStrongPassword(undefined)).toBe(false);
    expect(isStrongPassword(12345678)).toBe(false);
  });

  it('rejects overly long passwords (>200 chars)', () => {
    expect(isStrongPassword('A1' + 'a'.repeat(199))).toBe(false);
  });
});

describe('runDigests', () => {
  // pg-mem doesn't fully support the LATERAL JOIN used in the digest query.
  // The most we can assert here is that the cron callback doesn't crash —
  // runDigests catches errors internally and logs them. Full coverage of the
  // digest SQL requires the real Postgres integration test layer.
  it('does not throw even when the LATERAL JOIN is unsupported', async () => {
    await expect(runDigests()).resolves.toBeUndefined();
  });
});
