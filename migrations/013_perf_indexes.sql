CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS users_digest_frequency_idx
  ON users (digest_frequency)
  WHERE digest_frequency <> 'none';

CREATE INDEX IF NOT EXISTS board_members_board_member_idx
  ON board_members (board_id, member_user_id);

CREATE INDEX IF NOT EXISTS tasks_user_id_idx
  ON tasks (user_id);

CREATE INDEX IF NOT EXISTS invites_token_idx
  ON invites (token);
CREATE INDEX IF NOT EXISTS invites_email_lower_idx
  ON invites (LOWER(invitee_email));
