/**
 * TaskCard tests — verify the component accepts and fires onLongPress.
 */
import React from 'react';
import { View } from 'react-native';
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

test('shows notes preview when task has a non-empty status', () => {
  const { getByTestId } = render(
    <TaskCard
      task={{ ...task, status: 'Waiting on design review' }}
      onPress={() => {}}
    />
  );
  const preview = getByTestId('task-notes-preview');
  expect(preview.props.children).toContain('Waiting on design review');
});

test('does not render notes preview when status is empty', () => {
  const { queryByTestId } = render(
    <TaskCard task={{ ...task, status: '' }} onPress={() => {}} />
  );
  expect(queryByTestId('task-notes-preview')).toBeNull();
});

test('shows recurrence badge when task has a recurrence set', () => {
  const { getByTestId } = render(
    <TaskCard
      task={{ ...task, recurrence: 'weekly' }}
      onPress={() => {}}
    />
  );
  expect(getByTestId('task-recurrence-badge')).toBeTruthy();
});

test('does not render recurrence badge when recurrence is null', () => {
  const { queryByTestId } = render(
    <TaskCard task={{ ...task, recurrence: null }} onPress={() => {}} />
  );
  expect(queryByTestId('task-recurrence-badge')).toBeNull();
});

test('renders the dragHandle node when dragHandle prop is provided', () => {
  const { getByTestId } = render(
    <TaskCard
      task={task}
      onPress={() => {}}
      dragHandle={<View testID="test-drag-handle" />}
    />
  );
  expect(getByTestId('test-drag-handle')).toBeTruthy();
});

test('does not render a drag handle strip when dragHandle prop is absent', () => {
  const { queryByTestId } = render(
    <TaskCard task={{ ...task, recurrence: null }} onPress={() => {}} />
  );
  expect(queryByTestId('test-drag-handle')).toBeNull();
});

// ── Cross-stage move buttons (reliable alternative to drag) ──────────────────

test('backlog task: forward move button fires onMoveStage("in_progress"), no back button', () => {
  const onMoveStage = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <TaskCard task={task} onPress={() => {}} onMoveStage={onMoveStage} />
  );
  expect(queryByTestId('move-back')).toBeNull();
  fireEvent.press(getByTestId('move-forward'));
  expect(onMoveStage).toHaveBeenCalledWith('in_progress');
});

test('in_progress task: both move buttons fire the adjacent stages', () => {
  const onMoveStage = jest.fn();
  const { getByTestId } = render(
    <TaskCard task={{ ...task, stage: 'in_progress' }} onPress={() => {}} onMoveStage={onMoveStage} />
  );
  fireEvent.press(getByTestId('move-back'));
  expect(onMoveStage).toHaveBeenCalledWith('backlog');
  fireEvent.press(getByTestId('move-forward'));
  expect(onMoveStage).toHaveBeenCalledWith('done');
});

test('done task: back move button fires onMoveStage("in_progress"), no forward button', () => {
  const onMoveStage = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <TaskCard task={{ ...task, stage: 'done' }} onPress={() => {}} onMoveStage={onMoveStage} />
  );
  expect(queryByTestId('move-forward')).toBeNull();
  fireEvent.press(getByTestId('move-back'));
  expect(onMoveStage).toHaveBeenCalledWith('in_progress');
});

test('does not render move buttons when onMoveStage is absent', () => {
  const { queryByTestId } = render(<TaskCard task={task} onPress={() => {}} />);
  expect(queryByTestId('move-back')).toBeNull();
  expect(queryByTestId('move-forward')).toBeNull();
});
