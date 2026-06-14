-- Task reminder preferences (Phase 1: on-device local notifications).
-- Additive + idempotent so the pre-deploy migration runner (scripts/migrate.js)
-- can apply it before the new container serves, keeping the /readyz gate clean.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TEXT DEFAULT '09:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER DEFAULT 0;
