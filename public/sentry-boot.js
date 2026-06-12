// Initialise Sentry browser error tracking from the runtime config emitted by
// /config.js. Loaded after /config.js and /vendor/sentry.min.js but before
// app.js / login.js, so errors during page bootstrap are captured. Inert when
// no DSN is configured (local dev). Errors only — no performance/replay.
(function () {
  var cfg = window.__APP_CONFIG__ || {};
  if (cfg.sentryDsn && window.Sentry) {
    window.Sentry.init({
      dsn: cfg.sentryDsn,
      environment: cfg.environment,
      release: cfg.release,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  }
})();
