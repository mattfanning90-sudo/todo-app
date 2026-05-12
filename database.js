const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

function buildSsl(prefix = '') {
  if (!process.env[`${prefix}DATABASE_URL`]) return false;
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
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      console.log(`Migration: ran ${file}`);
    } catch (e) {
      await pool.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${e.message}`);
    }
  }
}

module.exports = { pool, init, buildSsl };
