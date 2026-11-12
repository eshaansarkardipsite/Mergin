import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import {
  config,
  googleAuthConfigured,
  openrouterConfigured,
  supabaseConfigured,
} from '../server/config';
import { closeDb, resetDbForTests } from '../server/db/connection';

beforeEach(() => {
  resetDbForTests();
});

describe('security headers', () => {
  it('applies hardening headers to API responses', async () => {
    const response = await request(createApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: 'mergin-api' });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain('https://fonts.gstatic.com');
    expect(response.headers['cache-control']).toBe('no-store');
  });
});

describe('cross-origin request protection', () => {
  it('blocks unsafe browser requests from another origin', async () => {
    const response = await request(createApp())
      .post('/api/invoices')
      .set('Origin', 'https://evil.example')
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/cross-origin/i);
  });

  it('lets same-origin requests reach the auth guard', async () => {
    const response = await request(createApp())
      .post('/api/invoices')
      .set('Origin', config.appBaseUrl)
      .send({});

    expect(response.status).toBe(401);
  });

  it('lets localhost on another development port reach the auth guard', async () => {
    const response = await request(createApp())
      .post('/api/invoices')
      .set('Origin', 'http://localhost:5174')
      .send({});

    expect(response.status).toBe(401);
  });
});

const original = {
  supabase: { ...config.supabase },
  google: { ...config.google },
  openrouter: { ...config.openrouter },
};

afterEach(() => {
  closeDb();
  Object.assign(config.supabase, original.supabase);
  Object.assign(config.google, original.google);
  Object.assign(config.openrouter, original.openrouter);
});

describe('authentication guard', () => {
  it('rejects protected API requests without a session', async () => {
    const response = await request(createApp()).get('/api/invoices');
    expect(response.status).toBe(401);
  });

  it('rejects a tampered session cookie', async () => {
    const response = await request(createApp())
      .get('/api/invoices')
      .set('Cookie', 'mergin_session=forged.signature');
    expect(response.status).toBe(401);
  });
});

describe('provider readiness flags', () => {
  it('requires a Supabase URL and anon key', () => {
    config.supabase.url = '';
    config.supabase.anonKey = '';
    expect(supabaseConfigured()).toBe(false);

    config.supabase.url = 'https://example.supabase.co';
    config.supabase.anonKey = 'anon';
    expect(supabaseConfigured()).toBe(true);
  });

  it('reports Google OAuth only when Supabase and both Google values exist', () => {
    config.supabase.url = 'https://example.supabase.co';
    config.supabase.anonKey = 'anon';
    config.google.clientId = 'client';
    config.google.clientSecret = '';
    expect(googleAuthConfigured()).toBe(false);

    config.google.clientSecret = 'secret';
    expect(googleAuthConfigured()).toBe(true);
  });

  it('reports OpenRouter from the API key alone', () => {
    config.openrouter.apiKey = '';
    expect(openrouterConfigured()).toBe(false);

    config.openrouter.apiKey = 'sk-or-test';
    expect(openrouterConfigured()).toBe(true);
  });
});
