---
name: Deployment plan
description: User wants to deploy to Railway but is waiting until more comfortable with the stack
type: project
---

Plan to deploy to Railway when ready.

**Why:** User wants a proper hosted app but is new to development and wants to get more comfortable first.

**How to apply:** When the user is ready to deploy, walk them through Railway step by step. Key things to do before deploying:
- Switch SQLite (`node:sqlite`) to PostgreSQL — Railway provides a free hosted PostgreSQL instance
- Add a persistent session store (database-backed instead of in-memory)
- Set all `.env` variables in Railway's dashboard (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, CALLBACK_URL)
- Update CALLBACK_URL to the Railway domain instead of localhost
- Update Google Cloud Console to add the Railway callback URL as an authorized redirect URI
