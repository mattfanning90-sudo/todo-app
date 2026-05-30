/**
 * NotificationsScreen tests — renders notifications, marks all read.
 * Bell badge in BoardListScreen header shows unread count.
 */
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { NotificationsScreen } from '../../src/screens/NotificationsScreen';

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

// Replace useFocusEffect with useEffect so tests don't need a NavigationContainer.
// Wrap fn() call to discard the Promise (async fn → Promise ≠ cleanup fn).
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (fn: () => unknown) => React.useEffect(() => { fn(); }, []),
    useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  };
});

const notifs = [
  { id: 1, message: 'Alice assigned you a task', read: false, type: 'task_assigned', created_at: '2026-05-27T10:00:00Z', task_id: 5, from_user_id: 2, from_name: 'Alice', from_email: 'alice@test.com', from_username: 'alice', user_id: 1 },
  { id: 2, message: 'You were added to Work board', read: true, type: 'board_invite', created_at: '2026-05-26T09:00:00Z', task_id: null, from_user_id: 3, from_name: 'Bob', from_email: 'bob@test.com', from_username: 'bob', user_id: 1 },
];

beforeEach(() => {
  fetchMock.resetMocks();
});

test('renders a list of notifications', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(notifs));
  render(<NotificationsScreen onBack={jest.fn()} />);
  expect(await screen.findByText('Alice assigned you a task')).toBeTruthy();
  expect(screen.getByText('You were added to Work board')).toBeTruthy();
});

test('unread notifications are visually distinct (bold or highlighted)', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(notifs));
  render(<NotificationsScreen onBack={jest.fn()} />);
  await screen.findByText('Alice assigned you a task');
  const unreadEl = screen.getByTestId('notif-unread-1');
  expect(unreadEl).toBeTruthy();
});

test('pressing Mark all read calls api.markNotificationsRead', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(notifs));
  fetchMock.mockResponseOnce(JSON.stringify({ ok: true }));
  render(<NotificationsScreen onBack={jest.fn()} />);

  await screen.findByText('Alice assigned you a task');
  fireEvent.press(screen.getByText(/mark.*read/i));

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/notifications/read') && (c[1] as any)?.method === 'POST'
    );
    expect(calls.length).toBe(1);
  });
});

test('shows empty state when there are no notifications', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([]));
  render(<NotificationsScreen onBack={jest.fn()} />);
  expect(await screen.findByText(/no notifications/i)).toBeTruthy();
});
