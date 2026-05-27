require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cookieSignature = require('cookie-signature');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const chrono = require('chrono-node');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, init } = require('./database');
const {
  initBackup, runBackup, listSnapshots, restoreFromSnapshot, scheduleDailyBackup,
  withLeaderLock, LOCK_KEY_DIGEST, LOCK_KEY_AUTO_ARCHIVE, closeBackupPool,
} = require('./backup');
const cron = require('node-cron');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

if (isProd) {
  const required = ['SESSION_SECRET', 'APP_URL', 'DATABASE_URL'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`FATAL: missing required env vars in production: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.SESSION_SECRET.length < 32) {
    console.error('FATAL: SESSION_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
}

const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      // Inline styles are a much smaller XSS surface than inline scripts and
      // login.html / local.html still ship inline <style> blocks.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// HTML served by express.static gets no-cache so the ?v=… query strings in
// /app.css and /app.js references (stamped in the HTML itself) reach the
// client promptly when we bump them. Assets stay cacheable; the query
// string makes each version a fresh cache entry.
app.use(express.static('public', {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    if (!isProd) console.error('/healthz failed:', e.message);
    res.status(503).json({ ok: false, error: 'db_unreachable' });
  }
});

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true, ttl: 30 * 24 * 60 * 60 }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
  },
}));

/* ── Rate limiters ── */
const passthroughLimiter = (req, res, next) => next();
const authLimiter = isTest ? passthroughLimiter : rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const searchLimiter = isTest ? passthroughLimiter : rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const usernameLimiter = isTest ? passthroughLimiter : rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = isTest ? passthroughLimiter : rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });

app.use(passport.initialize());
app.use(passport.session());

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isStrongPassword(p) {
  if (typeof p !== 'string' || p.length < 12 || p.length > 200) return false;
  return /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p);
}

/* ── Email ── */
const mailer = (process.env.SMTP_USER && process.env.SMTP_PASS)
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;

async function sendEmail({ to, subject, html }) {
  if (!mailer) return false;
  try { await mailer.sendMail({ from: `"Tasks" <${process.env.SMTP_USER}>`, to, subject, html }); return true; }
  catch (e) { console.error('Email error:', e.message); return false; }
}

/* ── Board helpers ── */
function slugify(name) {
  return (name || 'board').toLowerCase()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '') || 'board';
}

async function uniqueSlug(ownerId, name) {
  const base = slugify(name);
  const { rows } = await pool.query(
    "SELECT slug FROM boards WHERE owner_user_id = $1 AND slug ~ $2",
    [ownerId, `^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-[0-9]+)?$`]
  );
  if (!rows.length) return base;
  let i = 2;
  while (rows.find(r => r.slug === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

async function ensureDefaultBoard(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM boards WHERE owner_user_id = $1 ORDER BY id ASC LIMIT 1', [userId]
  );
  if (rows[0]) {
    await pool.query('UPDATE tasks SET board_id = $1 WHERE user_id = $2 AND board_id IS NULL', [rows[0].id, userId]);
    await pool.query('UPDATE categories SET board_id = $1 WHERE user_id = $2 AND board_id IS NULL', [rows[0].id, userId]);
    return rows[0];
  }
  const { rows: created } = await pool.query(
    'INSERT INTO boards (owner_user_id, name, slug) VALUES ($1, $2, $3) RETURNING *',
    [userId, 'My Board', 'my-board']
  );
  await pool.query('UPDATE tasks SET board_id = $1 WHERE user_id = $2 AND board_id IS NULL', [created[0].id, userId]);
  await pool.query('UPDATE categories SET board_id = $1 WHERE user_id = $2 AND board_id IS NULL', [created[0].id, userId]);
  // Migrate existing board_members rows
  await pool.query(
    'UPDATE board_members SET board_id = $1 WHERE board_owner_id = $2 AND board_id IS NULL',
    [created[0].id, userId]
  );
  await pool.query(
    'UPDATE invites SET board_id = $1 WHERE board_owner_id = $2 AND board_id IS NULL',
    [created[0].id, userId]
  );
  return created[0];
}

async function getBoardContext(req) {
  const boardId = req.query.board ? Number(req.query.board) : (req.body?.boardId ? Number(req.body.boardId) : null);
  if (!boardId) {
    const board = await ensureDefaultBoard(req.user.id);
    return { boardId: board.id, ownerId: req.user.id };
  }
  const { rows: owned } = await pool.query(
    'SELECT * FROM boards WHERE id = $1 AND owner_user_id = $2', [boardId, req.user.id]
  );
  if (owned[0]) return { boardId, ownerId: req.user.id };
  const { rows: member } = await pool.query(
    'SELECT b.* FROM boards b JOIN board_members bm ON bm.board_id = b.id WHERE b.id = $1 AND bm.member_user_id = $2',
    [boardId, req.user.id]
  );
  if (member[0]) return { boardId, ownerId: member[0].owner_user_id };
  throw Object.assign(new Error('Access denied'), { status: 403 });
}

/* ── User seeding ── */
const DEFAULT_CATEGORIES = [
  { name: 'Household', color: '#34A853' }, { name: 'Financial', color: '#FBBC05' },
  { name: 'Health', color: '#EA4335' },    { name: 'Learning', color: '#4285F4' },
  { name: 'Travel', color: '#8B5CF6' },    { name: 'Development', color: '#10B981' },
];

const ADJECTIVES = ['Fluffy','Bouncy','Sleepy','Sparkly','Dizzy','Fuzzy','Wiggly','Wobbly','Zippy','Bubbly','Giggly','Squishy','Crunchy','Goofy','Wacky','Zany','Loopy','Nutty','Snappy','Perky','Peppy','Clumsy','Grumpy','Jumpy','Funky','Chunky','Spunky','Quirky','Ditzy','Kooky','Daffy','Blobby','Noodly','Bonkers','Swirly','Twirly','Pudgy','Floppy','Droopy','Squirmy'];
const NOUNS = ['Penguin','Waffle','Noodle','Biscuit','Pickle','Muffin','Panda','Narwhal','Platypus','Hedgehog','Capybara','Quokka','Axolotl','Sloth','Lemur','Meerkat','Puffin','Wombat','Dumpling','Crumpet','Bagel','Pretzel','Donut','Brownie','Pudding','Sprinkle','Marshmallow','Jellybean','Cookie','Cupcake','Taco','Burrito','Blobfish','Salamander','Armadillo','Croissant','Scone','Churro','Macaron','Turnip'];

async function generateUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const base = `${adj}${noun}`;
  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [base]);
  if (!rows.length) return base;
  for (let i = 2; i <= 9999; i++) {
    const { rows: r } = await pool.query('SELECT id FROM users WHERE username = $1', [`${base}${i}`]);
    if (!r.length) return `${base}${i}`;
  }
  return `${base}${Date.now()}`;
}

async function seedCategories(userId, boardId) {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM categories WHERE user_id = $1', [userId]);
  if (Number(rows[0].c) === 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const c of DEFAULT_CATEGORIES) {
        await client.query('INSERT INTO categories (user_id, board_id, name, color) VALUES ($1, $2, $3, $4)', [userId, boardId, c.name, c.color]);
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }
}

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

/* ── Auth strategies ── */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
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
      if (!user && email) {
        // Link to existing email/password account rather than creating a duplicate.
        const emailResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (emailResult.rows[0]) {
          user = emailResult.rows[0];
          await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.id, user.id]);
          user.google_id = profile.id;
        }
      }
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
      const board = await ensureDefaultBoard(user.id);
      await seedCategories(user.id, board.id);
      return done(null, user);
    } catch (e) { return done(e); }
  }));
}

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL', [email]);
    const user = rows[0];
    if (!user) return done(null, false);
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false);
    return done(null, user);
  } catch (e) { return done(e); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, username, digest_frequency FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (user && !user.username) {
      const username = await generateUsername();
      await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, user.id]);
      user.username = username;
    }
    done(null, user || false);
  } catch (e) { done(e); }
});

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// iOS/Android clients cannot read Set-Cookie response headers — the native
// networking layer intercepts them before they reach JS.  We echo the signed
// session cookie in X-Session-Cookie so the mobile client can capture it and
// replay it on every subsequent request.
function setMobileSessionHeader(req, res) {
  if (!req.sessionID) return;
  const secret = process.env.SESSION_SECRET || 'dev-secret-change-me';
  const sig = cookieSignature.sign(req.sessionID, secret);
  res.setHeader('X-Session-Cookie', 'connect.sid=' + encodeURIComponent('s:' + sig));
}

/* ── Auth routes ── */
app.get('/auth/google', (req, res, next) => {
  if (req.query.remember) req.session.rememberMe = true;
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res, next) => {
  const remember = req.session.rememberMe;
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.passport = { user: req.user.id };
    if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
    req.session.save(err2 => { if (err2) return next(err2); res.redirect('/'); });
  });
});
app.get('/auth/logout', (req, res) => req.logout(() => res.redirect('/login')));

function wantsJson(req) {
  return req.is('application/json') || (req.get('accept') || '').includes('application/json');
}

// Mobile clients hit this with a Google ID token; we verify with Google's
// tokeninfo endpoint and start a session the same way /auth/google/callback does.
app.post('/auth/google/mobile', authLimiter, wrap(async (req, res) => {
  const idToken = req.body?.id_token;
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'id_token required' });
  }
  const allowedAuds = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter(Boolean);
  if (allowedAuds.length === 0) {
    return res.status(500).json({ error: 'Google client not configured' });
  }

  let payload;
  try {
    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!r.ok) throw new Error(`tokeninfo ${r.status}`);
    payload = await r.json();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid id_token' });
  }
  if (!allowedAuds.includes(payload.aud)) return res.status(401).json({ error: 'Audience mismatch' });
  if (payload.email_verified !== 'true' && payload.email_verified !== true) {
    return res.status(401).json({ error: 'Email not verified' });
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && Number(payload.exp) < now) return res.status(401).json({ error: 'Token expired' });

  const googleId = payload.sub;
  const email = payload.email || '';
  const name = payload.name || '';

  let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  let user = rows[0];
  if (!user && email) {
    // Link to existing email/password account rather than creating a duplicate.
    const emailResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (emailResult.rows[0]) {
      user = emailResult.rows[0];
      await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
      user.google_id = googleId;
    }
  }
  if (!user) {
    const username = await generateUsername();
    const result = await pool.query(
      'INSERT INTO users (google_id, email, name, username) VALUES ($1, $2, $3, $4) RETURNING *',
      [googleId, email, name, username]
    );
    user = result.rows[0];
  } else if (!user.username) {
    const username = await generateUsername();
    await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, user.id]);
    user.username = username;
  }
  const board = await ensureDefaultBoard(user.id);
  await seedCategories(user.id, board.id);

  req.session.regenerate(sesErr => {
    if (sesErr) return res.status(500).json({ error: 'Session error' });
    req.login(user, loginErr => {
      if (loginErr) return res.status(500).json({ error: 'Login error' });
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      setMobileSessionHeader(req, res);
      res.json({
        id: user.id, email: user.email, name: user.name,
        username: user.username, digest_frequency: user.digest_frequency,
      });
    });
  });
}));

app.get('/', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/signup', authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body;
  const json = wantsJson(req);
  const fail = (code, msg, status = 400) =>
    json ? res.status(status).json({ error: msg }) : res.redirect(`/login?error=${code}&mode=signup`);
  if (!email || !password) return fail('missing', 'Email and password required');
  if (typeof email !== 'string' || email.length > 254) return fail('missing', 'Invalid email');
  if (!isStrongPassword(password)) return fail('weak', 'Password must be 12+ characters with upper, lower, and a digit');
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return fail('taken', 'Email already in use', 409);

  const displayName = (req.body.name || '').trim() || email.split('@')[0];
  const requestedUsername = (req.body.username || '').trim();
  let username;
  if (requestedUsername && /^[a-zA-Z0-9_]{3,30}$/.test(requestedUsername)) {
    const taken = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [requestedUsername]);
    if (taken.rows[0]) return fail('username_taken', 'Username already taken', 409);
    username = requestedUsername;
  } else {
    username = await generateUsername();
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    'INSERT INTO users (google_id, email, name, password_hash, username) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [`local:${email}`, email, displayName, password_hash, username]
  );
  const newUser = rows[0];
  const board = await ensureDefaultBoard(newUser.id);
  await seedCategories(newUser.id, board.id);

  const inviteToken = (req.body.invite_token || '').trim();
  if (inviteToken) {
    const { rows: inv } = await pool.query(
      'SELECT * FROM invites WHERE token = $1 AND LOWER(invitee_email) = LOWER($2) AND used_at IS NULL',
      [inviteToken, email]
    );
    if (inv[0]) {
      const targetBoardId = inv[0].board_id || null;
      if (targetBoardId) {
        await pool.query(
          'INSERT INTO board_members (board_id, board_owner_id, member_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [targetBoardId, inv[0].inviter_user_id, newUser.id]
        );
      }
      await pool.query('UPDATE invites SET used_at = NOW() WHERE id = $1', [inv[0].id]);
      await pool.query(
        'INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1,$2,$3,$4)',
        [inv[0].inviter_user_id, 'invite_accepted', `@${username} accepted your board invitation`, newUser.id]
      );
    }
  }

  req.session.regenerate(sesErr => {
    if (sesErr) return fail('server', 'Session error', 500);
    req.login(newUser, err => {
      if (err) return fail('server', 'Login error', 500);
      if (json) {
        setMobileSessionHeader(req, res);
        return res.json({
          id: newUser.id, email: newUser.email, name: newUser.name,
          username: newUser.username, digest_frequency: newUser.digest_frequency,
        });
      }
      res.redirect('/');
    });
  });
}));

app.post('/auth/login', authLimiter, (req, res, next) => {
  passport.authenticate('local', (err, user) => {
    if (err) return next(err);
    const json = wantsJson(req);
    if (!user) {
      if (json) return res.status(401).json({ error: 'Invalid credentials' });
      return res.redirect('/login?error=invalid');
    }
    req.session.regenerate(sesErr => {
      if (sesErr) return next(sesErr);
      req.login(user, loginErr => {
        if (loginErr) return next(loginErr);
        if (req.body.remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        if (json) {
          setMobileSessionHeader(req, res);
          return res.json({
            id: user.id, email: user.email, name: user.name,
            username: user.username, digest_frequency: user.digest_frequency,
          });
        }
        res.redirect('/');
      });
    });
  })(req, res, next);
});

/* ── User ── */
app.get('/api/user', (req, res) => {
  if (!req.isAuthenticated()) return res.json(null);
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, username: req.user.username, digest_frequency: req.user.digest_frequency || 'none' });
});

app.put('/api/user/digest', requireAuth, wrap(async (req, res) => {
  const { frequency } = req.body;
  if (!['none', 'daily', 'weekly', 'fortnightly'].includes(frequency)) return res.status(400).json({ error: 'Invalid frequency' });
  await pool.query('UPDATE users SET digest_frequency = $1 WHERE id = $2', [frequency, req.user.id]);
  res.json({ ok: true });
}));

app.get('/api/check-username', usernameLimiter, async (req, res) => {
  const { username } = req.query;
  if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.json({ available: false });
  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  res.json({ available: !rows.length });
});

/* ── Boards CRUD ── */
app.use('/api/', apiLimiter);

/* ── CSRF protection ──
   Blocks cross-site state-changing requests by requiring either a same-origin
   Origin header or a custom X-Requested-With header — browsers won't attach
   either to simple <form>-based CSRF attacks. SameSite=lax on the session
   cookie helps but doesn't cover top-level form POSTs. */
const appOrigin = (() => {
  try { return new URL(APP_URL).origin; } catch { return null; }
})();
function requireCsrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With')) return next();
  const origin = req.get('Origin');
  if (origin && appOrigin) {
    try { if (new URL(origin).origin === appOrigin) return next(); } catch {}
  }
  return res.status(403).json({ error: 'csrf_protection' });
}
app.use('/api/', requireCsrfProtection);

app.get('/api/boards', requireAuth, wrap(async (req, res) => {
  await ensureDefaultBoard(req.user.id);
  const { rows } = await pool.query(
    'SELECT * FROM boards WHERE owner_user_id = $1 ORDER BY id ASC', [req.user.id]
  );
  res.json(rows);
}));

app.post('/api/boards', requireAuth, wrap(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name too long' });
  const slug = await uniqueSlug(req.user.id, name.trim());
  const { rows } = await pool.query(
    'INSERT INTO boards (owner_user_id, name, slug) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, name.trim(), slug]
  );
  res.json(rows[0]);
}));

app.put('/api/boards/:id', requireAuth, wrap(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name too long' });
  const { rows } = await pool.query('SELECT * FROM boards WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const slug = await uniqueSlug(req.user.id, name.trim());
  const { rows: updated } = await pool.query(
    'UPDATE boards SET name = $1, slug = $2 WHERE id = $3 RETURNING *',
    [name.trim(), slug, rows[0].id]
  );
  res.json(updated[0]);
}));

app.delete('/api/boards/:id', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM boards WHERE id = $1 AND owner_user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  // Prevent deleting the only board
  const { rows: count } = await pool.query('SELECT COUNT(*) as c FROM boards WHERE owner_user_id = $1', [req.user.id]);
  if (Number(count[0].c) <= 1) return res.status(400).json({ error: 'Cannot delete your only board' });
  await pool.query('DELETE FROM boards WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

/* ── Board members ── */
app.get('/api/boards/memberships', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.*, u.name as owner_name, u.email as owner_email, u.username as owner_username
     FROM board_members bm JOIN boards b ON b.id = bm.board_id JOIN users u ON u.id = b.owner_user_id
     WHERE bm.member_user_id = $1 ORDER BY bm.created_at ASC`,
    [req.user.id]
  );
  res.json(rows);
}));

