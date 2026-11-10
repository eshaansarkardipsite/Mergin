import { Router } from 'express';
import { z } from 'zod';
import { clearSessionCookie, getSession, setSessionCookie } from '../auth';
import { findUserByEmail, getSessionUser } from '../db/repo';
import { DEMO_EMAIL, verifyPassword } from '../db/seed';
import { parseBody } from '../http';

export const authRouter = Router();

authRouter.get('/session', (req, res) => {
  const user = getSession(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json({ user });
});

authRouter.post('/demo', (_req, res) => {
  const demoUser = findUserByEmail(DEMO_EMAIL);
  if (!demoUser) {
    res.status(503).json({ error: 'Demo workspace is not seeded. Run npm run db:reset.' });
    return;
  }
  setSessionCookie(res, demoUser.id);
  res.json({ user: getSessionUser(demoUser.id) });
});

const loginSchema = z.object({
  email: z.string().trim().min(3),
  password: z.string().min(1),
});

authRouter.post('/login', (req, res) => {
  const input = parseBody(loginSchema, req, res);
  if (!input) return;
  const user = findUserByEmail(input.email);
  if (!user || !verifyPassword(input.password, user.password_hash)) {
    res.status(401).json({ error: 'Email or password is incorrect. Use the demo workspace if you do not have seeded credentials.' });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({ user: getSessionUser(user.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
