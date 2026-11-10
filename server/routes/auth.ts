import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import {
  clearOAuthCookie,
  clearSessionCookie,
  getSession,
  readOAuthCookie,
  safeEqual,
  setOAuthCookie,
  setSessionCookie,
} from '../auth';
import { config, googleAuthConfigured, paypalConfigured, supabaseConfigured } from '../config';
import { findUserByEmail, getSessionUser } from '../db/repo';
import { DEMO_EMAIL, verifyPassword } from '../db/seed';
import { asyncRoute, parseBody } from '../http';
import { authLimiter } from '../security';
import {
  AuthError,
  createPkcePair,
  exchangePaypalCode,
  exchangeSupabaseCode,
  oauthCallbackUrl,
  paypalAuthorizeUrl,
  provisionLocalUser,
  randomState,
  signInWithSupabasePassword,
  supabaseAuthorizeUrl,
  supabaseProfile,
} from '../services/identity';

export const authRouter = Router();

function redirectToLogin(res: Response, message: string): void {
  res.redirect(`${config.appBaseUrl}/login?error=${encodeURIComponent(message)}`);
}

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

authRouter.get('/providers', (_req, res) => {
  res.json({
    supabase: supabaseConfigured(),
    password: supabaseConfigured(),
    google: googleAuthConfigured(),
    paypal: paypalConfigured(),
    demo: true,
  });
});

authRouter.get('/session', (req, res) => {
  const user = getSession(req);
  if (!user) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json({ user });
});

authRouter.post('/demo', authLimiter, (_req, res) => {
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

authRouter.post(
  '/login',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(loginSchema, req, res);
    if (!input) return;

    if (supabaseConfigured()) {
      try {
        const session = await signInWithSupabasePassword(input.email, input.password);
        const user = provisionLocalUser(supabaseProfile(session.user));
        setSessionCookie(res, user.id);
        res.json({ user });
      } catch (error) {
        if (!(error instanceof AuthError)) console.error('[mergin-auth] password sign-in failed:', error);
        res.status(error instanceof AuthError ? error.status : 500).json({
          error: error instanceof AuthError ? error.message : 'Sign-in failed. Try again.',
        });
      }
      return;
    }

    const user = findUserByEmail(input.email);
    if (!user || !verifyPassword(input.password, user.password_hash)) {
      res.status(401).json({ error: 'Email or password is incorrect. Use the demo workspace if you do not have seeded credentials.' });
      return;
    }
    setSessionCookie(res, user.id);
    res.json({ user: getSessionUser(user.id) });
  }),
);

authRouter.get('/google/start', (_req, res) => {
  if (!googleAuthConfigured()) {
    redirectToLogin(res, 'Google sign-in is not configured.');
    return;
  }
  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  setOAuthCookie(res, { provider: 'google', state, verifier });
  res.redirect(supabaseAuthorizeUrl(oauthCallbackUrl('google'), challenge));
});

authRouter.get(
  '/google/callback',
  asyncRoute(async (req, res) => {
    const oauth = readOAuthCookie(req);
    clearOAuthCookie(res);
    const code = queryString(req.query.code);
    if (!oauth || oauth.provider !== 'google' || !oauth.verifier || !code) {
      redirectToLogin(res, 'Google sign-in could not be completed. Please try again.');
      return;
    }
    try {
      const session = await exchangeSupabaseCode(code, oauth.verifier);
      const user = provisionLocalUser(supabaseProfile(session.user));
      setSessionCookie(res, user.id);
      res.redirect(`${config.appBaseUrl}/app`);
    } catch (error) {
      if (!(error instanceof AuthError)) console.error('[mergin-auth] Google callback failed:', error);
      redirectToLogin(res, error instanceof AuthError ? error.message : 'Google sign-in failed.');
    }
  }),
);

authRouter.get('/paypal/start', (_req, res) => {
  if (!paypalConfigured()) {
    redirectToLogin(res, 'PayPal sign-in is not configured.');
    return;
  }
  const state = randomState();
  setOAuthCookie(res, { provider: 'paypal', state });
  res.redirect(paypalAuthorizeUrl(oauthCallbackUrl('paypal'), state));
});

authRouter.get(
  '/paypal/callback',
  asyncRoute(async (req, res) => {
    const oauth = readOAuthCookie(req);
    clearOAuthCookie(res);
    const code = queryString(req.query.code);
    const state = queryString(req.query.state);
    if (queryString(req.query.error)) {
      redirectToLogin(res, queryString(req.query.error_description) || 'PayPal sign-in was cancelled.');
      return;
    }
    if (!oauth || oauth.provider !== 'paypal' || !code || !state || !safeEqual(oauth.state, state)) {
      redirectToLogin(res, 'PayPal sign-in could not be completed. Please try again.');
      return;
    }
    try {
      const user = provisionLocalUser(await exchangePaypalCode(code));
      setSessionCookie(res, user.id);
      res.redirect(`${config.appBaseUrl}/app`);
    } catch (error) {
      if (!(error instanceof AuthError)) console.error('[mergin-auth] PayPal callback failed:', error);
      redirectToLogin(res, error instanceof AuthError ? error.message : 'PayPal sign-in failed.');
    }
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  clearOAuthCookie(res);
  res.json({ ok: true });
});
