CREATE INDEX IF NOT EXISTS tasks_board_archived_position_idx
  ON tasks (board_id, archived, position, created_at);
