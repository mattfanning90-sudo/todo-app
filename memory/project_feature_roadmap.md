---
name: Feature roadmap
description: Planned features requested by user, in priority order
type: project
---

**Why:** User is building a production todo app and wants to ship these features next.

**How to apply:** When user asks "what's next" or "continue", refer to this list. Always create migration files for schema changes — never ask the user to do it.

## Requested features (in order of complexity)

### Quick wins
1. **Swipe to refresh** — pull-to-refresh gesture on Safari/mobile, no backend needed
2. **Archive tickets** — archive completed tasks (hide from board, keep for future dashboard). Needs migration: `archived BOOLEAN DEFAULT false`, `archived_at TIMESTAMP`

### Medium
3. **Email digest** — user chooses daily/weekly/fortnightly summary email of their to-do list. Uses existing SMTP + node-cron. Needs migration: `digest_frequency TEXT DEFAULT 'none'` on users table. Settings UI in sidebar.
4. **Filters on shared boards** — standard + custom category filters should work on boards the user is a member of (not just owned boards)

### Larger
5. **Linked tickets across boards** — invite someone to a ticket so it appears on both boards and stays in sync. Needs new schema: `task_collaborators (task_id, user_id, board_id)` or a `shared_from_task_id` reference with sync-on-update logic.
6. **Invite to board with full feature parity** — shared boards should have all the same filters/features as owned boards (partially done)

## Features user hasn't mentioned but should have
- **Global search** — no way to search across all tasks yet
- **Dashboard/stats** — completed tasks over time, open vs closed, overdue count (user mentioned "future dashboard work")
- **Due date reminders** — email/notification when a task is overdue or due today
- **Bulk actions** — select multiple tickets, archive/delete/move at once
- **Comments/activity log** on tickets — thread of updates
- **Keyboard shortcuts** — power user productivity
