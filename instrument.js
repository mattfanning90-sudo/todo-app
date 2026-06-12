// Sentry server-side initialisation. MUST be required FIRST in server.js
// (before express / pg) so the SDK's OpenTelemetry auto-instrumentation can
// patch them — if init runs after those imports it silently does not attach.
//
// Inert unless SENTRY_DSN is set AND NODE_ENV !== 'test', so the test suite and
// local dev never send anything. See
// docs/superpowers/specs/2026-06-12-observability-sentry-design.md
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Railway injects RAILWAY_GIT_COMMIT_SHA only for GitHub-triggered deploys.
    release: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    beforeSend(event) {
      // Belt-and-suspenders PII scrub: never ship the session cookie / auth header.
      if (event.request && event.request.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
        delete event.request.headers['x-session-cookie'];
      }
      return event;
    },
  });
}

module.exports = Sentry;
