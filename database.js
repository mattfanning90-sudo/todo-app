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

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#667eea',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    category_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );
`);

// Migrations for existing databases
try { db.exec("ALTER TABLE tasks ADD COLUMN stage TEXT DEFAULT 'backlog'"); } catch {}
try { db.exec("ALTER TABLE tasks ADD COLUMN category_id INTEGER"); } catch {}

module.exports = db;
