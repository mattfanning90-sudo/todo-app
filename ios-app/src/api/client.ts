import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Sentry from '@sentry/react-native';
import type {
  Board,
  BoardInvite,
  BoardMember,
  Category,
  DashboardData,
  DigestFrequency,
  MemberBoard,
  Notification,
  ReminderTask,
  SearchHit,
  Task,
  TodayTask,
  User,
  UserSearchResult,
} from './types';

// EXPO_PUBLIC_* vars are inlined by Metro at bundle time from .env
// Fall back to localhost only in bare local dev (never on device).
const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ||
  (Constants.expoConfig?.extra?.apiBase as string | undefined) ||
  'http://localhost:3000';

const ACCEPT_JSON = 'application/json';

const SESSION_KEY = 'todoapp.session';

let cachedCookie: string | null = null;

async function getCookie(): Promise<string | null> {
  if (cachedCookie !== null) return cachedCookie;
  cachedCookie = (await SecureStore.getItemAsync(SESSION_KEY)) ?? null;
  return cachedCookie;
}

async function setCookie(cookie: string | null): Promise<void> {
  cachedCookie = cookie;
  if (cookie) await SecureStore.setItemAsync(SESSION_KEY, cookie);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/connect\.sid=[^;]+/);
  return match ? match[0] : null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cookie = await getCookie();
  const headers: Record<string, string> = {
    'Content-Type': ACCEPT_JSON,
    Accept: ACCEPT_JSON,
    // Required by the server CSRF middleware on /api/* state-changing
    // routes; harmless on GET.
    'X-Requested-With': 'fetch',
  };
  if (cookie) headers.Cookie = cookie;

  const method = opts.method ?? 'GET';
  // Strip the query string before anything reaches Sentry — `q=` carries
  // user-typed search terms, and other params carry board IDs.
  const route = path.split('?')[0];
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    // An intentional abort is expected. Offline/connectivity loss is also an
    // expected state — breadcrumb, not an event — else a single offline session
    // bursts dozens of events into the shared quota. Capture only the unexpected
    // (TLS/DNS/etc.).
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const isOffline = err instanceof TypeError && /network request failed/i.test(err.message);
    if (isOffline) {
      Sentry.addBreadcrumb({ category: 'network', level: 'warning', message: `offline ${method} ${route}` });
    } else if (!isAbort) {
      Sentry.captureException(err, { tags: { kind: 'network', route } });
    }
    throw err;
  }

  // iOS native networking intercepts Set-Cookie before it reaches JS, so the
  // server also echoes the signed session value in X-Session-Cookie.
  const newCookie =
    extractSessionCookie(res.headers.get('x-session-cookie')) ||
    extractSessionCookie(res.headers.get('set-cookie'));
  if (newCookie) await setCookie(newCookie);

  if (res.status === 401) {
    // Do NOT wipe the stored session here. A single unrecognised 401 (the B1
    // symptom: login succeeds, the next call 401s) would otherwise destroy the
    // captured cookie and hard-log-out the user with no recovery — turning a
    // possibly-transient failure into a permanent one. The session is cleared
    // only on an explicit logout (api.logout). Callers surface the 401.
    // Breadcrumb (not an event) — 401s are expected and must not page.
    Sentry.addBreadcrumb({ category: 'auth', level: 'info', message: `401 ${method} ${route}` });
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const apiErr = new ApiError(text || res.statusText, res.status);
    // Capture only real failures (5xx). 4xx (validation, not-found, conflict)
    // are expected outcomes — breadcrumb them to keep off the error quota.
    if (res.status >= 500) {
      Sentry.captureException(apiErr, { tags: { kind: 'http', route, status: String(res.status) } });
    } else {
      Sentry.addBreadcrumb({ category: 'http', level: 'warning', message: `${res.status} ${method} ${route}` });
    }
    throw apiErr;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export const api = {
  baseUrl: API_BASE,

  async login(email: string, password: string): Promise<User> {
    const { mobileSession, ...user } = await request<User & { mobileSession?: string }>(
      '/auth/login',
      { method: 'POST', body: { email, password } }
    );
    if (mobileSession) await setCookie(mobileSession);
    return user as User;
  },
  async signup(email: string, password: string, name?: string): Promise<User> {
    const { mobileSession, ...user } = await request<User & { mobileSession?: string }>(
      '/auth/signup',
      { method: 'POST', body: { email, password, name } }
    );
    if (mobileSession) await setCookie(mobileSession);
    return user as User;
  },
  async googleLogin(idToken: string): Promise<User> {
    const { mobileSession, ...user } = await request<User & { mobileSession?: string }>(
      '/auth/google/mobile',
      { method: 'POST', body: { id_token: idToken } }
    );
    if (mobileSession) await setCookie(mobileSession);
    return user as User;
  },
  async logout(): Promise<void> {
    try {
      await request('/auth/logout');
    } finally {
      await setCookie(null);
    }
  },
  me: () => request<User>('/api/user'),
  updateDigestFrequency: (frequency: DigestFrequency) =>
    request<{ ok: true }>('/api/user/digest', {
      method: 'PUT',
      body: { frequency },
    }),
  updateReminders: (body: { enabled: boolean; time: string; lead_days: number }) =>
    request<{ ok: true }>('/api/user/reminders', { method: 'PUT', body }),
  // NOT board-scoped — reminders span all the user's boards (owned + member).
  reminderAgenda: () => request<ReminderTask[]>('/api/reminders/agenda'),

  boards: () => request<Board[]>('/api/boards'),
  memberships: () => request<MemberBoard[]>('/api/boards/memberships'),
  boardMembers: (boardId: number) =>
    request<BoardMember[]>(`/api/boards/members?board=${boardId}`),
  boardInvites: (boardId: number) =>
    request<BoardInvite[]>(`/api/boards/invites?board=${boardId}`),
  inviteMember: (boardId: number, email: string) =>
    request<{ joined?: boolean; pending?: boolean; email?: string; inviteLink?: string }>(
      `/api/boards/invite?board=${boardId}`,
      { method: 'POST', body: { email } }
    ),
  removeMember: (boardId: number, userId: number) =>
    request<{ ok: true }>(`/api/boards/members/${userId}?board=${boardId}`, {
      method: 'DELETE',
    }),
  revokeInvite: (boardId: number, inviteId: number) =>
    request<{ ok: true }>(`/api/boards/invites/${inviteId}?board=${boardId}`, {
      method: 'DELETE',
    }),
  createBoard: (name: string) =>
    request<Board>('/api/boards', { method: 'POST', body: { name } }),
  renameBoard: (id: number, name: string) =>
    request<Board>(`/api/boards/${id}`, { method: 'PUT', body: { name } }),
  deleteBoard: (id: number) =>
    request<void>(`/api/boards/${id}`, { method: 'DELETE' }),

  categories: (boardId: number) =>
    request<Category[]>(`/api/categories?board=${boardId}`),
  createCategory: (name: string, color: string, boardId: number) =>
    request<Category>(`/api/categories?board=${boardId}`, {
      method: 'POST',
      body: { name, color },
    }),

  // The server resolves which board a task lives on via `?board=` (with
  // `body.boardId` as fallback). We always pass it explicitly so multi-board
  // users don't silently fall through to the default board.
  tasks: (boardId: number) =>
    request<Task[]>(`/api/tasks?board=${boardId}`),
  archivedTasks: (boardId: number) =>
    request<Task[]>(`/api/tasks?board=${boardId}&archived=true`),
  createTask: (body: Partial<Task> & { board_id: number; text: string }) =>
    request<Task>(`/api/tasks?board=${body.board_id}`, { method: 'POST', body }),
  updateTask: (id: number, body: Partial<Task> & { board_id: number }) =>
    request<Task>(`/api/tasks/${id}?board=${body.board_id}`, {
      method: 'PUT',
      body,
    }),
  deleteTask: (id: number, boardId: number) =>
    request<void>(`/api/tasks/${id}?board=${boardId}`, { method: 'DELETE' }),
  reorder: (orderedTaskIds: number[], boardId: number) =>
    request<{ ok: true }>(`/api/reorder?board=${boardId}`, {
      method: 'POST',
      body: { order: orderedTaskIds },
    }),

  dashboard: () => request<DashboardData>('/api/dashboard'),
  todayTasks: () => request<TodayTask[]>('/api/tasks/today'),
  search: (q: string, signal?: AbortSignal) =>
    request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: () => request<Notification[]>('/api/notifications'),
  markNotificationsRead: () =>
    request<{ ok: true }>('/api/notifications/read', { method: 'POST' }),

  // ── User search ─────────────────────────────────────────────────────────────
  searchUsers: (q: string, signal?: AbortSignal) =>
    request<UserSearchResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`, { signal }),

  // ── Category management ────────────────────────────────────────────────────
  deleteCategory: (categoryId: number, boardId: number) =>
    request<{ ok: true }>(`/api/categories/${categoryId}?board=${boardId}`, {
      method: 'DELETE',
    }),
};

export { setCookie as setSessionCookie };
