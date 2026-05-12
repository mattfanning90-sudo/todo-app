-- Postgres refuses to auto-cast a column's TEXT DEFAULT to jsonb, so we drop
-- the defaults, change the type, then set the new jsonb defaults — all inside
-- a single ALTER TABLE so the rewrite holds ACCESS EXCLUSIVE exactly once.
ALTER TABLE tasks
  ALTER COLUMN owners   DROP DEFAULT,
  ALTER COLUMN subtasks DROP DEFAULT,
  ALTER COLUMN owners   TYPE jsonb USING COALESCE(NULLIF(owners,   '')::jsonb, '[]'::jsonb),
  ALTER COLUMN subtasks TYPE jsonb USING COALESCE(NULLIF(subtasks, '')::jsonb, '[]'::jsonb),
  ALTER COLUMN owners   SET DEFAULT '[]'::jsonb,
  ALTER COLUMN subtasks SET DEFAULT '[]'::jsonb;
