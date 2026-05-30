# iOS app (`ios-app/`)

A React Native / Expo client that hits the same `/api/*` endpoints the web app uses. Nothing in `ios-app/` is built or deployed by Railway — Railway only builds the Node root.

## TestFlight deployment

### Key identifiers
| Thing | Value |
|---|---|
| Bundle ID | `com.matthewfanning.todo` |
| Apple Team ID | `KGQVBM3UF4` |
| App Store Connect App ID | `6774876992` |
| EAS Project ID | `8cc288c3-7847-47a2-a1fe-55059996080b` |
| EAS Owner | `mfanning90` |
| Production API | `https://todo-app-production-a338.up.railway.app` |

### Build + submit pipeline
```bash
cd ios-app
eas build --platform ios --profile production --non-interactive
# wait for FINISHED, then:
eas submit --platform ios --latest --non-interactive
```
`autoIncrement: true` in `eas.json` bumps the build number automatically each build.

### Critical native files — do not regenerate blindly
`ios/` is **gitignored but committed** (force-added). EAS uses the native project as-is; changes to `app.json`'s `ios.infoPlist` section are **ignored** for bare workflow builds. All native config must go directly into:
- `ios/Todo/Info.plist` — URL schemes, encryption flag, capabilities
- `ios/Todo.xcodeproj/` — signing, capabilities

### Info.plist URL schemes (must stay in sync)
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>todoapp</string>
      <string>com.matthewfanning.todo</string>
      <string>com.googleusercontent.apps.715885239899-a245f5lnvhg9akc82secj3u7l20nfui6</string>
    </array>
  </dict>
</array>
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```
The Google reversed-client-ID scheme is what makes `expo-auth-session` OAuth redirects work on device. Without it, Google sign-in silently fails.

### Google Sign-In requirements
- iOS OAuth client in [Google Cloud Console](https://console.cloud.google.com) must have Bundle ID: `com.matthewfanning.todo`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set as an EAS secret (production environment) — not in `.env`
- The reversed client ID scheme **must be in `Info.plist`**, not just `app.json`

### npm peer-dep conflicts
`jest-expo` and React version mismatches will fail the EAS `npm ci` step. `.npmrc` contains `legacy-peer-deps=true` to suppress this — do not remove it.

### Build number
Managed by `autoIncrement: true` in `eas.json`. If a build is rejected by Apple for a duplicate build number, increment `ios.buildNumber` in `app.json` manually to skip past the used value.

---

## Stack

- Expo SDK 54 + TypeScript
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
      SettingsScreen.tsx           # Email-digest frequency picker
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
- `PUT /api/user/digest` — Settings screen writes `digest_frequency` (`none | daily | weekly | fortnightly`).
- All return JSON (the same shape the web client sees).

## Keyboard behavior

Text fields never auto-focus. The on-screen keyboard appears only when the user taps a field — this matches platform expectations and avoids the keyboard popping over a screen the user might want to scan first.

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
