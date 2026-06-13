import { describe, it, expect } from 'vitest';
import { migrationsApplied } from '../../server.js';
import database from '../../database.js';

const { pool } = database;

// Covers the prod-critical /readyz migration gate (server.js#migrationsApplied),
// which the fast pg-mem suite can't reach because it forces NODE_ENV=test (so
// /readyz skips the check). Here _migrations is a real table populated by init().
describe('real-PG: migrationsApplied() — the /readyz migration gate', () => {
  it('is true when every shipped migration is recorded', async () => {
    // setup.js ran init() in beforeAll → all migrations recorded.
    expect(await migrationsApplied()).toBe(true);
  });

  it('is false when a migration is missing (→ /readyz 503 migrations_pending in prod)', async () => {
    const { rows } = await pool.query('SELECT filename FROM _migrations ORDER BY filename DESC LIMIT 1');
    const filename = rows[0].filename;
    await pool.query('DELETE FROM _migrations WHERE filename = $1', [filename]);
    try {
      expect(await migrationsApplied()).toBe(false);
    } finally {
      // Restore so a later init()/file doesn't try to re-run the (non-idempotent) migration.
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
    }
  });
});
