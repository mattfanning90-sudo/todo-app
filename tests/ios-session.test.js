import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

// Reproduces the iOS native-networking flow. NSURLSession swallows Set-Cookie
// before JS sees it, so the server echoes the signed session in X-Session-Cookie
// (server.js#setMobileSessionHeader). ios-app/src/api/client.ts stores that value
// and replays it as a plain `Cookie` header on every subsequent request — there
// is NO cookie jar. We use bare request(app) (not request.agent) so nothing
// persists cookies for us, faithfully matching the device.
//
// If the server-side mechanism is sound, GET /api/boards with the echoed cookie
// returns 200. If it 401s, the bug is server-side. If it 200s here, the bug is
// in the client/build/proxy, not the server.
describe('iOS X-Session-Cookie session replay', () => {
  it('signup echoes a usable X-Session-Cookie for a follow-up /api/boards', async () => {
    const signup = await request(app)
      .post('/auth/signup')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'ios-signup@example.com', password: 'StrongPass1234', name: 'iOS', username: 'iossignup' });

    expect(signup.status).toBe(200);
    const cookie = signup.headers['x-session-cookie'];
    expect(cookie, 'X-Session-Cookie header should be present on signup').toBeTruthy();
    expect(cookie).toMatch(/connect\.sid=/);

    const boards = await request(app)
      .get('/api/boards')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', cookie);

    expect(boards.status, 'replayed cookie should authenticate /api/boards').toBe(200);
    expect(Array.isArray(boards.body)).toBe(true);
    expect(boards.body.length).toBeGreaterThan(0); // ensureDefaultBoard guarantees ≥1
  });

  it('login echoes a usable X-Session-Cookie for a follow-up /api/boards', async () => {
    // Create the account first (form signup, no session needed).
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'ios-login@example.com', password: 'StrongPass1234', name: 'iOS', username: 'ioslogin' });

    const login = await request(app)
      .post('/auth/login')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'ios-login@example.com', password: 'StrongPass1234' });

    expect(login.status).toBe(200);
    const cookie = login.headers['x-session-cookie'];
    expect(cookie, 'X-Session-Cookie header should be present on login').toBeTruthy();

    const boards = await request(app)
      .get('/api/boards')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', cookie);

    expect(boards.status, 'replayed cookie should authenticate /api/boards').toBe(200);
    expect(Array.isArray(boards.body)).toBe(true);
  });
});

// The robust fix: the session token must also be carried in the JSON body, so
// the client never depends on reading a response header that iOS native
// networking can swallow in a standalone build. The body is always readable by
// fetch, so capturing from it is reliable on-device.
describe('auth JSON body carries a header-independent session token', () => {
  it('signup body includes mobileSession that authenticates /api/boards', async () => {
    const signup = await request(app)
      .post('/auth/signup')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'ios-body-signup@example.com', password: 'StrongPass1234', name: 'iOS', username: 'iosbodysignup' });

    expect(signup.status).toBe(200);
    expect(signup.body.mobileSession, 'signup body should include a mobileSession token').toMatch(/connect\.sid=/);

    const boards = await request(app)
      .get('/api/boards')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', signup.body.mobileSession);

    expect(boards.status, 'body token should authenticate /api/boards').toBe(200);
    expect(Array.isArray(boards.body)).toBe(true);
  });

  it('login body includes mobileSession that authenticates /api/boards', async () => {
    await request(app)
      .post('/auth/signup')
      .type('form')
      .send({ email: 'ios-body-login@example.com', password: 'StrongPass1234', name: 'iOS', username: 'iosbodylogin' });

    const login = await request(app)
      .post('/auth/login')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'ios-body-login@example.com', password: 'StrongPass1234' });

    expect(login.status).toBe(200);
    expect(login.body.mobileSession, 'login body should include a mobileSession token').toMatch(/connect\.sid=/);

    const boards = await request(app)
      .get('/api/boards')
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', login.body.mobileSession);

    expect(boards.status, 'body token should authenticate /api/boards').toBe(200);
    expect(Array.isArray(boards.body)).toBe(true);
  });
});
