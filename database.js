const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('todos.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT DEFAULT '',
    owners TEXT DEFAULT '[]',
    cal_start TEXT DEFAULT '',
    cal_end TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    stage TEXT DEFAULT 'backlog',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migrate existing databases that don't have the stage column
try { db.exec("ALTER TABLE tasks ADD COLUMN stage TEXT DEFAULT 'backlog'"); } catch {}

module.exports = db;