app.get('/api/boards/members', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.username FROM board_members bm
     JOIN users u ON u.id = bm.member_user_id WHERE bm.board_id = $1 ORDER BY bm.created_at ASC`,
    [boardId]
  );
  res.json(rows);
}));

app.post('/api/boards/invite', requireAuth, wrap(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { boardId } = await getBoardContext(req);

  // Look up by email OR username
  const isUsername = !email.includes('@');
  const { rows } = isUsername
    ? await pool.query('SELECT id, name, email, username FROM users WHERE LOWER(username) = LOWER($1)', [email])
    : await pool.query('SELECT id, name, email, username FROM users WHERE email = $1', [email]);
  const invitee = rows[0];

  if (invitee) {
    if (invitee.id === req.user.id) return res.status(400).json({ error: 'Cannot invite yourself' });
    await pool.query(
      'INSERT INTO board_members (board_id, board_owner_id, member_user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [boardId, req.user.id, invitee.id]
    );
    const boardName = (await pool.query('SELECT name FROM boards WHERE id = $1', [boardId])).rows[0]?.name || 'board';
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1,$2,$3,$4)',
      [invitee.id, 'board_invite', `${req.user.name || req.user.username} added you to their "${boardName}" board`, req.user.id]
    );
    return res.json({ joined: true, id: invitee.id, name: invitee.name, email: invitee.email, username: invitee.username });
  }

  if (isUsername) return res.status(404).json({ error: 'No user found with that username.' });

  // Create invite link
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query(
    'DELETE FROM invites WHERE invitee_email = $1 AND board_id = $2 AND used_at IS NULL', [email, boardId]
  );
  await pool.query(
    'INSERT INTO invites (token, inviter_user_id, invitee_email, board_id, board_owner_id) VALUES ($1,$2,$3,$4,$5)',
    [token, req.user.id, email, boardId, req.user.id]
  );
  const appUrl = process.env.APP_URL || `https://${req.get('host')}`;
  const inviteLink = `${appUrl}/login?invite=${token}&email=${encodeURIComponent(email)}`;
  const inviterName = req.user.name || req.user.username || req.user.email;
  const boardName = (await pool.query('SELECT name FROM boards WHERE id = $1', [boardId])).rows[0]?.name || 'board';

  const emailSent = await sendEmail({
    to: email, subject: `${inviterName} invited you to their Tasks board`,
    html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
      <h2 style="color:#0F172A;margin:0 0 8px;">${inviterName} invited you to Tasks</h2>
      <p style="color:#64748B;margin:0 0 24px;">You've been invited to collaborate on the <strong>${boardName}</strong> board.</p>
      <a href="${inviteLink}" style="background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Accept &amp; Create Account →</a>
      <p style="color:#94A3B8;font-size:0.75rem;margin-top:20px;">Or copy: <a href="${inviteLink}" style="color:#3B82F6;">${inviteLink}</a></p>
    </div>`
  });
  res.json({ pending: true, email, inviteLink, emailSent });
}));

app.delete('/api/boards/members/:userId', requireAuth, wrap(async (req, res) => {
  const { boardId, ownerId } = await getBoardContext(req);
  if (ownerId !== req.user.id) return res.status(403).json({ error: 'Only the board owner can remove members' });
  await pool.query('DELETE FROM board_members WHERE board_id = $1 AND member_user_id = $2', [boardId, req.params.userId]);
  res.json({ ok: true });
}));

app.get('/api/boards/invites', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query(
    'SELECT * FROM invites WHERE board_id = $1 AND used_at IS NULL ORDER BY created_at DESC', [boardId]
  );
  res.json(rows);
}));

app.delete('/api/boards/invites/:id', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  await pool.query('DELETE FROM invites WHERE id = $1 AND board_id = $2', [req.params.id, boardId]);
  res.json({ ok: true });
}));

app.get('/api/invite/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.invitee_email, b.name as board_name, u.name as inviter_name, u.username as inviter_username, u.email as inviter_email
     FROM invites i JOIN users u ON u.id = i.inviter_user_id LEFT JOIN boards b ON b.id = i.board_id
     WHERE i.token = $1 AND i.used_at IS NULL`,
    [req.params.token]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invalid or expired invite link' });
  const r = rows[0];
  res.json({ email: r.invitee_email, inviterName: r.inviter_name || r.inviter_username || r.inviter_email, boardName: r.board_name });
});

/* ── Notifications ── */
app.get('/api/notifications', requireAuth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.*, u.name as from_name, u.email as from_email, u.username as from_username
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
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query('SELECT * FROM categories WHERE board_id = $1 ORDER BY id ASC', [boardId]);
  res.json(rows);
}));

