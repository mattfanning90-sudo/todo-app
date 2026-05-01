require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { pool, init } = require('./database');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

const DEFAULT_CATEGORIES = [
  { name: 'Household',   color: '#34A853' },
  { name: 'Financial',   color: '#FBBC05' },
  { name: 'Health',      color: '#EA4335' },
  { name: 'Learning',    color: '#4285F4' },
  { name: 'Travel',      color: '#8B5CF6' },
  { name: 'Development', color: '#10B981' },
];

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

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
      const result = await pool.query(
        'INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *',
        [profile.id, email, name]
      );
      user = result.rows[0];
    }

    const countResult = await pool.query('SELECT COUNT(*) as c FROM categories WHERE user_id = $1', [user.id]);
    if (Number(countResult.rows[0].c) === 0) {
      await pool.query('BEGIN');
      try {
        for (const c of DEFAULT_CATEGORIES) {
          await pool.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [user.id, c.name, c.color]);
        }
        await pool.query('COMMIT');
      } catch (e) {
        await pool.query('ROLLBACK');
        throw e;
      }
    }

    return done(null, user);
  } catch (e) {
    return done(e);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || false);
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
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL', [email]
    );
    const user = rows[0];
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false);
    return done(null, user);
  } catch (e) {
    return done(e);
  }
}));

/* ── Auth routes ── */
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

/* ── Protected app ── */
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

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO users (google_id, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
    [`local:${email}`, email, email.split('@')[0], password_hash]
  );
  const user = rows[0];

  const catCount = await pool.query('SELECT COUNT(*) as c FROM categories WHERE user_id = $1', [user.id]);
  if (Number(catCount.rows[0].c) === 0) {
    await pool.query('BEGIN');
    try {
      for (const c of DEFAULT_CATEGORIES) {
        await pool.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3)', [user.id, c.name, c.color]);
      }
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
  }

  req.login(user, err => {
    if (err) return res.redirect('/login?error=server&mode=signup');
    res.redirect('/');
  });
}));

app.post('/auth/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login?error=invalid',
}));

/* ── API: user ── */
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json(null);
  res.json({ name: req.user.name, email: req.user.email });
});

/* ── API: categories ── */
app.get('/api/categories', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories WHERE user_id = $1 ORDER BY id ASC', [req.user.id]);
  res.json(rows);
}));

app.post('/api/categories', requireAuth, wrap(async (req, res) => {
  const { name, color = '#667eea' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { rows } = await pool.query(
    'INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, name, color]
  );
  res.json(rows[0]);
}));

app.delete('/api/categories/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('UPDATE tasks SET category_id = NULL WHERE category_id = $1', [rows[0].id]);
  await pool.query('DELETE FROM categories WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

/* ── API: tasks ── */
app.get('/api/tasks', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM tasks WHERE user_id = $1 ORDER BY position ASC, created_at ASC',
    [req.user.id]
  );
  rows.forEach(t => { t.owners = JSON.parse(t.owners || '[]'); });
  res.json(rows);
}));

app.post('/api/tasks', requireAuth, wrap(async (req, res) => {
  const { text, status = '', owners = [], cal_start = '', cal_end = '', stage = 'backlog', category_id = null } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });

  const maxResult = await pool.query('SELECT MAX(position) as m FROM tasks WHERE user_id = $1', [req.user.id]);
  const position = (maxResult.rows[0].m ?? -1) + 1;

  const { rows } = await pool.query(
    'INSERT INTO tasks (user_id, text, status, owners, cal_start, cal_end, position, stage, category_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [req.user.id, text, status, JSON.stringify(owners), cal_start, cal_end, position, stage, category_id]
  );
  const task = rows[0];
  task.owners = JSON.parse(task.owners || '[]');
  res.json(task);
}));

app.put('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const { text, status = '', owners = [], cal_start = '', cal_end = '', stage, category_id = null } = req.body;
  await pool.query(
    'UPDATE tasks SET text = COALESCE($1, text), status = $2, owners = $3, cal_start = $4, cal_end = $5, stage = COALESCE($6, stage), category_id = $7 WHERE id = $8',
    [text || null, status, JSON.stringify(owners), cal_start, cal_end, stage || null, category_id, rows[0].id]
  );
  res.json({ ok: true });
}));

app.delete('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('DELETE FROM tasks WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

app.post('/api/reorder', requireAuth, wrap(async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });

  await pool.query('BEGIN');
  try {
    for (const [idx, id] of order.entries()) {
      await pool.query('UPDATE tasks SET position = $1 WHERE id = $2 AND user_id = $3', [idx, id, req.user.id]);
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
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
