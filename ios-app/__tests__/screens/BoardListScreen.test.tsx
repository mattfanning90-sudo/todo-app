/**
 * BoardListScreen — board rename/delete via long-press on a board row.
 */
import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { ActionSheetIOS, Alert } from 'react-native';
import fetchMock from 'jest-fetch-mock';
import { BoardListScreen } from '../../src/screens/BoardListScreen';

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Me', email: 'me@test.com', username: 'me', digest_frequency: 'none' },
    logout: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
}));

const boards = [
  { id: 1, owner_user_id: 1, name: 'Work', slug: 'work' },
  { id: 2, owner_user_id: 1, name: 'Personal', slug: 'personal' },
];

let showActionSheetSpy: jest.SpyInstance;

beforeEach(() => {
  fetchMock.resetMocks();
  // Spy on (or create) ActionSheetIOS.showActionSheetWithOptions
  if (!ActionSheetIOS.showActionSheetWithOptions) {
    (ActionSheetIOS as any).showActionSheetWithOptions = jest.fn();
  }
  showActionSheetSpy = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(jest.fn());
});

afterEach(() => {
  showActionSheetSpy?.mockRestore();
});

async function renderBoards() {
  fetchMock.mockResponseOnce(JSON.stringify(boards));
  fetchMock.mockResponseOnce(JSON.stringify([]));
  render(
    <BoardListScreen
      onOpenBoard={jest.fn()}
      onOpenDashboard={jest.fn()}
      onOpenSettings={jest.fn()}
      onOpenSearch={jest.fn()}
    />
  );
  await screen.findByText('Work', undefined, { timeout: 3000 });
}

test('long-press on a board row opens an ActionSheet with Rename and Delete options', async () => {
  await renderBoards();
  fireEvent(screen.getByTestId('board-row-1'), 'longPress');
  expect(showActionSheetSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining(['Rename', 'Delete', 'Cancel']),
    }),
    expect.any(Function)
  );
});

test('selecting Rename calls api.renameBoard with new name', async () => {
  await renderBoards();

  // Simulate ActionSheet picking index 0 (Rename)
  showActionSheetSpy.mockImplementationOnce((_opts: any, cb: (idx: number) => void) => cb(0));

  jest.spyOn(Alert, 'prompt' as any).mockImplementationOnce(
    (...args: any[]) => args[2]?.('Work Renamed')
  );
  fetchMock.mockResponseOnce(JSON.stringify({ id: 1, name: 'Work Renamed', owner_user_id: 1, slug: 'work-renamed' }));

  fireEvent(screen.getByTestId('board-row-1'), 'longPress');

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).includes('/api/boards/1') && (c[1] as any)?.method === 'PUT'
    );
    expect(calls.length).toBe(1);
    expect(JSON.parse((calls[0][1] as any).body)).toMatchObject({ name: 'Work Renamed' });
  });
});

test('selecting Delete confirms then calls api.deleteBoard', async () => {
  await renderBoards();

  // Simulate ActionSheet picking index 1 (Delete)
  showActionSheetSpy.mockImplementationOnce((_opts: any, cb: (idx: number) => void) => cb(1));

  jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _msg, buttons) => {
    const confirm = buttons?.find((b: any) => b.style === 'destructive');
    confirm?.onPress?.();
  });
  fetchMock.mockResponseOnce('', { status: 204 });

  fireEvent(screen.getByTestId('board-row-1'), 'longPress');

  await waitFor(() => {
    const calls = fetchMock.mock.calls.filter(
      (c) => (c[0] as string).includes('/api/boards/1') && (c[1] as any)?.method === 'DELETE'
    );
    expect(calls.length).toBe(1);
  });
});
