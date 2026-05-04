require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const chrono = require('chrono-node');
const pgSession = require('connect-pg-simple')(session);
const { pool, init } = require('./database');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'));

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true, ttl: 30 * 24 * 60 * 60 }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {},
}));

app.use(passport.initialize());
app.use(passport.session());

const ADJECTIVES = ['Fluffy','Bouncy','Sleepy','Sparkly','Dizzy','Fuzzy','Wiggly','Wobbly','Zippy','Bubbly','Giggly','Squishy','Crunchy','Goofy','Wacky','Zany','Loopy','Nutty','Snappy','Perky','Peppy','Clumsy','Grumpy','Jumpy','Funky','Chunky','Spunky','Quirky','Ditzy','Kooky','Daffy','Slimy','Wobbly','Sproingy','Blobby','Noodly','Bonkers','Doozy','Wriggly','Zonked','Plonky','Snazzy','Swirly','Twirly','Zonky','Pudgy','Chubby','Floppy','Droopy','Squirmy'];
const NOUNS = ['Penguin','Waffle','Noodle','Biscuit','Pickle','Muffin','Panda','Narwhal','Platypus','Hedgehog','Capybara','Quokka','Axolotl','Sloth','Lemur','Meerkat','Puffin','Wombat','Dumpling','Crumpet','Bagel','Pretzel','Donut','Brownie','Pudding','Sprinkle','Marshmallow','Jellybean','Cookie','Cupcake','Taco','Burrito','Blobfish','Salamander','Armadillo','Tapir','Manatee','Croissant','Scone','Streusel','Baguette','Churro','Macaron','Eclair','Strudel','Turnip','Parsnip','Radish','Courgette','Aubergine'];

async function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const base = `${adj}${noun}`;
  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [base]);
  if (!rows.length) return base;
  for (let i = 2; i <= 9999; i++) {
    const candidate = `${base}${i}`;
    const { rows: r } = await pool.query('SELECT id FROM users WHERE username = $1', [candidate]);
    if (!r.length) return candidate;
  }
  return `${base}${Date.now()}`;
}

const DEFAULT_CATEGORIES = [
  { name: 'Household',   color: '#34A853' },
  { name: 'Financial',   color: '#FBBC05' },
  { name: 'Health',      color: '#EA4335' },
  { name: 'Learning',    color: '#4285F4' },
  { name: 'Travel',      color: '#8B5CF6' },
  { name: 'Development', color: '#10B981' },
];

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

async function seedCategories(userId) {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM categories WHERE user_id = $1', [userId]);
  if (Number(rows[0].c) === 0) {
    await pool.query('BEGIN');
    try {
      for (const c of DEFAULT_CATEGORIES) {
        await pool.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [userId, c.name, c.color]);
      }
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }
}

async function getBoardOwner(req) {
  const boardId = req.query.board || req.body?.boardOwner;
  if (!boardId || Number(boardId) === req.user.id) return req.user.id;
  const ownerId = Number(boardId);
  const { rows } = await pool.query(
    'SELECT id FROM board_members WHERE board_owner_id = $1 AND member_user_id = $2',
    [ownerId, req.user.id]
  );
  if (!rows.length) throw Object.assign(new Error('Access denied'), { status: 403 });
  return ownerId;
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value || '';
    const name = profile.displayName || '';
    let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
    let user = rows[0];
    if (!user) {
      const username = await generateUsername();
      const result = await pool.query(
        'INSERT INTO users (google_id, email, name, username) VALUES ($1, $2, $3, $4) RETURNING *',
        [profile.id, email, name, username]
      );
      user = result.rows[0];
    } else if (!user.username) {
      const username = await generateUsername();
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, user.id]);
      user.username = username;
    }
    await seedCategories(user.id);
    return done(null, user);
  } catch (e) {
    return done(e);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (user && !user.username) {
      const username = await generateUsername();
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, user.id]);
      user.username = username;
    }
    done(null, user || false);
  } catch (e) {
    done(e);
  }
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL', [email]);
    const user = rows[0];
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false);
    return done(null, user);
  } catch (e) {
    return done(e);
  }
}));

