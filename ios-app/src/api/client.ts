import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type {
  Board,
  Category,
  DashboardData,
  DigestFrequency,
  MemberBoard,
  SearchHit,
  Task,
  User,
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

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // iOS native networking intercepts Set-Cookie before it reaches JS, so the
  // server also echoes the signed session value in X-Session-Cookie.
  const newCookie =
    extractSessionCookie(res.headers.get('x-session-cookie')) ||
    extractSessionCookie(res.headers.get('set-cookie'));
  if (newCookie) await setCookie(newCookie);

  if (res.status === 401) {
    await setCookie(null);
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(text || res.statusText, res.status);
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
    return request<User>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
  },
  async signup(email: string, password: string, name?: string): Promise<User> {
    return request<User>('/auth/signup', {
      method: 'POST',
      body: { email, password, name },
    });
  },
  async googleLogin(idToken: string): Promise<User> {
    return request<User>('/auth/google/mobile', {
      method: 'POST',
      body: { id_token: idToken },
    });
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

  boards: () => request<Board[]>('/api/boards'),
  memberships: () => request<MemberBoard[]>('/api/boards/memberships'),
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
  search: (q: string, signal?: AbortSignal) =>
    request<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),
};

export { setCookie as setSessionCookie };
