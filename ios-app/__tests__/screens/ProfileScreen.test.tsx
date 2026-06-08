import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { ProfileScreen } from '../../src/screens/ProfileScreen';

// Replace useFocusEffect with useEffect so tests don't need a NavigationContainer.
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (fn: () => unknown) => React.useEffect(() => { fn(); }, []) };
});

// Mock AuthContext — logout is called by ProfileScreen's handleLogout.
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn().mockResolvedValue(undefined) }),
}));

const nav = { navigate: jest.fn() };
const mockDash = {
  counts: { open: 5, inProgress: 2, overdue: 1 },
  stats: { done_total: 42, completed_week: 7, open: 5, overdue: 1 },
  trend: [], byPriority: { high: 0, medium: 0, low: 0, none: 0 }, byCategory: [],
};
const mockUser = { id: 1, email: 'test@test.com', name: 'Matt', username: 'matt', digest_frequency: 'none' };

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.mockResponseOnce(JSON.stringify(mockUser));    // api.me()
  fetchMock.mockResponseOnce(JSON.stringify(mockDash));   // api.dashboard()
});

test('renders user name', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('Matt')).toBeTruthy();
});

test('renders done_total stat', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('42')).toBeTruthy();
});

test('renders overdue stat', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('1')).toBeTruthy();
});

test('renders Sign out button', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('Sign out')).toBeTruthy();
});

test('renders Search settings row', async () => {
  const { findByText } = render(<ProfileScreen navigation={nav as any} />);
  expect(await findByText('Search')).toBeTruthy();
});
