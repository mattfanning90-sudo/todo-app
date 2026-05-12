import request from 'supertest';
import { app } from '../../server.js';

// Build a supertest agent already signed in as a fresh user.
export async function signupAndAgent({ email = 'alice@example.com', password = 'Sup3rSecretPass', username = 'alice' } = {}) {
  const agent = request.agent(app);
  const res = await agent
    .post('/auth/signup')
    .type('form')
    .send({ email, password, name: 'Alice', username });
  if (res.status !== 302 || res.headers.location !== '/') {
    throw new Error(`signup failed: ${res.status} → ${res.headers.location} body=${JSON.stringify(res.body)}`);
  }
  return agent;
}
