-- Notifications: every read filters by user_id and orders by created_at DESC.
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

-- Digest runs hourly and filters users by digest_frequency.
CREATE INDEX IF NOT EXISTS users_digest_frequency_idx
  ON users (digest_frequency)
  WHERE digest_frequency <> 'none';

-- Board membership checks happen on every board switch and member-list view.
CREATE INDEX IF NOT EXISTS board_members_board_member_idx
  ON board_members (board_id, member_user_id);

-- The export endpoint and a few legacy paths still filter tasks by user_id.
CREATE INDEX IF NOT EXISTS tasks_user_id_idx
  ON tasks (user_id);

-- Invite redemption looks up by token; case-insensitive email lookup.
CREATE INDEX IF NOT EXISTS invites_token_idx
  ON invites (token);
CREATE INDEX IF NOT EXISTS invites_email_lower_idx
  ON invites (LOWER(invitee_email));
