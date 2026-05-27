const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolve `@/` imports to the `src/` directory.
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
