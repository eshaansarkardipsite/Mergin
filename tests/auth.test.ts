import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { config } from '../server/config';
import { closeDb, getDb, resetDbForTests } from '../server/db/connection';
import { findUserByIdentity } from '../server/db/repo';
import { seedDatabase } from '../server/db/seed';
import {
  AuthError,
  exchangePaypalCode,
  exchangeSupabaseCode,
  provisionLocalUser,
  signInWithSupabasePassword,
} from '../server/services/identity';

const originalSupabase = { ...config.supabase };
const originalPaypal = { ...config.paypal };

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  closeDb();
  vi.unstubAllGlobals();
  Object.assign(config.supabase, originalSupabase);
  Object.assign(config.paypal, originalPaypal);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('local identity provisioning', () => {
  it('creates one workspace per external identity and reuses it on later sign-ins', () => {
    const first = provisionLocalUser({
      provider: 'supabase',
      subject: 'supabase-uuid-1',
      email: 'maya@example.com',
      name: 'Maya Chen',
    });
    expect(first.demo).toBe(false);
    expect(first.workspaceName).toContain('Maya');

    const again = provisionLocalUser({
      provider: 'supabase',
      subject: 'supabase-uuid-1',
      email: 'maya@example.com',
      name: 'Maya Chen',
    });
    expect(again.id).toBe(first.id);
    expect(again.workspaceId).toBe(first.workspaceId);
  });

  it('links a second provider to an existing non-demo account by email', () => {
    const first = provisionLocalUser({
      provider: 'supabase',
      subject: 'supabase-uuid-2',
      email: 'maya@example.com',
      name: 'Maya Chen',
    });

    const linked = provisionLocalUser({
      provider: 'paypal',
      subject: 'paypal-user-2',
      email: 'MAYA@example.com',
      name: 'Maya Chen',
    });

    expect(linked.id).toBe(first.id);
    expect(findUserByIdentity('paypal', 'paypal-user-2')?.id).toBe(first.id);
  });

  it('does not create a duplicate account when Google email matches an existing email/password account', () => {
    // First sign-up via email/password path creates a local account
    const first = provisionLocalUser({
      provider: 'supabase',
      subject: 'supabase-uuid-3',
      email: 'alice@example.com',
      name: 'Alice Smith',
    });

    // Later Google SSO with the same email should link to the same account
    const viaGoogle = provisionLocalUser({
      provider: 'supabase',
      subject: 'google-uuid-3',
      email: 'alice@example.com',
      name: 'Alice Smith',
    });

    expect(viaGoogle.id).toBe(first.id);
    expect(viaGoogle.workspaceId).toBe(first.workspaceId);
  });

  it('does not create a duplicate account when PayPal email matches an existing Google account', () => {
    // First sign-in via Google creates a local account
    const first = provisionLocalUser({
      provider: 'supabase',
      subject: 'google-uuid-4',
      email: 'bob@example.com',
      name: 'Bob Jones',
    });

    // Later PayPal SSO with the same email should link to the same account
    const viaPaypal = provisionLocalUser({
      provider: 'paypal',
      subject: 'paypal-uuid-4',
      email: 'bob@example.com',
      name: 'Bob Jones',
    });

    expect(viaPaypal.id).toBe(first.id);
    expect(viaPaypal.workspaceId).toBe(first.workspaceId);
  });

  it('refuses to attach a real identity to the demo account', () => {
    const demo = provisionLocalUser({
      provider: 'local',
      subject: 'local-3',
      email: 'demo@mergin.example',
      name: 'Demo Owner',
    });
    getDb().prepare('UPDATE users SET demo = 1 WHERE id = ?').run(demo.id);

    expect(() =>
      provisionLocalUser({
        provider: 'supabase',
        subject: 'supabase-uuid-3',
        email: 'demo@mergin.example',
        name: 'Demo Owner',
      }),
    ).toThrowError(AuthError);
  });

  it('provisions a first-time identity on a database that already holds the demo seed', () => {
    seedDatabase(getDb());

    const user = provisionLocalUser({
      provider: 'supabase',
      subject: 'google-seeded-uuid',
      email: 'new.owner@example.com',
      name: 'New Owner',
    });

    expect(user.demo).toBe(false);
    expect(user.workspaceName).toBeTruthy();
  });
});

describe('Supabase password sign-in', () => {
  it('sends the anon key and password grant, then returns the user', async () => {
    config.supabase.url = 'https://project.supabase.co';
    config.supabase.anonKey = 'anon-key';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'token', refresh_token: 'refresh', user: { id: 'uuid-4', email: 'maya@example.com' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await signInWithSupabasePassword('maya@example.com', 'secret');

    expect(session.user.id).toBe('uuid-4');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://project.supabase.co/auth/v1/token?grant_type=password');
    expect(init.headers).toMatchObject({ apikey: 'anon-key' });
    expect(JSON.parse(String(init.body))).toEqual({ email: 'maya@example.com', password: 'secret' });
  });

  it('maps invalid credentials to a 401 AuthError', async () => {
    config.supabase.url = 'https://project.supabase.co';
    config.supabase.anonKey = 'anon-key';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error_description: 'Invalid login credentials' }, 400)));

    await expect(signInWithSupabasePassword('maya@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid login credentials',
    });
  });

  it('exchanges the OAuth code with the stored PKCE verifier', async () => {
    config.supabase.url = 'https://project.supabase.co';
    config.supabase.anonKey = 'anon-key';
    const fetchMock = vi.fn(async () =>
      jsonResponse({ access_token: 'token', refresh_token: 'refresh', user: { id: 'uuid-5', email: 'maya@example.com' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await exchangeSupabaseCode('auth-code', 'verifier-value');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://project.supabase.co/auth/v1/token?grant_type=pkce');
    expect(JSON.parse(String(init.body))).toEqual({ auth_code: 'auth-code', code_verifier: 'verifier-value' });
  });
});

describe('PayPal sign-in', () => {
  it('exchanges the code and maps the OIDC profile', async () => {
    config.paypal.clientId = 'client';
    config.paypal.clientSecret = 'secret';
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/v1/oauth2/token')) return jsonResponse({ access_token: 'paypal-token' });
      return jsonResponse({ user_id: 'PP-1', email: 'maya@example.com', name: 'Maya Chen' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const profile = await exchangePaypalCode('paypal-code');

    expect(profile).toEqual({
      provider: 'paypal',
      subject: 'PP-1',
      email: 'maya@example.com',
      name: 'Maya Chen',
    });
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toContain('/v1/oauth2/token');
    expect(String(tokenInit.body)).toContain('grant_type=authorization_code');
    expect(String(tokenInit.body)).toContain('code=paypal-code');
  });
});

describe('password reset requests', () => {
  it('asks Supabase for a recovery mail only when the email exists locally', async () => {
    config.supabase.url = 'https://project.supabase.co';
    config.supabase.anonKey = 'anon-key';
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    const app = createApp();

    const unknown = await request(app).post('/api/auth/reset-password').send({ email: 'missing@example.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.message).toMatch(/if an account exists/i);
    expect(fetchMock).not.toHaveBeenCalled();

    provisionLocalUser({ provider: 'supabase', subject: 'reset-uuid', email: 'known@example.com', name: 'Known' });
    const known = await request(app).post('/api/auth/reset-password').send({ email: 'known@example.com' });
    expect(known.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://project.supabase.co/auth/v1/recover');
  });
});