/* ── Auth ── */
app.get('/auth/google', (req, res, next) => {
  if (req.query.remember) req.session.rememberMe = true;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  if (req.session.rememberMe) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    delete req.session.rememberMe;
  }
  res.redirect('/');
});
app.get('/auth/logout', (req, res) => req.logout(() => res.redirect('/login')));

app.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/signup', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.redirect('/login?error=missing&mode=signup');
  if (password.length < 8) return res.redirect('/login?error=short&mode=signup');
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return res.redirect('/login?error=taken&mode=signup');
  const displayName = (req.body.name || '').trim() || email.split('@')[0];
  const requestedUsername = (req.body.username || '').trim();

  let username;
  if (requestedUsername && /^[a-zA-Z0-9_]{3,30}$/.test(requestedUsername)) {
    const taken = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [requestedUsername]);
    if (taken.rows[0]) return res.redirect('/login?error=username_taken&mode=signup');
    username = requestedUsername;
  } else {
    username = await generateUsername();
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO users (google_id, email, name, password_hash, username) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [`local:${email}`, email, displayName, password_hash, username]
  );
  await seedCategories(rows[0].id);
  req.login(rows[0], err => {
    if (err) return res.redirect('/login?error=server&mode=signup');
    res.redirect('/');
  });
}));

app.post('/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login?error=invalid');
    req.login(user, err => {
      if (err) return next(err);
      if (req.body.remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      res.redirect('/');
    });
  })(req, res, next);
});

/* ── Username availability ── */
app.get('/api/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.json({ available: false });
  }
  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  res.json({ available: !rows.length });
});

/* ── User ── */
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json(null);
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, username: req.user.username });
});

/* ── Boards ── */
app.get('/api/boards/members', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email FROM board_members bm
     JOIN users u ON u.id = bm.member_user_id
     WHERE bm.board_owner_id = $1 ORDER BY bm.created_at ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

app.post('/api/boards/invite', requireAuth, wrap(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
  const invitee = rows[0];
  if (!invitee) return res.status(404).json({ error: "User not found — they need to sign up first." });
  if (invitee.id === req.user.id) return res.status(400).json({ error: 'Cannot invite yourself' });
  await pool.query(
    'INSERT INTO board_members (board_owner_id, member_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.user.id, invitee.id]
  );
  await pool.query(
    'INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1, $2, $3, $4)',
    [invitee.id, 'board_invite', `${req.user.name || req.user.email} added you to their board`, req.user.id]
  );
  res.json(invitee);
}));

app.delete('/api/boards/members/:userId', requireAuth, wrap(async (req, res) => {
  await pool.query(
    'DELETE FROM board_members WHERE board_owner_id = $1 AND member_user_id = $2',
    [req.user.id, req.params.userId]
  );
  res.json({ ok: true });
}));

app.get('/api/boards/memberships', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email FROM board_members bm
     JOIN users u ON u.id = bm.board_owner_id
     WHERE bm.member_user_id = $1 ORDER BY bm.created_at ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

/* ── Notifications ── */
app.get('/api/notifications', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.*, u.name as from_name, u.email as from_email
     FROM notifications n LEFT JOIN users u ON u.id = n.from_user_id
     WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
}));

app.post('/api/notifications/read', requireAuth, wrap(async (req, res) => {
  await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));

/* ── Categories ── */
app.get('/api/categories', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { rows } = await pool.query('SELECT * FROM categories WHERE user_id = $1 ORDER BY id ASC', [ownerId]);
  res.json(rows);
}));

app.post('/api/categories', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { name, color = '#667eea' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { rows } = await pool.query(
    'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
    [ownerId, name, color]
  );
  res.json(rows[0]);
}));

