# Data model

Postgres schema. Migrations live in `migrations/NNN_name.sql` and run on boot via `database.js#init()`. Each migration is recorded in `_migrations` so it runs exactly once per database.

## Tables

### `users`
- `id`, `email`, `name`, `username` (unique)
- `google_id` (for OAuth users; local users get `local:<email>`)
- `password_hash` (bcrypt, NULL for OAuth-only users)
- `digest_frequency` ∈ `none | daily | weekly | fortnightly`, `digest_last_sent`
- `created_at`

### `boards`
- `id`, `owner_user_id` → `users(id)`, `name`, `slug` (unique per owner)
- A user always has at least one board ("My Board") — ensured by `ensureDefaultBoard`.

### `board_members`
- `(board_id, member_user_id)` for shared boards. The owner is implicit (not in this table).

### `categories`
- `(id, user_id, board_id, name, color)`. Six defaults seeded on first board.

### `tasks`
- `id`, `user_id`, `board_id`, `text`, `status` (free-text notes)
- `owners`, `subtasks` — both `jsonb` since migration 012
- `cal_start`, `cal_end`, `due_date` (text in `YYYY-MM-DD`), `position`
- `stage` ∈ `backlog | in_progress | done`
- `category_id` (nullable), `priority` ∈ `none | low | medium | high`
- `recurrence` (free-text rule), `assigned_to_user_id`
- `archived`, `archived_at`, `completed_at`, `created_at`

### `invites`
- `(token, inviter_user_id, invitee_email, board_id, used_at, created_at)`. Tokens are random 32-byte hex.

### `notifications`
- `(user_id, type, message, task_id, from_user_id, read, created_at)`. Rows > 90 days old are pruned nightly.

## Indexes (migration 011, 013)

Hot-path indexes added after profiling:

- `tasks (board_id, archived, position, created_at)` — the main board fetch
- `notifications (user_id, created_at DESC)`
- `users (digest_frequency) WHERE digest_frequency <> 'none'` — partial index for the hourly digest cron
- `board_members (board_id, member_user_id)`
- `tasks (user_id)`
- `invites (token)`, `invites (LOWER(invitee_email))`

## Migration safety rules

See `docs/operations.md#migrations` and `CLAUDE.md`. The short version:

- Each migration is one numbered file, never edited after it's been recorded in `_migrations`.
- Use idempotent DDL (`IF NOT EXISTS`) — the runner's transaction boundary isn't reliable.
- For `ALTER COLUMN ... TYPE`, **always** `DROP DEFAULT` first, change the type, `SET DEFAULT` after. The original 012 crash-looped prod because of this.

## JSON columns

`tasks.owners` and `tasks.subtasks` are native `jsonb`. The `pg` driver returns parsed JS values on read; writes pass `JSON.stringify(value)` (works for both text and jsonb columns, so legacy code paths still compile).
