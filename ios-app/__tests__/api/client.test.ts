/**
 * API client tests — verify the correct fetch calls are made for each method.
 *
 * fetch is mocked globally via jest-fetch-mock (set up in jest.setup.js).
 */
import fetchMock from 'jest-fetch-mock';
import * as Sentry from '@sentry/react-native';
import { api, ApiError, setSessionCookie } from '../../src/api/client';

beforeEach(() => {
  fetchMock.resetMocks();
  (Sentry.captureException as jest.Mock).mockClear();
  (Sentry.addBreadcrumb as jest.Mock).mockClear();
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

// ── Session resilience on 401 (B1) ──────────────────────────────────────────────
// A single 401 must NOT destroy the stored session. The old behaviour wiped the
// cookie on every 401, so one transient/unrecognised 401 (the B1 symptom: login
// OK, next call 401s) hard-logged-out the user with no recovery path. The cookie
// is cleared only on an explicit logout.
describe('session cookie resilience', () => {
  test('a 401 does NOT wipe the stored session cookie', async () => {
    await setSessionCookie('connect.sid=s%3Aabc.def');

    fetchMock.mockResponseOnce('', { status: 401 });
    await expect(api.boards()).rejects.toBeInstanceOf(ApiError);

    // The next request must still carry the cookie — the 401 didn't log us out.
    fetchMock.mockResponseOnce(JSON.stringify([]));
    await api.boards();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect((lastCall[1] as { headers: Record<string, string> }).headers.Cookie)
      .toBe('connect.sid=s%3Aabc.def');
  });

  test('logout clears the stored session cookie', async () => {
    await setSessionCookie('connect.sid=s%3Aabc.def');

    fetchMock.mockResponseOnce('', { status: 204 });
    await api.logout();

    fetchMock.mockResponseOnce(JSON.stringify([]));
    await api.boards();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect((lastCall[1] as { headers: Record<string, string> }).headers.Cookie)
      .toBeUndefined();
  });
});

// ── Sentry capture tuning (errors only; expected 4xx stay off the quota) ────────
describe('Sentry error capture', () => {
  test('captures a 5xx as an exception', async () => {
    fetchMock.mockResponseOnce('boom', { status: 500 });
    await expect(api.boards()).rejects.toBeInstanceOf(ApiError);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('a 401 is a breadcrumb, not an exception (must not page)', async () => {
    fetchMock.mockResponseOnce('', { status: 401 });
    await expect(api.boards()).rejects.toBeInstanceOf(ApiError);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
  });

  test('an expected 4xx (404) is a breadcrumb, not an exception', async () => {
    fetchMock.mockResponseOnce('nope', { status: 404 });
    await expect(api.boards()).rejects.toBeInstanceOf(ApiError);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalled();
  });

  test('a network failure is captured as an exception', async () => {
    fetchMock.mockRejectOnce(new Error('Network request failed'));
    await expect(api.boards()).rejects.toThrow('Network request failed');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
