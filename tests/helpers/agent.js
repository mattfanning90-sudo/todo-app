import request from 'supertest';
import { app } from '../../server.js';

// The server's CSRF middleware (server.js) requires either a matching
// Origin header or an X-Requested-With header on /api/* state-changing
// requests. Supertest doesn't send Origin, so we patch the agent's
// state-changing methods to auto-set X-Requested-With.
function withCsrfHeader(agent) {
  ['post', 'put', 'patch', 'delete'].forEach((method) => {
    const original = agent[method].bind(agent);
    agent[method] = (...args) => original(...args).set('X-Requested-With', 'supertest');
  });
  return agent;
}

// Build a supertest agent already signed in as a fresh user.
export async function signupAndAgent({ email = 'alice@example.com', password = 'Sup3rSecretPass', username = 'alice' } = {}) {
  const agent = withCsrfHeader(request.agent(app));
  const res = await agent
    .post('/auth/signup')
    .type('form')
    .send({ email, password, name: 'Alice', username });
  if (res.status !== 302 || res.headers.location !== '/') {
    throw new Error(`signup failed: ${res.status} → ${res.headers.location} body=${JSON.stringify(res.body)}`);
  }
  return agent;
}
