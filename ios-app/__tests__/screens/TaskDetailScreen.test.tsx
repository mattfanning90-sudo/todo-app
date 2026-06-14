/**
 * TaskDetailScreen tests — notes/status field, recurrence picker,
 * assigned-to user picker, and calendar date fields.
 *
 * All API calls are mocked via jest-fetch-mock.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';
import { TaskDetailScreen } from '../../src/screens/TaskDetailScreen';
import type { Board, Task } from '../../src/api/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Me', email: 'me@test.com', username: 'me', digest_frequency: 'none' } }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

const board: Board = { id: 1, owner_user_id: 1, name: 'My Board', slug: 'my-board' };
const task: Task = {
  id: 10,
  text: 'Fix the bug',
  status: 'needs review',
  stage: 'in_progress',
  category_id: null,
  due_date: null,
  priority: 'high',
  recurrence: 'weekly',
  subtasks: null,
  assigned_to_user_id: null,
  cal_start: '2026-06-01',
  cal_end: '2026-06-02',
  archived: false,
  archived_at: null,
  completed_at: null,
  position: 0,
  board_id: 1,
};

beforeEach(() => {
  fetchMock.resetMocks();
  // categories endpoint
  fetchMock.mockResponseOnce(JSON.stringify([]));
});

function renderDetail(t: Task | null = task) {
  return render(
    <TaskDetailScreen board={board} task={t} onClose={() => {}} />
  );
}

// ── Notes / status field ───────────────────────────────────────────────────────

describe('notes/status field', () => {
  test('renders a Notes input', () => {
    const { getByPlaceholderText } = renderDetail();
    expect(getByPlaceholderText(/notes/i)).toBeTruthy();
  });

  test('pre-fills with task.status', () => {
    const { getByDisplayValue } = renderDetail();
    expect(getByDisplayValue('needs review')).toBeTruthy();
  });

  test('includes status in save payload', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ ...task, status: 'approved' }));
    const { getByPlaceholderText, getByText } = renderDetail();

    fireEvent.changeText(getByPlaceholderText(/notes/i), 'approved');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
      expect(body.status).toBe('approved');
    });
  });
});

// ── Recurrence picker ─────────────────────────────────────────────────────────

describe('recurrence picker', () => {
  test('renders a Recurrence section', () => {
    const { getByText } = renderDetail();
    expect(getByText(/recurrence/i)).toBeTruthy();
  });

  test('shows the current recurrence selection', () => {
    const { getAllByText } = renderDetail();
    // "weekly" chip should be present and active
    expect(getAllByText(/weekly/i).length).toBeGreaterThan(0);
  });

  test('includes recurrence in save payload', async () => {
    fetchMock.mockResponseOnce(JSON.stringify(task));
    const { getByText } = renderDetail();

    // Tap "daily" chip to change recurrence
    fireEvent.press(getByText(/^daily$/i));
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
      expect(body.recurrence).toBe('daily');
    });
  });
});

// ── Assigned-to picker ────────────────────────────────────────────────────────

describe('assigned-to picker', () => {
  test('renders an Assign to section', () => {
    const { getByText } = renderDetail();
    expect(getByText(/assign/i)).toBeTruthy();
  });

  test('searching shows matching users', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([
      { id: 2, name: 'Alice', email: 'alice@test.com', username: 'alice' },
    ]));
    const { getByPlaceholderText, findByText } = renderDetail();
    fireEvent.changeText(getByPlaceholderText(/search.*user/i), 'ali');
    expect(await findByText('alice')).toBeTruthy();
  });

  test('includes assigned_to_user_id in save payload when user selected', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([
      { id: 2, name: 'Alice', email: 'alice@test.com', username: 'alice' },
    ]));
    fetchMock.mockResponseOnce(JSON.stringify(task)); // save response

    const { getByPlaceholderText, findByText, getByText } = renderDetail(
      { ...task, assigned_to_user_id: null }
    );
    fireEvent.changeText(getByPlaceholderText(/search.*user/i), 'ali');
    const result = await findByText('alice');
    fireEvent.press(result);
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
      expect(body.assigned_to_user_id).toBe(2);
    });
  });
});

// ── Calendar date fields ──────────────────────────────────────────────────────
// The restyle replaced free-text TextInputs with <DateField> (pressable + native
// date picker). Tests now assert labels/formatted values instead of placeholder
// text or editable input display values.

describe('calendar date fields', () => {
  test('renders cal_start and cal_end inputs', () => {
    // DateField renders a label Text node above the pressable field.
    const { getByText } = renderDetail();
    expect(getByText('Calendar start')).toBeTruthy();
    expect(getByText('Calendar end')).toBeTruthy();
  });

  test('pre-fills cal_start and cal_end from task', () => {
    // DateField formats the ISO value via toLocaleDateString for display.
    // task has cal_start='2026-06-01' → "Jun 1, 2026"
    //           cal_end  ='2026-06-02' → "Jun 2, 2026"
    const { getByText } = renderDetail();
    expect(getByText('Jun 1, 2026')).toBeTruthy();
    expect(getByText('Jun 2, 2026')).toBeTruthy();
  });

  test('includes cal_start and cal_end in save payload', async () => {
    // DateField has no typeable input; values round-trip from state initialised
    // by the task prop. Render with existing cal dates and confirm Save sends them.
    fetchMock.mockResponseOnce(JSON.stringify(task));
    const { getByText } = renderDetail(task);
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
      expect(body.cal_start).toBe('2026-06-01');
      expect(body.cal_end).toBe('2026-06-02');
    });
  });
});
