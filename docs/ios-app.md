# iOS app (`ios-app/`)

A React Native / Expo client that hits the same `/api/*` endpoints the web app uses. Nothing in `ios-app/` is built or deployed by Railway — Railway only builds the Node root.

## Stack

- Expo SDK 51 + TypeScript
- React Navigation (native stack)
- `expo-auth-session` for Google sign-in
- `expo-secure-store` for cookie persistence
- `react-native-gesture-handler` + `reanimated` for drag-reorder

## Layout

```
ios-app/
  App.tsx                          # Root, wraps in AuthProvider + Navigator
  app.json, babel.config.js, tsconfig.json
  .vscode/                         # Recommended extensions + workspace settings
  src/
    api/
      client.ts                    # Typed wrapper around /api/*
      types.ts
    auth/AuthContext.tsx           # Bootstraps session on launch, login/logout
    navigation/RootNavigator.tsx   # Auth-state-aware stack switch
    components/                    # Button, TextField, Screen, TaskCard
    screens/
      LoginScreen.tsx              # Email/password + Google sign-in
      BoardListScreen.tsx          # Pull-to-refresh, inline create
      BoardScreen.tsx              # Kanban with stage filter + drag reorder
      TaskDetailScreen.tsx         # Modal create/edit
      DashboardScreen.tsx          # 7-day trend, priority/category breakdown
    theme/index.ts                 # Light/dark palette + spacing/radius/font tokens
```

## Auth flow

1. `AuthContext` bootstraps on launch: calls `GET /api/user` with the persisted cookie.
2. If `null`, render `LoginScreen`. Otherwise render the authed navigator stack.
3. `LoginScreen` posts to `POST /auth/login` (or `/auth/signup`) with `Accept: application/json` and expects user JSON back.
4. For Google sign-in, `expo-auth-session` returns a Google ID token; the client posts it to `POST /auth/google/mobile` and the server starts a session.
5. The `connect.sid` cookie returned by the server is persisted via `expo-secure-store` and attached to every subsequent request.

## Server endpoints used

Read-only:
- `GET /api/user`, `/api/boards`, `/api/boards/memberships`, `/api/boards/members`, `/api/categories`, `/api/tasks`, `/api/dashboard`

Mutating:
- `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`
- `POST /api/boards`
- All return JSON (the same shape the web client sees).

## Running locally

```
cd ios-app
npm install
npx expo prebuild --platform ios
npx expo run:ios
```

Set `EXPO_PUBLIC_API_BASE` to your dev server URL (defaults to `http://localhost:3000`). For physical-device testing, use your machine's LAN IP and confirm the Node server is reachable from it.

## Known gaps

These are intentional follow-ups, not bugs:

- Push notifications: not wired.
- Natural-language date parsing: server supports it, UI exposes only `YYYY-MM-DD`.
- Categories CRUD, board sharing/invites, search: not yet built into the iOS UI (server supports them).
- Icons and splash: defaults only.
