import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import {
  config,
  googleAuthConfigured,
  openrouterConfigured,
  supabaseConfigured,
} from '../server/config';

describe('security headers', () => {
  it('applies hardening headers to API responses', async () => {
    const response = await request(createApp()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain('https://fonts.gstatic.com');
  });
});

const original = {
  supabase: { ...config.supabase },
  google: { ...config.google },
  openrouter: { ...config.openrouter },
};

afterEach(() => {
  Object.assign(config.supabase, original.supabase);
  Object.assign(config.google, original.google);
  Object.assign(config.openrouter, original.openrouter);
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
