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

### Pre-build checklist — prove it boots first (build 16 shipped a launch crash)

Build 16 crashed on launch yet passed tsc **and** the full jest suite — the suite mocks `@react-navigation` away, so it never boots the app. Root cause: `npm install @react-navigation/bottom-tabs` pulled v7 while the rest of react-navigation was v6; mixing react-navigation majors crashes on mount.

- Install Expo/native deps with **`npx expo install <pkg>`**, never plain `npm install <pkg>` (it grabs `latest`). Keep all `@react-navigation/*` on one major.
- Before every `eas build`, run all of:
  1. `npx expo-doctor` — flags SDK / version / peer mismatches.
  2. `npm test` — now includes `__tests__/nav-version-alignment.test.ts` (asserts the react-navigation packages share a major) and `__tests__/boot.test.tsx` (mounts the **real** `RootNavigator`; a version mismatch or any mount-time throw fails it).
  3. **`npx expo export --platform ios`** — a real Metro bundle. Catches unresolved-import errors that doctor + the mocked jest suite **cannot** (they never bundle). This is what would have caught the `@sentry/react-native` → `promise/setimmediate/done` failure that broke a build on 2026-06-13 (see Sentry section below).
  4. `npx expo run:ios` (simulator) — a 30-second launch check beats the 40-min build → TestFlight → device loop.

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
- **`expo-auth-session@7` breaking change:** the default native redirect URI changed from the reversed client ID (`com.googleusercontent.apps.XXX:/oauthredirect`) to the bundle ID (`com.matthewfanning.todo:/oauthredirect`). Google's iOS OAuth client rejects the bundle ID form. `LoginScreen.tsx` computes and passes `GOOGLE_IOS_REDIRECT_URI` explicitly to override this.

### npm peer-dep conflicts
`jest-expo` and React version mismatches will fail the EAS `npm ci` step. `.npmrc` contains `legacy-peer-deps=true` to suppress this — do not remove it.

### Build number
Managed by `autoIncrement: true` in `eas.json`. If a build is rejected by Apple for a duplicate build number, increment `ios.buildNumber` in `app.json` manually to skip past the used value.

### Sentry error tracking (A2)
Live as of build 23 (2026-06-13). Errors-only; symbolication is **deferred** (see below).
- `@sentry/react-native@7.11.0` (Expo SDK 55's bundled pin — **not** v8; v8 was a red herring and adds an Xcode-16.4 native requirement). `Sentry.init` + `Sentry.wrap(App)` in `App.tsx`, capture tuned in `src/api/client.ts` (5xx + unexpected network → `captureException`; 401/4xx + offline → breadcrumb). DSN via `EXPO_PUBLIC_SENTRY_DSN` (wired in `eas.json` preview+production env). Inert without a DSN. `metro.config.js` uses `getSentryExpoConfig`; the `@sentry/react-native/expo` config plugin is in `app.json`. Jest mocks it via `__mocks__/@sentry/react-native.js` (`wrap` = identity).
- **`promise` dep gotcha (broke build 22):** Sentry deep-imports `promise/setimmediate/done`, but `promise` is only nested under react-native, not hoisted → Metro "Unable to resolve". **Fix: `promise` is a direct dep** (`^8.3.0`). Don't remove it. (This is why `expo export` is now in the pre-build checklist.)
- **`SENTRY_DISABLE_AUTO_UPLOAD: "true"`** is set in `eas.json` build profiles so the Sentry config plugin's source-map/dSYM **upload phase doesn't hard-fail** the build without a token. **To enable symbolicated JS stacks:** create a Sentry token with `project:releases` + `project:write`, set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG=mf-ventures` + `SENTRY_PROJECT=<rn-slug>` as EAS env, then **remove** `SENTRY_DISABLE_AUTO_UPLOAD`.

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
