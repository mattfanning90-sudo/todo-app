// Standalone migration runner. Railway's preDeployCommand (railway.json) runs
// this in a release phase BEFORE the new container serves traffic: if a
// migration fails, the deploy fails and the PREVIOUS deployment keeps serving —
// no crash-loop, no downtime. Idempotent (init() skips migrations already
// recorded in _migrations), so it's safe alongside the boot-time fallback.
//
//   node scripts/migrate.js
//   # local against a non-SSL Postgres:
//   DATABASE_URL=… DB_SSL=disable node scripts/migrate.js
require('dotenv').config();
const { pool, init } = require('../database');

init()
  .then(() => console.log('[migrate] schema up to date'))
  .catch((err) => {
    console.error('[migrate] FAILED:', err.message);
    process.exitCode = 1; // non-zero → Railway fails the deploy, keeps old instance
  })
  .finally(async () => { try { await pool.end(); } catch {} });