app.post('/api/categories', requireAuth, wrap(async (req, res) => {
  const { boardId, ownerId } = await getBoardContext(req);
  const { name, color = '#667eea' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name too long' });
  if (!/^#[0-9a-fA-F]{3,6}$/.test(color)) return res.status(400).json({ error: 'Invalid color' });
  const { rows } = await pool.query(
    'INSERT INTO categories (user_id, board_id, name, color) VALUES ($1, $2, $3, $4) RETURNING *',
    [ownerId, boardId, name, color]
  );
  res.json(rows[0]);
}));

app.delete('/api/categories/:id', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1 AND board_id = $2', [req.params.id, boardId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('UPDATE tasks SET category_id = NULL WHERE category_id = $1', [rows[0].id]);
  await pool.query('DELETE FROM categories WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

/* ── Tasks ── */
app.get('/api/tasks', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const showArchived = req.query.archived === 'true';
  const limit = showArchived ? Math.min(Number(req.query.limit) || 200, 500) : null;
  const offset = showArchived ? Math.max(Number(req.query.offset) || 0, 0) : 0;
  const limitClause = limit !== null ? `LIMIT ${limit} OFFSET ${offset}` : '';
  const { rows } = await pool.query(
    `SELECT t.*, u.name as assigned_to_name, u.email as assigned_to_email, u.username as assigned_to_username
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to_user_id
     WHERE t.board_id = $1 AND (t.archived = $2)
     ORDER BY t.position ASC, t.created_at ASC
     ${limitClause}`,
    [boardId, showArchived]
  );
  res.json(rows);
}));

app.get('/api/tasks/count', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const showArchived = req.query.archived === 'true';
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM tasks WHERE board_id = $1 AND archived = $2',
    [boardId, showArchived]
  );
  res.json({ count: rows[0].count });
}));

