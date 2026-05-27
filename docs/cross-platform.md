# Cross-Platform Development Guide

This app ships two clients against the same Node.js/PostgreSQL backend:

| Client | Stack | Entry |
|---|---|---|
| **Web** | Vanilla JS + Express SSR | `public/app.js` |
| **iOS** | Expo (React Native) SDK 54 | `ios-app/` |

The single source of truth for data and business rules is **`server.js`**. Both clients share every API endpoint.

---

## Architecture

```
server.js  (single Express app, Railway)
├── /auth/*          — login, signup, Google OAuth, logout
├── /api/boards      — owned boards
├── /api/boards/memberships  — shared boards (member)
├── /api/tasks       — CRUD + reorder, always ?board= scoped
├── /api/categories  — per-board
├── /api/dashboard   — stats, priorities, categories, trend
└── /api/search      — full-text across boards

public/app.js        — web SPA (reads session cookie normally)
ios-app/src/         — Expo app (session via X-Session-Cookie header)
```

### Session handling difference

iOS native networking (NSURLSession) intercepts `Set-Cookie` before JavaScript sees it. The server works around this by echoing the signed session value in `X-Session-Cookie` on every auth response. The iOS client (`api/client.ts`) reads that header first, falls back to `set-cookie`.

---

## Feature Parity Checklist

When you add or change a feature, go through this checklist:

### Server changes
- [ ] New endpoint added to `server.js`
- [ ] Endpoint handles `?board=` scoping correctly
- [ ] Response includes both legacy web fields AND mobile-friendly fields if formats differ (see dashboard response as the pattern)
- [ ] If state-changing: CSRF guard (`X-Requested-With: fetch`) — iOS client already sends this
- [ ] Migration added for any schema changes (see `data-model.md` + migration rules)
- [ ] `setMobileSessionHeader` called on any new auth responses

### Web (`public/app.js`)
- [ ] UI renders the new feature
- [ ] `data-action` delegation used (no inline `onclick=`) — see `frontend.md`
- [ ] Cache invalidated when underlying data changes (instant-paint pattern)

### iOS (`ios-app/`)
- [ ] `api/types.ts` — new types/fields added
- [ ] `api/client.ts` — new method added to `api` object
- [ ] Screen/component updated or created
- [ ] Error state handled (`Alert.alert(...)`)
- [ ] Loading state handled
- [ ] Pull-to-refresh triggers re-fetch if applicable
- [ ] `useFocusEffect` used (not `useEffect`) for data that should refresh on screen focus

---

## API Contract

All requests:
- `Content-Type: application/json`
- `Accept: application/json`
- `X-Requested-With: fetch` (CSRF bypass for state-changing routes)
- `Cookie: connect.sid=...` — web (browser manages), iOS (SecureStore + manual header)

Board-scoped endpoints always accept `?board=<id>`. The iOS client always passes this explicitly (see `api/client.ts` comments).

### Response format notes

**`/api/dashboard`** returns both formats in one response so both clients work:
```jsonc
{
  // iOS-friendly fields
  "counts":     { "open": 0, "inProgress": 0, "overdue": 0 },
  "trend":      [{ "date": "2025-01-01", "completed": 3 }],
  "byPriority": { "high": 0, "medium": 0, "low": 0, "none": 0 },
  "byCategory": [{ "name": "Work", "color": "#3B82F6", "count": 2 }],
  // Legacy web fields (keep for web compatibility)
  "stats":      { "open": 0, "in_progress": 0, "overdue": 0 },
  "priorities": [...],
  "categories": [...]
}
```

When adding new endpoints, prefer the mobile-friendly naming (camelCase fields, counts as plain numbers, dates as `YYYY-MM-DD` strings).

---

## Design Tokens

The design system is the same across both clients. Web uses CSS variables; iOS uses the theme file:

| Token | Web CSS var | iOS theme key |
|---|---|---|
| Background | `--bg` | `t.bg` |
| Surface | `--surface` | `t.surface` |
| Elevated surface | `--surface-elevated` | `t.surfaceElevated` |
| Border | `--border` | `t.border` |
| Primary text | `--text` | `t.text` |
| Muted text | `--text-muted` | `t.textMuted` |
| Light text | `--text-light` | `t.textLight` |
| Accent / primary | `--primary` | `t.accent` |
| Accent muted | `--primary-muted` | `t.accentMuted` |

Stage colors (`backlog`, `in_progress`, `done`) and priority colors (`high`, `medium`, `low`, `none`) are defined identically in both.

When updating colors, update **both** `public/app.js` CSS variables and `ios-app/src/theme/index.ts`.

---

## Workflow: Adding a New Feature

1. **Design at the API layer first.** Write or update the server endpoint. Make sure the response shape works for both clients (or include both shapes).
2. **Add migrations if needed.** Use `ADD COLUMN IF NOT EXISTS` patterns (see `data-model.md`).
3. **Implement on web.** Update `public/app.js`.
4. **Implement on iOS.** Update types → client → screen/component in that order.
5. **Test both.** Hit the Railway URL from browser, and run the Expo app against the same URL.

---

## Common Gotchas

### Cookies on iOS
Never rely on `Set-Cookie` response headers in iOS JS. Always call `setMobileSessionHeader(req, res)` in server.js for any endpoint that establishes or refreshes a session.

### `ALTER COLUMN ... TYPE` footgun
Always drop the default, cast, re-set default. See `CLAUDE.md` high-frequency rules.

### `useEffect` vs `useFocusEffect`
For data that a screen should re-fetch whenever it comes back into focus (e.g. board task counts after editing a task), use `useFocusEffect` from `@react-navigation/native`, not bare `useEffect`.

### Board scope
Every task API call must include `?board=<id>`. Relying on a "current board" session variable will fail for multi-board users. iOS client enforces this pattern — keep it that way.

### Shared boards
Web fetches both `/api/boards` (owned) and `/api/boards/memberships` (shared) in parallel and renders them in two labelled sections. iOS does the same. If you add board-level features (rename, delete, archive), check whether they should be restricted to owners only.

---

## Files at a Glance

```
todo-app/
├── server.js                         ← single backend, all API + auth
├── public/app.js                     ← web SPA
├── ios-app/
│   ├── src/api/
│   │   ├── client.ts                 ← all API calls, session management
│   │   └── types.ts                  ← TypeScript interfaces (mirrors DB shape)
│   ├── src/screens/
│   │   ├── BoardListScreen.tsx       ← owned + shared boards
│   │   ├── BoardScreen.tsx           ← tasks, stages, filters, drag-drop
│   │   ├── TaskDetailScreen.tsx      ← task edit modal
│   │   ├── DashboardScreen.tsx       ← stats overview
│   │   └── SearchScreen.tsx          ← global search
│   ├── src/theme/index.ts            ← design tokens (mirrors web CSS vars)
│   └── src/components/              ← shared UI primitives
└── docs/
    ├── cross-platform.md             ← this file
    ├── auth.md
    ├── data-model.md
    ├── frontend.md
    ├── ios-app.md
    ├── operations.md
    └── testing.md
```
