// Sentry server-side initialisation. MUST be required FIRST in server.js
// (before express / pg) so the SDK's OpenTelemetry auto-instrumentation can
// patch them — if init runs after those imports it silently does not attach.
//
// Inert unless SENTRY_DSN is set AND NODE_ENV !== 'test', so the test suite and
// local dev never send anything. See
// docs/superpowers/specs/2026-06-12-observability-sentry-design.md
const Sentry = require('@sentry/node');

// Header names whose VALUES are sensitive (case-insensitive, keys are lowercased
// by the SDK). Denylist by substring so future token-bearing headers are covered.
const SENSITIVE_HEADER = /secret|authoriz|token|cookie|session|password/i;

// Final-gate PII scrub applied to every outgoing error event AND transaction.
// @sentry/node's default http + requestData integrations attach the incoming
// request body (event.request.data), the parsed session cookie
// (event.request.cookies) and the query string (event.request.query_string) to
// events regardless of sendDefaultPii — so a 5xx during /auth/login would
// otherwise ship the plaintext password and a valid session id to Sentry.
// Exported so it can be unit-tested without initialising the SDK.
function scrubEvent(event) {
  const req = event && event.request;
  if (req) {
    delete req.data;          // request body — may contain plaintext passwords
    delete req.cookies;       // parsed cookie object — contains connect.sid
    delete req.query_string;  // may contain ?secret=<RESTORE_SECRET>
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        if (SENSITIVE_HEADER.test(key)) delete req.headers[key];
      }
    }
  }
  return event;
}

if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Railway injects RAILWAY_GIT_COMMIT_SHA only for GitHub-triggered deploys.
    release: process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
    // Defence in depth: stop the http integration from capturing request bodies
    // at the source (overrides just the default http integration, keeps the rest)…
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    // …and scrub anything sensitive that still slips onto the event on the way out.
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });
}

module.exports = Sentry;
module.exports.scrubEvent = scrubEvent;
