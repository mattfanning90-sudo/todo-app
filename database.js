const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function buildSsl(prefix = '') {
  if (!process.env[`${prefix}DATABASE_URL`]) return false;
  // Explicit opt-out for a Postgres that doesn't speak SSL (local dev, the
  // real-PG test layer, CI service container). Gated to non-prod so it's an
  // ENFORCED invariant, not just a convention — prod can never disable SSL this way.
  if (process.env.NODE_ENV !== 'production'
      && (process.env[`${prefix}DB_SSL`] || '').toLowerCase() === 'disable') return false;
  const ca = process.env[`${prefix}DB_CA_CERT`];
  if (ca) return { ca, rejectUnauthorized: true };
  if (process.env.NODE_ENV === 'production') {
    console.warn(`WARN: ${prefix || ''}DATABASE_URL is set but ${prefix}DB_CA_CERT is missing — TLS verification is disabled.`);
  }
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSsl(),
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows } = await pool.query('SELECT filename FROM _migrations ORDER BY filename ASC');
  const ran = new Set(rows.map(r => r.filename));

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (ran.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Use a single checked-out client so BEGIN/migration/INSERT/COMMIT all
    // run on the same connection. pool.query may dispatch to different
    // clients per call, which would silently break the transaction.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Fail fast on lock contention instead of hanging the deploy: during the
      // pre-deploy phase the OLD instance is still serving, so a migration that
      // needs an exclusive lock could wait indefinitely. Bound that wait only —
      // deliberately NO statement_timeout, so a legitimately long table rewrite
      // (e.g. a 012-style jsonb retype on a large table) isn't aborted mid-flight.
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Migration: ran ${file}`);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw new Error(`Migration ${file} failed: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { pool, init, buildSsl };