app.post('/api/tasks', requireAuth, wrap(async (req, res) => {
  const { boardId, ownerId } = await getBoardContext(req);
  const { text: rawText, status = '', owners = [], cal_start = '', cal_end = '',
    stage = 'backlog', category_id = null, due_date: explicitDue = '',
    priority = 'none', recurrence = '', subtasks = [], assigned_to_user_id = null } = req.body;
  if (!rawText) return res.status(400).json({ error: 'Text required' });
  if (rawText.length > 2000) return res.status(400).json({ error: 'Text too long' });

  let due_date = explicitDue, text = rawText;
  if (!explicitDue) {
    const parsed = chrono.parse(rawText);
    if (parsed.length > 0) {
      const parsedDate = parsed[0].date();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      // Never set a past due date from NL parsing unless the text explicitly says so
      if (parsedDate >= today) {
        due_date = parsedDate.toISOString().split('T')[0];
        const stripped = rawText.replace(parsed[0].text, '').trim().replace(/\s+/g, ' ');
        if (stripped.length > 0) text = stripped;
      }
    }
  }

  const maxResult = await pool.query('SELECT MAX(position) as m FROM tasks WHERE board_id = $1', [boardId]);
  const position = (maxResult.rows[0].m ?? -1) + 1;

  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, board_id, text, status, owners, cal_start, cal_end, position, stage,
       category_id, due_date, priority, recurrence, subtasks, assigned_to_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.user.id, boardId, text, status, JSON.stringify(owners), cal_start, cal_end, position,
     stage, category_id, due_date, priority, recurrence, JSON.stringify(subtasks), assigned_to_user_id]
  );
  const task = rows[0];

  if (assigned_to_user_id && assigned_to_user_id !== req.user.id) {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, task_id, from_user_id) VALUES ($1,$2,$3,$4,$5)',
      [assigned_to_user_id, 'task_assigned',
       `${req.user.name || req.user.username} assigned you: "${text.slice(0, 60)}"`, task.id, req.user.id]
    );
  }
  res.json(task);
}));

