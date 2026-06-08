// Guardrail: React Navigation crashes on launch if its packages are on
// different major versions (the navigators can't share a navigation context).
// This is exactly what shipped in build 16 — bottom-tabs v7 alongside native v6.
// A deterministic check beats discovering it on a device after a 40-min build.

const major = (v: string) => v.split('.')[0];

test('all @react-navigation/* packages share one major version', () => {
  const native = require('@react-navigation/native/package.json').version;
  const tabs = require('@react-navigation/bottom-tabs/package.json').version;
  const stack = require('@react-navigation/native-stack/package.json').version;

  expect(major(tabs)).toBe(major(native));   // bottom-tabs must match native
  expect(major(stack)).toBe(major(native));  // native-stack must match native
});
