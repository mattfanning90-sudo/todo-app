import { describe, it, expect } from 'vitest';
import { signupAndAgent } from './helpers/agent.js';

// The Today quick-add wants two things at once: (a) a bare title should land
// on *today* so it shows up in the Today view, and (b) a natural-language date
// in the title ("dentist Thursday 2pm") should still be parsed — the same NL
// parsing the Board quick-add already gets for free. The `default_due: 'today'`
// flag expresses "default to today, but let NL parsing win if it finds a date".
describe('POST /api/tasks — default_due (Today quick-add NL parity)', () => {
  const today = () => new Date().toISOString().split('T')[0];

  it('defaults a bare title to today when default_due=today', async () => {
    const agent = await signupAndAgent();
    const res = await agent.post('/api/tasks').send({ text: 'buy milk', default_due: 'today' });
    expect(res.status).toBe(200);
    expect(res.body.due_date).toBe(today());
    expect(res.body.text).toBe('buy milk');
  });

  it('lets a natural-language date win over the today default', async () => {
    const agent = await signupAndAgent();
    const res = await agent.post('/api/tasks').send({ text: 'dentist next Thursday', default_due: 'today' });
    expect(res.status).toBe(200);
    expect(res.body.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.due_date).not.toBe(today()); // a future Thursday, not today
    expect(res.body.text).toBe('dentist');       // NL phrase stripped from the title
  });

  it('still honours an explicit due_date over default_due', async () => {
    const agent = await signupAndAgent();
    const res = await agent
      .post('/api/tasks')
      .send({ text: 'pay rent', due_date: '2026-07-01', default_due: 'today' });
    expect(res.status).toBe(200);
    expect(res.body.due_date).toBe('2026-07-01');
    expect(res.body.text).toBe('pay rent');
  });

  it('leaves due_date empty when neither default_due nor a date is given (Board behaviour unchanged)', async () => {
    const agent = await signupAndAgent();
    const res = await agent.post('/api/tasks').send({ text: 'someday maybe', stage: 'backlog' });
    expect(res.status).toBe(200);
    expect(res.body.due_date).toBe('');
  });
});
