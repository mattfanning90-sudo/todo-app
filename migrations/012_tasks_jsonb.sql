ALTER TABLE tasks
  ALTER COLUMN owners TYPE jsonb USING COALESCE(NULLIF(owners, '')::jsonb, '[]'::jsonb),
  ALTER COLUMN subtasks TYPE jsonb USING COALESCE(NULLIF(subtasks, '')::jsonb, '[]'::jsonb);

ALTER TABLE tasks ALTER COLUMN owners SET DEFAULT '[]'::jsonb;
ALTER TABLE tasks ALTER COLUMN subtasks SET DEFAULT '[]'::jsonb;
