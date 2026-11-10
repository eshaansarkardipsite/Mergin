import crypto from 'node:crypto';
import { config, paypalApiBase, paypalConfigured, supabaseConfigured } from '../config';
import {
  createUserForIdentity,
  findUserByEmail,
  findUserByIdentity,
  getSessionUser,
  linkUserIdentity,
} from '../db/repo';
import type { IdentityProfile } from '../db/repo';
import type { SessionUser } from '../../shared/types';

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  user: SupabaseUser;
}

async function supabaseRequest(path: string, body: unknown): Promise<SupabaseTokenResponse> {
  if (!supabaseConfigured()) throw new AuthError('Supabase is not configured.', 503);
  const response = await fetch(`${config.supabase.url}/auth/v1${path}`, {
    method: 'POST',
    headers: { apikey: config.supabase.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => null)) as (SupabaseTokenResponse & {
    error_description?: string;
    msg?: string;
  }) | null;
  if (!response.ok) {
    throw new AuthError(
      data?.error_description || data?.msg || 'Authentication failed.',
      response.status === 400 ? 401 : response.status,
    );
  }
  return data as SupabaseTokenResponse;
}

export function signInWithSupabasePassword(email: string, password: string): Promise<SupabaseTokenResponse> {
  return supabaseRequest('/token?grant_type=password', { email, password });
}

export function exchangeSupabaseCode(code: string, verifier: string): Promise<SupabaseTokenResponse> {
  return supabaseRequest('/token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  return {
    verifier,
    challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function randomState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function supabaseAuthorizeUrl(redirectTo: string, challenge: string): string {
  const url = new URL(`${config.supabase.url}/auth/v1/authorize`);
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', redirectTo);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 's256');
  return url.toString();
}

export function paypalAuthorizeUrl(redirectTo: string, state: string): string {
  const base = config.paypal.environment === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';
  const url = new URL(`${base}/connect/`);
  url.searchParams.set('flowEntry', 'static');
  url.searchParams.set('client_id', config.paypal.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('redirect_uri', redirectTo);
  url.searchParams.set('state', state);
  return url.toString();
}

/** PayPal "Log in with PayPal" code exchange, followed by the OIDC userinfo call. */
export async function exchangePaypalCode(code: string): Promise<IdentityProfile> {
  if (!paypalConfigured()) throw new AuthError('PayPal is not configured.', 503);
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const tokenResponse = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const token = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!tokenResponse.ok || !token?.access_token) {
    throw new AuthError(token?.error_description || 'PayPal sign-in failed.', 401);
  }

  const infoResponse = await fetch(`${paypalApiBase()}/v1/identity/oauth2/userinfo?schema=openid`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const info = (await infoResponse.json().catch(() => null)) as {
    user_id?: string;
    payer_id?: string;
    email?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  } | null;
  const email = info?.email?.trim().toLowerCase();
  const subject = info?.user_id || info?.payer_id || '';
  if (!infoResponse.ok || !email || !subject) {
    throw new AuthError('PayPal did not return the profile details needed to sign in.', 502);
  }
  return {
    provider: 'paypal',
    subject,
    email,
    name:
      info?.name?.trim() ||
      [info?.given_name, info?.family_name].filter(Boolean).join(' ').trim() ||
      email.split('@')[0],
  };
}

export function supabaseProfile(user: SupabaseUser): IdentityProfile {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new AuthError('The identity provider did not return an email address.', 502);
  const metadata = user.user_metadata ?? {};
  const name = String(metadata.full_name ?? metadata.name ?? '').trim() || email.split('@')[0];
  return { provider: 'supabase', subject: user.id, email, name };
}

/** Maps an external identity to a local workspace, creating one on first sign-in. */
export function provisionLocalUser(profile: IdentityProfile): SessionUser {
  const email = profile.email.trim().toLowerCase();
  const identity = findUserByIdentity(profile.provider, profile.subject);
  if (identity) {
    const user = getSessionUser(identity.id);
    if (user) return user;
  }

  const byEmail = findUserByEmail(email);
  if (byEmail) {
    if (byEmail.demo) {
      throw new AuthError('This email belongs to the demo workspace. Use Launch demo instead.', 409);
    }
    linkUserIdentity(profile.provider, profile.subject, byEmail.id);
    const user = getSessionUser(byEmail.id);
    if (user) return user;
  }

  const userId = createUserForIdentity({ ...profile, email });
  const user = getSessionUser(userId);
  if (!user) throw new AuthError('Could not create the workspace.', 500);
  return user;
}

export function oauthCallbackUrl(provider: 'google' | 'paypal'): string {
  return `${config.appBaseUrl}/api/auth/${provider}/callback`;
}
