// Manual mock for @sentry/react-native, applied automatically to all tests
// (root __mocks__ for a node module). Keeps the mocked jest suite green and
// fast: no native module, and crucially `wrap` is the identity function so
// `export default Sentry.wrap(App)` still yields the real component that
// boot.test.tsx mounts.
module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setTag: jest.fn(),
  setUser: jest.fn(),
  nativeCrash: jest.fn(),
  flush: jest.fn(() => Promise.resolve(true)),
  reactNavigationIntegration: jest.fn(() => ({})),
};
