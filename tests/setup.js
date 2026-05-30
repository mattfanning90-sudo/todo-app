// Replace the `pg` driver with pg-mem so the whole server boots against an
// in-process Postgres clone. Migrations run once per fork; between tests we
// restore from a post-migration snapshot — cheap and avoids pg-mem's quirk of
// not fully cleaning PK constraint indexes on DROP CASCADE.

import { vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { newDb, DataType } from 'pg-mem';
import fs from 'fs';
import path from 'path';

const require_ = createRequire(import.meta.url);

const memDb = newDb({ autoCreateForeignKeyIndices: true });

for (const fn of ['pg_try_advisory_lock', 'pg_advisory_lock', 'pg_advisory_unlock']) {
  for (const arg of [DataType.integer, DataType.bigint]) {
    memDb.public.registerFunction({
      name: fn, args: [arg], returns: DataType.bool, implementation: () => true,
    });
  }
}
memDb.public.registerFunction({
  name: 'pg_size_pretty', args: [DataType.bigint], returns: DataType.text,
  implementation: n => `${n} bytes`,
});

// connect-pg-simple uses to_regclass to detect whether the session table exists.
memDb.public.registerFunction({
  name: 'to_regclass', args: [DataType.text], returns: DataType.text,
  implementation: name => {
    try { memDb.public.many(`SELECT 1 FROM ${name} LIMIT 0`); return name; }
    catch { return null; }
  },
});

// connect-pg-simple stores session expiry as `to_timestamp($expire_unix_seconds)`.
memDb.public.registerFunction({
  name: 'to_timestamp', args: [DataType.text], returns: DataType.timestamp,
  implementation: s => new Date(Number(s) * 1000),
});
memDb.public.registerFunction({
  name: 'to_timestamp', args: [DataType.float], returns: DataType.timestamp,
  implementation: n => new Date(n * 1000),
});

// pg-mem doesn't support the ~ (regex match) operator used in uniqueSlug().
// Register it so POST /api/boards works in tests.
memDb.public.registerOperator({
  operator: '~',
  left: DataType.text,
  right: DataType.text,
  returns: DataType.bool,
  implementation: (text, pattern) => new RegExp(pattern).test(text),
});

const pgAdapter = memDb.adapters.createPg();
const pgMock = {
  Pool: pgAdapter.Pool,
  Client: pgAdapter.Client,
  types: { setTypeParser() {}, builtins: {} },
};

// Patch Node's CommonJS require cache: CJS `require('pg')` bypasses vi.mock.
const pgPath = require_.resolve('pg');
require_.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: pgMock };
vi.mock('pg', () => ({ default: pgMock, ...pgMock }));

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-must-be-at-least-32-characters-long';
process.env.APP_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgres://test:test@localhost/test';

let cleanSnapshot = null;
const warnedMigrations = new Set();

beforeAll(() => {
  // Pre-create the session table so connect-pg-simple's auto-create path
  // (which uses COLLATE "default" / OIDS=FALSE, both unparseable by pg-mem)
  // is skipped via the to_regclass check.
  memDb.public.none(`
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL PRIMARY KEY,
      sess TEXT NOT NULL,
      expire TIMESTAMP NOT NULL
    );
  `);

  const dir = path.resolve('migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      memDb.public.none(sql);
    } catch (e) {
      if (!warnedMigrations.has(f)) {
        warnedMigrations.add(f);
        // 012 (JSONB cast USING) is the only one we expect to skip.
        console.warn(`pg-mem skipped migration ${f}: ${String(e.message || e).split('\n')[0]}`);
      }
    }
  }
  cleanSnapshot = memDb.backup();
});

beforeEach(() => {
  if (cleanSnapshot) cleanSnapshot.restore();
});

afterAll(async () => {
  try {
    const { pool } = await import('../database.js');
    await pool.end();
  } catch {}
});

export { memDb };
