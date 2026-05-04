const { Pool } = require('pg');
const cron = require('node-cron');

let backupPool = null;

async function initBackup() {
  if (!process.env.BACKUP_DATABASE_URL) {
    console.log('Backup: BACKUP_DATABASE_URL not set — skipping backup setup');
    return;
  }
  backupPool = new Pool({
    connectionString: process.env.BACKUP_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await backupPool.query(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data JSONB NOT NULL
    )
  `);
  console.log('Backup: connected to backup database');
}

async function runBackup(primaryPool) {
  if (!backupPool) return;
  try {
    const [users, boards, categories, tasks, members, invites] = await Promise.all([
      primaryPool.query('SELECT id, google_id, email, name, username, password_hash, created_at FROM users'),
      primaryPool.query('SELECT * FROM boards'),
      primaryPool.query('SELECT * FROM categories'),
      primaryPool.query('SELECT * FROM tasks'),
      primaryPool.query('SELECT * FROM board_members'),
      primaryPool.query('SELECT * FROM invites'),
    ]);
    const snapshot = {
      takenAt: new Date().toISOString(),
      users: users.rows,
      boards: boards.rows,
      categories: categories.rows,
      tasks: tasks.rows,
      board_members: members.rows,
      invites: invites.rows,
    };
    await backupPool.query('INSERT INTO snapshots (data) VALUES ($1)', [JSON.stringify(snapshot)]);
    // Keep only the last 7 snapshots
    await backupPool.query(`
      DELETE FROM snapshots
      WHERE id NOT IN (SELECT id FROM snapshots ORDER BY taken_at DESC LIMIT 7)
    `);
    console.log(`Backup: snapshot saved at ${snapshot.takenAt}`);
  } catch (e) {
    console.error('Backup: failed —', e.message);
  }
}

async function listSnapshots() {
  if (!backupPool) return [];
  const { rows } = await backupPool.query(
    'SELECT id, taken_at, pg_size_pretty(octet_length(data::text)::bigint) as size FROM snapshots ORDER BY taken_at DESC'
  );
  return rows;
}

async function restoreFromSnapshot(primaryPool, snapshotId) {
  if (!backupPool) throw new Error('No backup database configured');

  const { rows } = await backupPool.query(
    'SELECT * FROM snapshots WHERE id = $1', [snapshotId]
  );
  if (!rows[0]) throw new Error('Snapshot not found');

  const snap = rows[0].data;
  console.log(`Backup: restoring from snapshot ${snapshotId} (taken ${snap.takenAt})`);

  await primaryPool.query('BEGIN');
  try {
    // Restore in FK-safe order: users → boards → categories/members/invites → tasks
    for (const u of snap.users) {
      await primaryPool.query(`
        INSERT INTO users (id, google_id, email, name, username, password_hash, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          google_id = EXCLUDED.google_id, email = EXCLUDED.email,
          name = EXCLUDED.name, username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash
      `, [u.id, u.google_id, u.email, u.name, u.username, u.password_hash, u.created_at]);
    }

    for (const b of snap.boards) {
      await primaryPool.query(`
        INSERT INTO boards (id, owner_user_id, name, slug, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
      `, [b.id, b.owner_user_id, b.name, b.slug, b.created_at]);
    }

    for (const c of snap.categories) {
      await primaryPool.query(`
        INSERT INTO categories (id, user_id, board_id, name, color, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
      `, [c.id, c.user_id, c.board_id, c.name, c.color, c.created_at]);
    }

    for (const m of (snap.board_members || [])) {
      await primaryPool.query(`
        INSERT INTO board_members (id, board_id, board_owner_id, member_user_id, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO NOTHING
      `, [m.id, m.board_id, m.board_owner_id, m.member_user_id, m.created_at]);
    }

    for (const inv of (snap.invites || [])) {
      await primaryPool.query(`
        INSERT INTO invites (id, token, inviter_user_id, invitee_email, board_id, board_owner_id, used_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [inv.id, inv.token, inv.inviter_user_id, inv.invitee_email, inv.board_id, inv.board_owner_id, inv.used_at, inv.created_at]);
    }

    for (const t of snap.tasks) {
      await primaryPool.query(`
        INSERT INTO tasks (id, user_id, board_id, text, status, owners, cal_start, cal_end,
          position, stage, category_id, due_date, priority, recurrence, subtasks,
          assigned_to_user_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET
          text = EXCLUDED.text, status = EXCLUDED.status, stage = EXCLUDED.stage,
          due_date = EXCLUDED.due_date, priority = EXCLUDED.priority,
          category_id = EXCLUDED.category_id, subtasks = EXCLUDED.subtasks
      `, [t.id, t.user_id, t.board_id, t.text, t.status, t.owners,
          t.cal_start, t.cal_end, t.position, t.stage, t.category_id,
          t.due_date, t.priority, t.recurrence, t.subtasks, t.assigned_to_user_id, t.created_at]);
    }

    // Reset sequences so new inserts don't collide with restored IDs
    for (const table of ['users', 'boards', 'categories', 'tasks', 'board_members', 'invites']) {
      await primaryPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1))`);
    }

    await primaryPool.query('COMMIT');
    console.log(`Backup: restore complete — ${snap.users.length} users, ${snap.tasks.length} tasks`);
    return { users: snap.users.length, boards: snap.boards.length, tasks: snap.tasks.length };
  } catch (e) {
    await primaryPool.query('ROLLBACK');
    throw e;
  }
}

function scheduleDailyBackup(primaryPool) {
  // Run at 2am every day
  cron.schedule('0 2 * * *', () => runBackup(primaryPool));
}

module.exports = { initBackup, runBackup, listSnapshots, restoreFromSnapshot, scheduleDailyBackup };
