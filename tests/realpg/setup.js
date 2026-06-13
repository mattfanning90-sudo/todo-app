// Setup for the real-Postgres test layer (A5). Unlike tests/setup.js, this does
// NOT mock `pg` with pg-mem — it runs against a real Postgres (docker-compose
// `db`, a local server, or the CI `postgres` service), so the queries pg-mem
// can't model are actually exercised: COUNT(*) FILTER, DATE()/INTERVAL, the
// jsonb columns from migration 012, and the digest LATERAL join.
import { beforeAll, beforeEach, afterAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'test-secret-must-be-at-least-32-characters-long';
process.env.APP_URL ||= 'http://localhost:3000';
// Test/CI Postgres doesn't speak SSL; opt out before database.js builds its pool.
process.env.DB_SSL ||= 'disable';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Real-Postgres tests need DATABASE_URL. Run `docker compose up -d db` then ' +
    '`DATABASE_URL=postgres://todo:todo@localhost:5433/todo_realpg_test npm run test:realpg`, ' +
    'or point it at any throwaway Postgres.'
  );
}

// Dynamic import AFTER env is set so database.js builds its pool against the
// real DATABASE_URL (the import also caches the pool that server.js reuses).
const { pool, init } = await import('../../database.js');

beforeAll(async () => {
  await init(); // runs ALL migrations in order, including 012's TEXT→jsonb.
}, 60000);

// Isolate tests: wipe every app table (keep _migrations) between each.
beforeEach(async () => {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_migrations'`
  );
  if (rows.length) {
    const list = rows.map(r => `"${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await pool.end();
});