app.delete('/api/categories/:id', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, ownerId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('UPDATE tasks SET category_id = NULL WHERE category_id = $1', [rows[0].id]);
  await pool.query('DELETE FROM categories WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

/* ── Tasks ── */
app.get('/api/tasks', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { rows } = await pool.query(
    `SELECT t.*, u.name as assigned_to_name, u.email as assigned_to_email
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to_user_id
     WHERE t.user_id = $1 ORDER BY t.position ASC, t.created_at ASC`,
    [ownerId]
  );
  rows.forEach(t => {
    t.owners = JSON.parse(t.owners || '[]');
    t.subtasks = JSON.parse(t.subtasks || '[]');
  });
  res.json(rows);
}));

app.post('/api/tasks', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const {
    text: rawText, status = '', owners = [], cal_start = '', cal_end = '',
    stage = 'backlog', category_id = null, due_date: explicitDue = '',
    priority = 'none', recurrence = '', subtasks = [], assigned_to_user_id = null
  } = req.body;
  if (!rawText) return res.status(400).json({ error: 'Text required' });

  let due_date = explicitDue;
  let text = rawText;
  if (!explicitDue) {
    const parsed = chrono.parse(rawText);
    if (parsed.length > 0) {
      due_date = parsed[0].date().toISOString().split('T')[0];
      const stripped = rawText.replace(parsed[0].text, '').trim().replace(/\s+/g, ' ');
      if (stripped.length > 0) text = stripped;
    }
  }

  const maxResult = await pool.query('SELECT MAX(position) as m FROM tasks WHERE user_id = $1', [ownerId]);
  const position = (maxResult.rows[0].m ?? -1) + 1;

  const { rows } = await pool.query(
    `INSERT INTO tasks
       (user_id, text, status, owners, cal_start, cal_end, position, stage,
        category_id, due_date, priority, recurrence, subtasks, assigned_to_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [ownerId, text, status, JSON.stringify(owners), cal_start, cal_end, position,
     stage, category_id, due_date, priority, recurrence, JSON.stringify(subtasks), assigned_to_user_id]
  );
  const task = rows[0];
  task.owners = JSON.parse(task.owners || '[]');
  task.subtasks = JSON.parse(task.subtasks || '[]');

  if (assigned_to_user_id && assigned_to_user_id !== req.user.id) {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, task_id, from_user_id) VALUES ($1,$2,$3,$4,$5)',
      [assigned_to_user_id, 'task_assigned',
       `${req.user.name || req.user.email} assigned you: "${text.slice(0, 60)}"`,
       task.id, req.user.id]
    );
  }
  res.json(task);
}));

app.put('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, ownerId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const task = rows[0];

  const {
    text, status = '', owners = [], cal_start = '', cal_end = '', stage,
    category_id = null, due_date = '', priority = 'none', recurrence = '',
    subtasks = [], assigned_to_user_id = null
  } = req.body;

  if (assigned_to_user_id && assigned_to_user_id !== task.assigned_to_user_id && assigned_to_user_id !== req.user.id) {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, task_id, from_user_id) VALUES ($1,$2,$3,$4,$5)',
      [assigned_to_user_id, 'task_assigned',
       `${req.user.name || req.user.email} assigned you: "${(text || task.text).slice(0, 60)}"`,
       task.id, req.user.id]
    );
  }

  await pool.query(
    `UPDATE tasks SET
       text = COALESCE($1, text), status = $2, owners = $3, cal_start = $4, cal_end = $5,
       stage = COALESCE($6, stage), category_id = $7, due_date = $8, priority = $9,
       recurrence = $10, subtasks = $11, assigned_to_user_id = $12
     WHERE id = $13`,
    [text || null, status, JSON.stringify(owners), cal_start, cal_end, stage || null,
     category_id, due_date, priority, recurrence, JSON.stringify(subtasks), assigned_to_user_id, task.id]
  );
  res.json({ ok: true });
}));

app.delete('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, ownerId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('DELETE FROM tasks WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

app.post('/api/reorder', requireAuth, wrap(async (req, res) => {
  const ownerId = await getBoardOwner(req);
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });
  await pool.query('BEGIN');
  try {
    for (const [idx, id] of order.entries()) {
      await pool.query('UPDATE tasks SET position = $1 WHERE id = $2 AND user_id = $3', [idx, id, ownerId]);
    }
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
