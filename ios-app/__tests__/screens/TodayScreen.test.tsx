import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { TodayScreen } from '../../src/screens/TodayScreen';

// Replace useFocusEffect with useEffect so tests don't need a NavigationContainer.
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (fn: () => unknown) => React.useEffect(() => { fn(); }, []) };
});

// Minimal navigation stubs
const nav = { navigate: jest.fn() };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const tasks = [
  { id: 1, text: 'A task', stage: 'backlog', due_date: today, priority: 'high',
    status: '', board_id: 1, board_name: 'Work', cat_name: 'Dev', cat_color: '#3B82F6',
    completed_at: null },
  { id: 2, text: 'Done task', stage: 'done', due_date: today, priority: 'none',
    status: '', board_id: 1, board_name: 'Work', cat_name: null, cat_color: null,
    completed_at: '2026-05-31T00:00:00Z' },
  { id: 3, text: 'Overdue task', stage: 'backlog', due_date: yesterday, priority: 'medium',
    status: '', board_id: 2, board_name: 'Personal', cat_name: null, cat_color: null,
    completed_at: null },
];

beforeEach(() => {
  fetchMock.resetMocks();
  fetchMock.mockResponseOnce(JSON.stringify(tasks));
});

test('renders task titles after fetch', async () => {
  const { findByText } = render(<TodayScreen navigation={nav as any} />);
  expect(await findByText('A task')).toBeTruthy();
  expect(await findByText('Overdue task')).toBeTruthy();
});

test('Active filter hides done tasks', async () => {
  const { findByText, getByText, queryByText } = render(
    <TodayScreen navigation={nav as any} />
  );
  await findByText('A task');
  fireEvent.press(getByText('Active'));
  expect(queryByText('Done task')).toBeNull();
  expect(getByText('A task')).toBeTruthy();
});

test('Done filter shows only done tasks', async () => {
  const { findByText, getByText, queryByText } = render(
    <TodayScreen navigation={nav as any} />
  );
  await findByText('Done task');
  fireEvent.press(getByText('Done'));
  expect(getByText('Done task')).toBeTruthy();
  expect(queryByText('A task')).toBeNull();
});

test('progress ring pct = doneToday / dueToday (overdue excluded from denominator)', async () => {
  // dueToday = tasks 1 and 2 (today due_date); done of those = task 2 → 1/2 = 50%
  const { findByTestId } = render(<TodayScreen navigation={nav as any} />);
  const label = await findByTestId('progress-ring-pct');
  expect(label.props.children).toBe('50%');
});

test('overdue tasks show overdue badge', async () => {
  const { findByTestId } = render(<TodayScreen navigation={nav as any} />);
  expect(await findByTestId('overdue-badge-3')).toBeTruthy();
});
