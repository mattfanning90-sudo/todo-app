---
name: Deployment and mobile plan
description: User wants to deploy to Railway then add PWA support to use the app on their phone
type: project
---

**Step 1 — Deploy to Railway** (next session)

**Why:** App currently only runs locally. Railway is needed before the app can be used on a phone.

**How to apply:** Walk through Railway setup step by step:
- Switch SQLite (`node:sqlite`) to PostgreSQL — Railway provides a free hosted instance
- Add persistent session store (database-backed instead of in-memory)
- Set all `.env` variables in Railway's dashboard (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, CALLBACK_URL)
- Update CALLBACK_URL to the Railway domain instead of localhost
- Update Google Cloud Console to add the Railway callback URL as an authorized redirect URI

**Step 2 — Add PWA support** (after Railway is live)

**Why:** User wants the app on their iPhone home screen as a regular app icon.

**How to apply:** After Railway deployment, add PWA support:
- Create a `manifest.json` with app name, icons, theme colour (#FFCC00 for CBA branding)
- Add a `service-worker.js` for offline support
- Link manifest in `public/index.html`
- On iPhone: Safari → Share → "Add to Home Screen"
- No App Store needed, no $99 Apple developer account needed
