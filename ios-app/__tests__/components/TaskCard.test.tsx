/**
 * TaskCard tests — verify the component accepts and fires onLongPress.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TaskCard } from '../../src/components/TaskCard';
import type { Task } from '../../src/api/types';

// Minimal task fixture
const task: Task = {
  id: 1,
  text: 'Write tests',
  status: '',
  stage: 'backlog',
  category_id: null,
  due_date: null,
  priority: 'none',
  recurrence: null,
  subtasks: null,
  assigned_to_user_id: null,
  cal_start: null,
  cal_end: null,
  archived: false,
  archived_at: null,
  completed_at: null,
  position: 0,
  board_id: 1,
};

test('calls onLongPress when the card is long-pressed', () => {
  const onLongPress = jest.fn();
  const { getByTestId } = render(
    <TaskCard
      task={task}
      onPress={() => {}}
      onLongPress={onLongPress}
      testID="card"
    />
  );
  fireEvent(getByTestId('card'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

test('renders without onLongPress (optional prop)', () => {
  expect(() =>
    render(<TaskCard task={task} onPress={() => {}} />)
  ).not.toThrow();
});
