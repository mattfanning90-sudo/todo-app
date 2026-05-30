// ios-app/__tests__/screens/BoardScreen.drag.test.tsx
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { BoardScreen } from '../../src/screens/BoardScreen';
import type { Board, Task } from '../../src/api/types';

// ── Mock DragHandle ─────────────────────────────────────────────────────────
// Capture each DragHandle instance's callbacks so tests can fire them directly.
// Variable must be prefixed with "mock" to be accessible inside jest.mock factory.
let mockCapturedHandles: Array<{
  onDragStart: (y: number) => void;
  onDragMove: (y: number) => void;
  onDragEnd: (y: number) => void;
}> = [];

jest.mock('../../src/components/DragHandle', () => ({
  DragHandle: ({ onDragStart, onDragMove, onDragEnd }: any) => {
    mockCapturedHandles.push({ onDragStart, onDragMove, onDragEnd });
    return null;
  },
}));

// ── Standard mocks ───────────────────────────────────────────────────────────
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Me', email: 'me@test.com', username: 'me', digest_frequency: 'none' } }),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (fn: () => unknown) => React.useEffect(() => { fn(); }, []) };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────
const board: Board = { id: 1, owner_user_id: 1, name: 'Test Board', slug: 'test' };

const taskA: Task = {
  id: 1, text: 'Task A', status: '', stage: 'backlog', category_id: null,
  due_date: null, priority: 'none', recurrence: null, subtasks: null,
  assigned_to_user_id: null, cal_start: null, cal_end: null,
  archived: false, archived_at: null, completed_at: null, position: 0, board_id: 1,
};
const taskB: Task = {
  id: 2, text: 'Task B', status: '', stage: 'in_progress', category_id: null,
  due_date: null, priority: 'none', recurrence: null, subtasks: null,
  assigned_to_user_id: null, cal_start: null, cal_end: null,
  archived: false, archived_at: null, completed_at: null, position: 0, board_id: 1,
};

beforeEach(() => {
  fetchMock.resetMocks();
  mockCapturedHandles = [];
});

async function renderBoard() {
  fetchMock.mockResponseOnce(JSON.stringify([taskA, taskB]));
  fetchMock.mockResponseOnce(JSON.stringify([])); // categories
  render(
    <BoardScreen
      board={board}
      onBack={jest.fn()}
      onOpenTask={jest.fn()}
      onOpenArchived={jest.fn()}
      onOpenMembers={jest.fn()}
    />
  );
  await screen.findByText('Task A', undefined, { timeout: 3000 });
}

function setupStageBounds() {
  // Stage containers have testID="stage-container-<stage>"
  // onLayout with these values populates stageBoundsRef.
  // In tests containerTopRef=0 and scrollOffset=0, so adjustedY === absoluteY.
  fireEvent(screen.getByTestId('stage-container-backlog'), 'layout', {
    nativeEvent: { layout: { y: 0, height: 300 } },
  });
  fireEvent(screen.getByTestId('stage-container-in_progress'), 'layout', {
    nativeEvent: { layout: { y: 300, height: 300 } },
  });
  fireEvent(screen.getByTestId('stage-container-done'), 'layout', {
    nativeEvent: { layout: { y: 600, height: 300 } },
  });
}

test('calls api.updateTask with new stage when drag ends over a different stage', async () => {
  await renderBoard();
  setupStageBounds();

  // The first captured DragHandle belongs to taskA (backlog)
  fetchMock.mockResponseOnce(
    JSON.stringify({ ...taskA, stage: 'in_progress' })
  );

  // Drag taskA (backlog, Y 0-300) and release in in_progress (Y 300-600)
  mockCapturedHandles[0].onDragStart(150);
  mockCapturedHandles[0].onDragEnd(400);

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).includes('/api/tasks/1') && (c[1] as any)?.method === 'PUT'
    );
    expect(calls.length).toBe(1);
    expect(JSON.parse((calls[0][1] as any).body)).toMatchObject({ stage: 'in_progress' });
  });
});

test('does not call api.updateTask when drag ends in the same stage', async () => {
  await renderBoard();
  setupStageBounds();

  mockCapturedHandles[0].onDragStart(150); // backlog
  mockCapturedHandles[0].onDragEnd(200);   // still backlog

  // Give any async operations time to settle
  await new Promise((r) => setTimeout(r, 50));

  const updateCalls = fetchMock.mock.calls.filter(
    (c) => (c[0] as string).includes('/api/tasks/') && (c[1] as any)?.method === 'PUT'
  );
  expect(updateCalls).toHaveLength(0);
});

test('does not call api.updateTask when drag ends outside all stage bounds', async () => {
  await renderBoard();
  setupStageBounds();

  mockCapturedHandles[0].onDragStart(150); // backlog
  mockCapturedHandles[0].onDragEnd(1200);  // below all stages

  await new Promise((r) => setTimeout(r, 50));

  const updateCalls = fetchMock.mock.calls.filter(
    (c) => (c[0] as string).includes('/api/tasks/') && (c[1] as any)?.method === 'PUT'
  );
  expect(updateCalls).toHaveLength(0);
});
