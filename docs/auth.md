# Authentication

Three sign-in paths, one session model.

## Sign-in methods

| Method | Entry point | Storage |
|---|---|---|
| Email + password | `POST /auth/signup`, `POST /auth/login` | `users.password_hash` (bcrypt, 12 rounds) |
| Google OAuth (web) | `GET /auth/google` → callback at `/auth/google/callback` | `users.google_id = profile.id` |
| Google ID token (mobile) | `POST /auth/google/mobile` | same `users.google_id`, no callback URL needed |

Local auth users get a synthetic Google ID of `local:<email>` so the column stays NOT NULL.

## Session model

- `express-session` + `connect-pg-simple` stores sessions in the `session` table.
- Cookie is `httpOnly`, `sameSite=lax`, `secure` in production.
- 30-day TTL when "remember me" is checked, otherwise session-scoped.
- `req.session.regenerate()` is called after every successful login to prevent session-fixation.
- `SESSION_SECRET` must be ≥ 32 chars in production — the boot guard exits otherwise.
- **Mobile session delivery:** auth JSON responses return the signed session both in an `X-Session-Cookie` response header **and** in the body as `mobileSession`. iOS native networking (NSURLSession) can swallow the header in standalone/TestFlight builds, so the client captures from the body (header is the fallback). Both carry the same `connect.sid=…` value. Covered by `tests/ios-session.test.js`.

## Password policy (`isStrongPassword`)

- 12-200 chars
- at least one upper, one lower, one digit
- enforced at signup only — existing users with weaker passwords can still log in

Failures redirect with `?error=weak&mode=signup` (or return `400 {"error": "..."}` to JSON clients).

## Mobile flow (`POST /auth/google/mobile`)

1. Mobile app gets a Google ID token via `expo-auth-session`.
2. Server posts the token to Google's `tokeninfo` endpoint.
3. Validates `aud` is one of `GOOGLE_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` / `GOOGLE_ANDROID_CLIENT_ID`, `email_verified === true`, `exp` not past.
4. Upserts the user, regenerates session, returns user JSON.
5. The mobile client persists the resulting `connect.sid` cookie via `expo-secure-store`.

## JSON-aware auth endpoints

`/auth/signup` and `/auth/login` detect `Accept: application/json` and return JSON instead of redirects. Web flow is unchanged.

## Authorization

`requireAuth` middleware rejects unauthenticated requests on every `/api/*` route except `/api/user` (which returns `null` for unauthenticated callers).

Board ownership is verified via `getBoardContext(req)`, which:
- accepts `?board=N` query param or `boardId` body field
- returns `{boardId, ownerId}` if the caller owns the board or is a member
- throws `403 Access denied` otherwise

## Rate limiting

- `authLimiter`: 10 requests / 15 min on `/auth/signup`, `/auth/login`, `/auth/google/mobile`
- `usernameLimiter`: 30 / 60 s on `/api/check-username`
- `apiLimiter`: 200 / 15 min global on `/api/*`

All passthrough when `NODE_ENV=test`.
