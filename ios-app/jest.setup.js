// Global fetch mock
const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// Silence act() warnings in tests
jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
  if (typeof msg === 'string' && msg.includes('act(')) return;
  console.warn(msg, ...args);
});
