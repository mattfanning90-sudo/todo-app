---
name: Infrastructure and backup setup
description: Railway services, environment variables, and automated backup/restore configuration
type: project
---

**App is live on Railway** — deployed as a Node.js service backed by a PostgreSQL database.

**Why:** Production app with real user data — Railway is the hosting provider.

**How to apply:** When touching deployment, env vars, or data safety, refer to this.

## Railway services
- **App service** — Node.js, runs `server.js`
- **Primary database** — PostgreSQL, env var `DATABASE_URL` (set automatically by Railway)
- **Backup database** — second PostgreSQL service named `tasks-backup`, env var `BACKUP_DATABASE_URL` (user must add manually from backup DB's Variables tab)

## Environment variables (set in Railway app service Variables tab)
- `DATABASE_URL` — primary database (auto-linked)
- `BACKUP_DATABASE_URL` — backup database URL (copied from tasks-backup service)
- `SESSION_SECRET` — long random string for session signing
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials
- `CALLBACK_URL` — Railway domain callback, e.g. `https://yourapp.railway.app/auth/google/callback`
- `RESTORE_SECRET` — secret to protect the backup restore endpoint (value stored in Railway only, never in code)
- `NODE_ENV=production`

## Automated backup
- Snapshot taken on **every app startup** (protects against redeploys)
- Snapshot taken **daily at 2am**
- Last **7 snapshots** kept (rolling window)
- Snapshots stored in `snapshots` table in the backup database as JSONB

## Restore procedure (if primary DB is wiped)
1. Deploy app (it will start with empty DB — that's fine)
2. List available snapshots: `GET /api/admin/backups?secret=<RESTORE_SECRET>`
3. Restore latest: `POST /api/admin/restore/1?secret=<RESTORE_SECRET>` (use snapshot id from step 2)
4. All users, boards, tasks, categories restored; sequences reset so new data won't collide

**The actual RESTORE_SECRET value is stored only in Railway's Variables tab — never in code or notes.**