app.put('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND board_id = $2', [req.params.id, boardId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const task = rows[0];

  // Partial-update semantics: only fields present in the request body are
  // written. Previously the destructure-with-defaults pattern overwrote any
  // omitted field with its default ('', null, [], 'none', etc.), so an iOS
  // toggleDone sending {stage} silently cleared recurrence, priority,
  // category, owners, subtasks, etc.
  const body = req.body;
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const sets = [];
  const vals = [];
  const set = (col, val) => { sets.push(`${col} = $${sets.length + 1}`); vals.push(val); };
  const setKeep = (col, val) => { sets.push(`${col} = COALESCE($${sets.length + 1}, ${col})`); vals.push(val); };

  if (has('text'))                 setKeep('text', body.text || null);
  if (has('stage'))                setKeep('stage', body.stage || null);
  if (has('status'))               set('status', body.status);
  if (has('owners'))               set('owners', JSON.stringify(body.owners));
  if (has('cal_start'))            set('cal_start', body.cal_start);
  if (has('cal_end'))              set('cal_end', body.cal_end);
  if (has('category_id'))          set('category_id', body.category_id);
  if (has('due_date'))             set('due_date', body.due_date);
  if (has('priority'))             set('priority', body.priority);
  if (has('recurrence'))           set('recurrence', body.recurrence);
  if (has('subtasks'))             set('subtasks', JSON.stringify(body.subtasks));
  if (has('assigned_to_user_id'))  set('assigned_to_user_id', body.assigned_to_user_id);

  if (has('archived')) {
    const archiveVal = body.archived === true ? true : body.archived === false ? false : task.archived;
    const archiveAt = body.archived === true && !task.archived_at ? new Date() : task.archived_at;
    set('archived', archiveVal);
    set('archived_at', archiveAt);
  }

  // completed_at is derived from the stage transition.
  if (has('stage')) {
    const newStage = body.stage || task.stage;
    const completedAt = newStage === 'done' && task.stage !== 'done' ? new Date()
      : newStage !== 'done' && task.stage === 'done' ? null
      : task.completed_at;
    set('completed_at', completedAt);
  }

  if (has('assigned_to_user_id') && body.assigned_to_user_id
      && body.assigned_to_user_id !== task.assigned_to_user_id
      && body.assigned_to_user_id !== req.user.id) {
    const notifText = (body.text || task.text).slice(0, 60);
    await pool.query(
      'INSERT INTO notifications (user_id, type, message, task_id, from_user_id) VALUES ($1,$2,$3,$4,$5)',
      [body.assigned_to_user_id, 'task_assigned',
       `${req.user.name || req.user.username} assigned you: "${notifText}"`, task.id, req.user.id]
    );
  }

  if (sets.length > 0) {
    vals.push(task.id);
    await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  }
  res.json({ ok: true });
}));

