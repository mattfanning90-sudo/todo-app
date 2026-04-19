require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
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

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails?.[0]?.value || '';
  const name = profile.displayName || '';

  let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);
  if (!user) {
    const result = db.prepare('INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)').run(profile.id, email, name);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  }
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

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

/* ── API ── */
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json(null);
  res.json({ name: req.user.name, email: req.user.email });
});

app.get('/api/tasks', requireAuth, (req, res) => {
  const tasks = db.prepare(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY position ASC, created_at ASC'
  ).all(req.user.id);
  tasks.forEach(t => { t.owners = JSON.parse(t.owners || '[]'); });
  res.json(tasks);
});

app.post('/api/tasks', requireAuth, (req, res) => {
  const { text, status = '', owners = [], cal_start = '', cal_end = '', stage = 'backlog' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });

  const maxPos = db.prepare('SELECT MAX(position) as m FROM tasks WHERE user_id = ?').get(req.user.id);
  const position = (maxPos.m ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO tasks (user_id, text, status, owners, cal_start, cal_end, position, stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, text, status, JSON.stringify(owners), cal_start, cal_end, position, stage);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  task.owners = JSON.parse(task.owners);
  res.json(task);
});

app.put('/api/tasks/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const { status = '', owners = [], cal_start = '', cal_end = '', stage } = req.body;
  db.prepare(
    'UPDATE tasks SET status = ?, owners = ?, cal_start = ?, cal_end = ?, stage = COALESCE(?, stage) WHERE id = ?'
  ).run(status, JSON.stringify(owners), cal_start, cal_end, stage || null, task.id);

  res.json({ ok: true });
});

app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.json({ ok: true });
});

app.post('/api/reorder', requireAuth, (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });

  const update = db.prepare('UPDATE tasks SET position = ? WHERE id = ? AND user_id = ?');
  db.transaction((ids) => {
    ids.forEach((id, idx) => update.run(idx, id, req.user.id));
  })(order);

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
