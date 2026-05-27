/**
 * Category delete — in the TaskDetailScreen category section,
 * each category row shows a delete (×) button that calls api.deleteCategory.
 */
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { TaskDetailScreen } from '../../src/screens/TaskDetailScreen';
import type { Board, Task } from '../../src/api/types';

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Me', email: 'me@test.com', username: 'me', digest_frequency: 'none' } }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const board: Board = { id: 1, owner_user_id: 1, name: 'My Board', slug: 'my-board' };
const task: Task = {
  id: 10, text: 'Fix bug', status: '', stage: 'backlog', category_id: 5,
  due_date: null, priority: 'none', recurrence: null, subtasks: null,
  assigned_to_user_id: null, cal_start: null, cal_end: null,
  archived: false, archived_at: null, completed_at: null, position: 0, board_id: 1,
};

const categories = [
  { id: 5, name: 'Work', color: '#4285F4' },
  { id: 6, name: 'Home', color: '#34A853' },
];

beforeEach(() => {
  fetchMock.resetMocks();
});

test('renders a delete button for each category', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(categories));
  render(<TaskDetailScreen board={board} task={task} onClose={() => {}} />);
  // Each category should have a testID="delete-category-<id>"
  const btns = await screen.findAllByTestId(/delete-category-/, undefined, { timeout: 3000 });
  expect(btns).toHaveLength(2);
});

test('calls api.deleteCategory when delete is pressed and confirmed', async () => {
  fetchMock.mockResponseOnce(JSON.stringify(categories));
  fetchMock.mockResponseOnce(JSON.stringify({ ok: true })); // DELETE response

  // Mock Alert.alert to auto-confirm
  jest.spyOn(require('react-native').Alert, 'alert').mockImplementationOnce(
    (...args: any[]) => {
      const buttons = args[2] as any[];
      const confirm = buttons?.find((b: any) => b.style === 'destructive');
      confirm?.onPress?.();
    }
  );

  render(<TaskDetailScreen board={board} task={task} onClose={() => {}} />);

  // Wait for the category delete buttons to appear (async load)
  const deleteBtns = await screen.findAllByTestId(/delete-category-/, undefined, { timeout: 3000 });
  fireEvent.press(deleteBtns[0]);

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/categories/')
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][1]).toMatchObject({ method: 'DELETE' });
  });
});
