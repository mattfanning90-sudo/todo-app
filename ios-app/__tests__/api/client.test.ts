/**
 * API client tests — verify the correct fetch calls are made for each method.
 *
 * fetch is mocked globally via jest-fetch-mock (set up in jest.setup.js).
 */
import fetchMock from 'jest-fetch-mock';
import { api } from '../../src/api/client';

beforeEach(() => {
  fetchMock.resetMocks();
});

// ── Notifications ──────────────────────────────────────────────────────────────

describe('api.notifications', () => {
  test('calls GET /api/notifications', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]));
    await api.notifications();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('returns the notifications array from the server', async () => {
    const fixture = [{ id: 1, message: 'Hello', read: false }];
    fetchMock.mockResponseOnce(JSON.stringify(fixture));
    const result = await api.notifications();
    expect(result).toEqual(fixture);
  });
});

describe('api.markNotificationsRead', () => {
  test('calls POST /api/notifications/read', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ ok: true }));
    await api.markNotificationsRead();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/notifications/read'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

// ── User search ────────────────────────────────────────────────────────────────

describe('api.searchUsers', () => {
  test('calls GET /api/users/search?q=<query>', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([]));
    await api.searchUsers('alice');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/users/search?q=alice'),
      expect.anything()
    );
  });

  test('returns the user results', async () => {
    const fixture = [{ id: 2, name: 'Alice', email: 'alice@test.com', username: 'alice' }];
    fetchMock.mockResponseOnce(JSON.stringify(fixture));
    const result = await api.searchUsers('alice');
    expect(result).toEqual(fixture);
  });
});

// ── Delete category ───────────────────────────────────────────────────────────

describe('api.deleteCategory', () => {
  test('calls DELETE /api/categories/:id with board query param', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ ok: true }));
    await api.deleteCategory(7, 3);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/categories/7?board=3'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