app.delete('/api/tasks/:id', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND board_id = $2', [req.params.id, boardId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await pool.query('DELETE FROM tasks WHERE id = $1', [rows[0].id]);
  res.json({ ok: true });
}));

app.post('/api/reorder', requireAuth, wrap(async (req, res) => {
  const { boardId } = await getBoardContext(req);
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [idx, id] of order.entries()) {
      await client.query('UPDATE tasks SET position = $1 WHERE id = $2 AND board_id = $3', [idx, id, boardId]);
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

app.post('/api/tasks/:id/share', requireAuth, wrap(async (req, res) => {
  const { recipient_user_id } = req.body;
  if (!recipient_user_id) return res.status(400).json({ error: 'Recipient required' });
  const { rows: recipientCheck } = await pool.query('SELECT id FROM users WHERE id = $1', [recipient_user_id]);
  if (!recipientCheck[0]) return res.status(404).json({ error: 'Recipient user not found' });
  const { boardId } = await getBoardContext(req);
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1 AND board_id = $2', [req.params.id, boardId]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const t = rows[0];
  const recipientBoard = await ensureDefaultBoard(recipient_user_id);
  const maxPos = await pool.query('SELECT MAX(position) as m FROM tasks WHERE board_id = $1', [recipientBoard.id]);
  const position = (maxPos.rows[0].m ?? -1) + 1;
  await pool.query(
    `INSERT INTO tasks (user_id, board_id, text, status, owners, cal_start, cal_end, position, stage, due_date, priority, recurrence, subtasks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'backlog',$9,$10,$11,$12)`,
    [recipient_user_id, recipientBoard.id, t.text, t.status, JSON.stringify(t.owners ?? []), t.cal_start, t.cal_end, position, t.due_date, t.priority, t.recurrence, JSON.stringify(t.subtasks ?? [])]
  );
  const sharer = req.user.name || req.user.username || req.user.email;
  await pool.query(
    'INSERT INTO notifications (user_id, type, message, from_user_id) VALUES ($1,$2,$3,$4)',
    [recipient_user_id, 'task_shared', `${sharer} shared a task with you: "${t.text.slice(0, 60)}"`, req.user.id]
  );
  res.json({ ok: true });
}));

/* ── Backup admin (protected by RESTORE_SECRET env var) ── */
function requireSecret(req, res, next) {
  const secret = process.env.RESTORE_SECRET;
  if (!secret) return res.status(503).json({ error: 'RESTORE_SECRET not configured' });
  const provided = req.headers['x-restore-secret'] || req.query.secret;
  if (provided !== secret) return res.status(401).json({ error: 'Invalid secret' });
  next();
}

app.get('/api/admin/backups', requireSecret, wrap(async (req, res) => {
  const snapshots = await listSnapshots();
  res.json(snapshots);
}));

app.post('/api/admin/backup', requireSecret, wrap(async (req, res) => {
  await runBackup(pool);
  const snapshots = await listSnapshots();
  res.json({ ok: true, latest: snapshots[0] });
}));

app.post('/api/admin/restore/:snapshotId', requireSecret, wrap(async (req, res) => {
  const result = await restoreFromSnapshot(pool, req.params.snapshotId);
  res.json({ ok: true, restored: result });
}));

/* ── Data export (backup) ── */
app.get('/api/export', requireAuth, wrap(async (req, res) => {
  const { rows: boards } = await pool.query('SELECT * FROM boards WHERE owner_user_id = $1', [req.user.id]);
  const { rows: tasks } = await pool.query(
    `SELECT t.* FROM tasks t JOIN boards b ON b.id = t.board_id WHERE b.owner_user_id = $1`, [req.user.id]
  );
  const { rows: categories } = await pool.query(
    `SELECT c.* FROM categories c JOIN boards b ON b.id = c.board_id WHERE b.owner_user_id = $1`, [req.user.id]
  );
  const filename = `tasks-backup-${new Date().toISOString().split('T')[0]}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json({ exportedAt: new Date().toISOString(), boards, tasks, categories });
}));

/* ── Data import (restore) ── */
app.post('/api/import', requireAuth, wrap(async (req, res) => {
  const { tasks: importTasks = [], categories: importCategories = [] } = req.body;
  if (!Array.isArray(importTasks)) return res.status(400).json({ error: 'Invalid data' });
  const board = await ensureDefaultBoard(req.user.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const catMap = {};
    for (const c of importCategories) {
      if (!c.name) continue;
      const color = /^#[0-9a-fA-F]{3,6}$/.test(c.color) ? c.color : '#667eea';
      const { rows } = await client.query(
        'INSERT INTO categories (user_id, board_id, name, color) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
        [req.user.id, board.id, String(c.name).slice(0, 100), color]
      );
      if (rows[0]) catMap[c.id] = rows[0].id;
    }
    const maxPos = await client.query('SELECT MAX(position) as m FROM tasks WHERE board_id = $1', [board.id]);
    let pos = (maxPos.rows[0].m ?? -1) + 1;
    for (const t of importTasks) {
      if (!t.text) continue;
      const text = String(t.text).slice(0, 2000);
      const catId = t.category_id && catMap[t.category_id] ? catMap[t.category_id] : null;
      await client.query(
        `INSERT INTO tasks (user_id, board_id, text, status, owners, cal_start, cal_end, position, stage, due_date, priority, recurrence, subtasks, category_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [req.user.id, board.id, text, t.status || '', JSON.stringify(t.owners || []),
         t.cal_start || '', t.cal_end || '', pos++, t.stage || 'backlog',
         t.due_date || '', t.priority || 'none', t.recurrence || '', JSON.stringify(t.subtasks || []), catId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true });
}));

/* ── Dashboard ── */
app.get('/api/dashboard', requireAuth, wrap(async (req, res) => {
  const { rows: boardRows } = await pool.query(
    `SELECT id FROM boards WHERE owner_user_id = $1
     UNION SELECT board_id FROM board_members WHERE member_user_id = $1`,
    [req.user.id]
  );
  const boardIds = boardRows.map(r => r.id);
  if (!boardIds.length) return res.json({ stats: {}, trend: [], priorities: [], categories: [] });

  const [statsRes, trendRes, priorityRes, categoryRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE stage != 'done' AND (archived IS NULL OR archived = false)) AS open,
        COUNT(*) FILTER (WHERE stage = 'in_progress' AND (archived IS NULL OR archived = false)) AS in_progress,
        COUNT(*) FILTER (WHERE stage = 'done' AND (archived IS NULL OR archived = false)) AS done_total,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND stage != 'done' AND (archived IS NULL OR archived = false)) AS overdue,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= NOW() - INTERVAL '7 days') AS completed_week,
        COUNT(*) FILTER (WHERE archived = true) AS archived_count
      FROM tasks WHERE board_id = ANY($1)
    `, [boardIds]),
    pool.query(`
      SELECT DATE(completed_at) AS day, COUNT(*) AS count
      FROM tasks WHERE board_id = ANY($1)
        AND completed_at IS NOT NULL AND completed_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(completed_at) ORDER BY day
    `, [boardIds]),
    pool.query(`
      SELECT priority, COUNT(*) AS count FROM tasks
      WHERE board_id = ANY($1) AND (archived IS NULL OR archived = false) AND stage != 'done'
      GROUP BY priority ORDER BY count DESC
    `, [boardIds]),
    pool.query(`
      SELECT c.name, c.color, COUNT(t.id) AS count FROM tasks t
      JOIN categories c ON c.id = t.category_id
      WHERE t.board_id = ANY($1) AND (t.archived IS NULL OR t.archived = false) AND t.stage != 'done'
      GROUP BY c.id, c.name, c.color ORDER BY count DESC LIMIT 6
    `, [boardIds]),
  ]);
  const s = statsRes.rows[0];
  res.json({
    // Legacy web format (stats/priorities/categories) kept for compatibility.
    stats: s,
    priorities: priorityRes.rows,
    categories: categoryRes.rows,
    // Mobile-friendly format matching the iOS DashboardData type.
    counts: {
      open: parseInt(s.open) || 0,
      inProgress: parseInt(s.in_progress) || 0,
      overdue: parseInt(s.overdue) || 0,
    },
    trend: trendRes.rows.map(r => ({
      date: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      completed: parseInt(r.count) || 0,
    })),
    byPriority: {
      high:   parseInt(priorityRes.rows.find(r => r.priority === 'high')?.count)   || 0,
      medium: parseInt(priorityRes.rows.find(r => r.priority === 'medium')?.count) || 0,
      low:    parseInt(priorityRes.rows.find(r => r.priority === 'low')?.count)    || 0,
      none:   parseInt(priorityRes.rows.find(r => r.priority === 'none')?.count)   || 0,
    },
    byCategory: categoryRes.rows.map(r => ({
      name: r.name, color: r.color, count: parseInt(r.count) || 0,
    })),
  });
}));

/* ── Global search ── */
app.get('/api/search', requireAuth, searchLimiter, wrap(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const { rows } = await pool.query(`
    SELECT t.id, t.text, t.stage, t.due_date, t.priority, t.board_id,
           b.name AS board_name, b.owner_user_id AS board_owner_id,
           c.name AS cat_name, c.color AS cat_color
    FROM tasks t
    JOIN boards b ON b.id = t.board_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE (b.owner_user_id = $1 OR EXISTS (
      SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.member_user_id = $1
    ))
    AND (t.archived IS NULL OR t.archived = false)
    AND (LOWER(t.text) LIKE LOWER($2) OR LOWER(COALESCE(t.status,'')) LIKE LOWER($2))
    ORDER BY t.created_at DESC LIMIT 20
  `, [req.user.id, `%${q}%`]);
  res.json(rows);
}));

/* ── User search (for assign/share) ── */
app.get('/api/users/search', requireAuth, searchLimiter, wrap(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const { rows } = await pool.query(
    `SELECT id, name, email, username FROM users
     WHERE (LOWER(username) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1) OR LOWER(name) LIKE LOWER($1))
     AND id != $2 LIMIT 8`,
    [`%${q}%`, req.user.id]
  );
  res.json(rows);
}));

app.use((err, req, res, next) => {
  console.error(`[${req.id}] ${req.method} ${req.path}`, err);
  const status = err.status || 500;
  const message = status < 500 ? (err.message || 'Bad request') : 'Internal server error';
  res.status(status).json({ error: message, requestId: req.id });
});

/* ── Email digest ── */
function buildDigestEmail(user, tasks, date) {
  const today = date.toISOString().split('T')[0];
  const overdue = tasks.filter(t => t.due_date && t.due_date < today);
  const dueToday = tasks.filter(t => t.due_date === today);
  const other = tasks.filter(t => !t.due_date || (t.due_date > today));

  const row = t => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#0F172A;font-size:0.88rem;">${escapeHtml(t.text.slice(0, 80))}</td>
    <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:0.8rem;white-space:nowrap;padding-left:12px;">${escapeHtml(t.due_date || '—')}</td>
    <td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#64748B;font-size:0.8rem;padding-left:12px;">${escapeHtml(String(t.stage || '').replace('_', ' '))}</td>
  </tr>`;

  const section = (title, color, items) => !items.length ? '' : `
    <p style="color:${color};font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px 0;">${title} (${items.length})</p>
    <table style="width:100%;border-collapse:collapse;">${items.slice(0, 25).map(row).join('')}</table>`;

  return `<div style="font-family:Inter,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;">
    <h2 style="color:#0F172A;margin:0 0 4px;font-size:1.2rem;">Your task summary</h2>
    <p style="color:#64748B;margin:0 0 20px;font-size:0.88rem;">${date.toLocaleDateString('en', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
    ${section('⚠️ Overdue', '#EF4444', overdue)}
    ${section('📅 Due today', '#F59E0B', dueToday)}
    ${section('📋 Open tasks', '#3B82F6', other)}
    <p style="color:#94A3B8;font-size:0.75rem;margin-top:24px;border-top:1px solid #E2E8F0;padding-top:16px;">
      You're receiving this as your ${escapeHtml(user.digest_frequency)} digest.
      <a href="${escapeHtml(APP_URL)}" style="color:#3B82F6;">View your board →</a>
    </p>
  </div>`;
}

async function runDigests() {
  try {
    const now = new Date();
    // One query joins each digest-enabled user to their oldest board and their
    // top 50 open tasks, eliminating the previous per-user N+1.
    const { rows } = await pool.query(`
      WITH user_boards AS (
        SELECT DISTINCT ON (u.id)
          u.id AS user_id, u.email, u.name, u.username,
          u.digest_frequency, u.digest_last_sent,
          b.id AS board_id
        FROM users u
        JOIN boards b ON b.owner_user_id = u.id
        WHERE u.digest_frequency != 'none' AND u.email IS NOT NULL
        ORDER BY u.id, b.id ASC
      ),
      eligible AS (
        SELECT * FROM user_boards
        WHERE digest_last_sent IS NULL
           OR (digest_frequency = 'daily' AND digest_last_sent < NOW() - INTERVAL '23 hours')
           OR (digest_frequency = 'weekly' AND digest_last_sent < NOW() - INTERVAL '167 hours')
           OR (digest_frequency = 'fortnightly' AND digest_last_sent < NOW() - INTERVAL '335 hours')
      )
      SELECT e.user_id, e.email, e.name, e.username, e.digest_frequency, e.board_id,
             t.text, t.stage, t.due_date, t.priority
      FROM eligible e
      LEFT JOIN LATERAL (
        SELECT text, stage, due_date, priority FROM tasks
        WHERE board_id = e.board_id
          AND (archived IS NULL OR archived = false)
          AND stage != 'done'
        ORDER BY due_date ASC NULLS LAST
        LIMIT 50
      ) t ON true
    `);

    const byUser = new Map();
    for (const r of rows) {
      let entry = byUser.get(r.user_id);
      if (!entry) {
        entry = { user: { id: r.user_id, email: r.email, name: r.name, username: r.username, digest_frequency: r.digest_frequency }, tasks: [] };
        byUser.set(r.user_id, entry);
      }
      if (r.text) entry.tasks.push({ text: r.text, stage: r.stage, due_date: r.due_date, priority: r.priority });
    }

    for (const { user, tasks } of byUser.values()) {
      if (!tasks.length) continue;
      const sent = await sendEmail({
        to: user.email,
        subject: `Your task summary — ${now.toLocaleDateString('en', { weekday:'long', month:'short', day:'numeric' })}`,
        html: buildDigestEmail(user, tasks, now),
      });
      if (sent) await pool.query('UPDATE users SET digest_last_sent = $1 WHERE id = $2', [now, user.id]);
    }
  } catch (e) { console.error('Digest error:', e.message); }
}

/* ── Auto-archive ── */
const AUTO_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;

// Archive any task that has been in stage='done' for more than AUTO_ARCHIVE_AFTER_MS.
// We key off completed_at (set when stage flips to 'done', cleared when it flips
// back) so re-opening a task naturally cancels the timer. Already-archived rows
// are excluded so we don't churn archived_at on repeated runs.
async function runAutoArchive() {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - AUTO_ARCHIVE_AFTER_MS);
    const { rowCount } = await pool.query(
      `UPDATE tasks
         SET archived = true, archived_at = $1
       WHERE stage = 'done'
         AND (archived IS NULL OR archived = false)
         AND completed_at IS NOT NULL
         AND completed_at < $2`,
      [now, cutoff]
    );
    if (rowCount) console.log(`Auto-archive: archived ${rowCount} completed task(s)`);
  } catch (e) { console.error('Auto-archive error:', e.message); }
}

