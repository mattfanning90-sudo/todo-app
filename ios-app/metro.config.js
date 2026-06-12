// getSentryExpoConfig wraps Expo's default Metro config and assigns Debug IDs to
// bundles/source maps — REQUIRED for Sentry symbolication of release builds.
// Without it, uploaded source maps don't resolve. (Replaces getDefaultConfig.)
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const config = getSentryExpoConfig(__dirname);

// Resolve `@/` imports to the `src/` directory.
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
