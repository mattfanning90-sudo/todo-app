// Boot smoke test: render the REAL RootNavigator (NOT mocking @react-navigation)
// so any mount-time crash surfaces in CI — a react-navigation version mismatch,
// an undefined screen component, a throw during a screen's first render, etc.
// The rest of the suite mocks navigation away, so it is blind to "does it boot?".
// Mock ONLY auth (so the authed tab navigator mounts) and the api (so screens'
// mount-time fetches resolve to safe empty data instead of hitting the network).

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
}));

jest.mock('../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@test.com', name: 'Test', username: 'test', digest_frequency: 'none' },
    loading: false,
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/api/client', () => ({
  api: {
    baseUrl: 'http://localhost',
    todayTasks: jest.fn().mockResolvedValue([]),
    dashboard: jest.fn().mockResolvedValue({
      counts: { open: 0, inProgress: 0, overdue: 0 },
      stats: { done_total: 0, completed_week: 0, open: 0, overdue: 0 },
      trend: [], byPriority: { high: 0, medium: 0, low: 0, none: 0 }, byCategory: [],
    }),
    me: jest.fn().mockResolvedValue({ id: 1, email: 'test@test.com', name: 'Test', username: 'test' }),
    boards: jest.fn().mockResolvedValue([{ id: 1, name: 'My Board', owner_user_id: 1 }]),
    memberships: jest.fn().mockResolvedValue([]),
    tasks: jest.fn().mockResolvedValue([]),
    notifications: jest.fn().mockResolvedValue([]),
  },
}));

import { RootNavigator } from '../src/navigation/RootNavigator';
import { ThemeProvider } from '../src/theme/ThemeProvider';

test('app boots: RootNavigator mounts the tab navigator without throwing', async () => {
  // If react-navigation majors were mismatched (or any screen threw on first
  // render), this render() call throws before the assertion is reached.
  const tree = render(<ThemeProvider><RootNavigator /></ThemeProvider>);
  await waitFor(() => {
    expect(tree.toJSON()).toBeTruthy();
  });
});
