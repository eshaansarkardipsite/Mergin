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
  signUpWithSupabasePassword,
  supabaseAuthorizeUrl,
  supabaseProfile,
} from '../services/identity';
import {
  PasskeyError,
  createPasskeyAuthenticateOptions,
  createPasskeyRegisterOptions,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from '../services/passkey';

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

const signupSchema = z.object({
  email: z.string().trim().email().min(3),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120).optional(),
});

authRouter.post(
  '/signup',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(signupSchema, req, res);
    if (!input) return;

    if (supabaseConfigured()) {
      try {
        const session = await signUpWithSupabasePassword(input.email, input.password, input.name);
        const user = provisionLocalUser(supabaseProfile(session.user));
        setSessionCookie(res, user.id);
        res.json({ user });
      } catch (error) {
        if (!(error instanceof AuthError)) console.error('[mergin-auth] sign-up failed:', error);
        res.status(error instanceof AuthError ? error.status : 500).json({
          error: error instanceof AuthError ? error.message : 'Sign-up failed. Try again.',
        });
      }
      return;
    }

    res.status(503).json({ error: 'Self-service sign-up requires Supabase to be configured.' });
  }),
);

const resetSchema = z.object({
  email: z.string().trim().email().min(3),
});

authRouter.post(
  '/reset-password',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(resetSchema, req, res);
    if (!input) return;

    if (!supabaseConfigured()) {
      res.status(503).json({ error: 'Password reset requires Supabase to be configured.' });
      return;
    }

    // Only known self-service accounts get a recovery mail; the reply stays generic either way
    // so the endpoint cannot be used to enumerate registered emails.
    const account = findUserByEmail(input.email);
    if (!account || account.demo) {
      res.json({ ok: true, message: 'If an account exists, a reset link was sent to your email.' });
      return;
    }

    try {
      const response = await fetch(`${config.supabase.url}/auth/v1/recover`, {
        method: 'POST',
        headers: { apikey: config.supabase.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.email }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error_description?: string } | null;
        res.status(400).json({ error: data?.error_description || 'Password reset request failed.' });
        return;
      }
      res.json({ ok: true, message: 'If an account exists, a reset link was sent to your email.' });
    } catch (error) {
      console.error('[mergin-auth] reset-password failed:', error);
      res.status(500).json({ error: 'Password reset request failed. Try again.' });
    }
  }),
);

// ---------- passkey (WebAuthn) ----------

const passkeyStartSchema = z.object({ email: z.string().trim().email() });

authRouter.post(
  '/passkey/register/start',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(passkeyStartSchema, req, res);
    if (!input) return;
    try {
      const options = createPasskeyRegisterOptions(input.email);
      res.json(options);
    } catch (error) {
      if (!(error instanceof PasskeyError)) console.error('[mergin-auth] passkey register start failed:', error);
      res.status(error instanceof PasskeyError ? error.status : 500).json({
        error: error instanceof PasskeyError ? error.message : 'Passkey registration could not start.',
      });
    }
  }),
);

const passkeyRegisterSchema = z.object({
  challenge: z.string(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      attestationObject: z.string(),
      clientDataJSON: z.string(),
    }),
  }),
});

authRouter.post(
  '/passkey/register/finish',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(passkeyRegisterSchema, req, res);
    if (!input) return;
    try {
      const user = verifyPasskeyRegistration(input.challenge, input.credential);
      setSessionCookie(res, user.id);
      res.json({ user });
    } catch (error) {
      if (!(error instanceof PasskeyError)) console.error('[mergin-auth] passkey register finish failed:', error);
      res.status(error instanceof PasskeyError ? error.status : 500).json({
        error: error instanceof PasskeyError ? error.message : 'Passkey registration failed.',
      });
    }
  }),
);

authRouter.post(
  '/passkey/authenticate/start',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(passkeyStartSchema, req, res);
    if (!input) return;
    try {
      const options = createPasskeyAuthenticateOptions(input.email);
      res.json(options);
    } catch (error) {
      if (!(error instanceof PasskeyError)) console.error('[mergin-auth] passkey authenticate start failed:', error);
      res.status(error instanceof PasskeyError ? error.status : 500).json({
        error: error instanceof PasskeyError ? error.message : 'Passkey sign-in could not start.',
      });
    }
  }),
);

const passkeyAuthSchema = z.object({
  challenge: z.string(),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      authenticatorData: z.string(),
      clientDataJSON: z.string(),
      signature: z.string(),
    }),
  }),
});

authRouter.post(
  '/passkey/authenticate/finish',
  authLimiter,
  asyncRoute(async (req, res) => {
    const input = parseBody(passkeyAuthSchema, req, res);
    if (!input) return;
    try {
      const user = verifyPasskeyAuthentication(input.challenge, input.credential);
      setSessionCookie(res, user.id);
      res.json({ user });
    } catch (error) {
      if (!(error instanceof PasskeyError)) console.error('[mergin-auth] passkey authenticate finish failed:', error);
      res.status(error instanceof PasskeyError ? error.status : 500).json({
        error: error instanceof PasskeyError ? error.message : 'Passkey sign-in failed.',
      });
    }
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