async function cleanupOldNotifications() {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'"
    );
    if (rowCount) console.log(`Cleanup: pruned ${rowCount} old notifications`);
  } catch (e) { console.error('Notification cleanup error:', e.message); }
}

module.exports = { app, runDigests, runAutoArchive, cleanupOldNotifications, escapeHtml, isStrongPassword };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  init()
    .then(async () => {
      await initBackup();
      // Boot-time backup is best-effort and racey across instances; the daily
      // schedule below is the authoritative one (advisory-locked).
      await withLeaderLock(pool, 73810420, () => runBackup(pool)).catch(() => {});
      scheduleDailyBackup(pool);

      // Hourly digest + daily notification cleanup, both guarded by advisory
      // locks so they run on exactly one instance in horizontally scaled deploys.
      cron.schedule('0 * * * *', () =>
        withLeaderLock(pool, LOCK_KEY_DIGEST, runDigests).catch(e => console.error('Digest lock error:', e.message))
      );
      cron.schedule('0 3 * * *', () =>
        withLeaderLock(pool, 73810423, cleanupOldNotifications).catch(e => console.error('Cleanup lock error:', e.message))
      );
      cron.schedule('0 4 * * *', () =>
        withLeaderLock(pool, LOCK_KEY_AUTO_ARCHIVE, runAutoArchive).catch(e => console.error('Auto-archive lock error:', e.message))
      );

      const server = app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));

      const shutdown = signal => {
        console.log(`${signal} received — shutting down…`);
        server.close(async () => {
          try { await pool.end(); } catch {}
          try { await closeBackupPool(); } catch {}
          process.exit(0);
        });
        setTimeout(() => process.exit(1), 10_000).unref();
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}
