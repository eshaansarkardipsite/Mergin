import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';

const env = process.env;

function dbPathFromUrl(url: string | undefined): string {
  if (!url || url === 'file:./dev.db') return path.resolve(process.cwd(), 'dev.db');
  if (url.startsWith('file:')) return path.resolve(process.cwd(), url.slice('file:'.length));
  return path.resolve(process.cwd(), url);
}

function cleanUrl(url: string | undefined): string {
  return url?.trim().replace(/\/$/, '') ?? '';
}

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  isProduction: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 3001),
  trustProxy: Number(env.TRUST_PROXY ?? 0),
  appBaseUrl: cleanUrl(env.APP_BASE_URL) || 'http://localhost:5173',
  databasePath: dbPathFromUrl(env.DATABASE_URL),
  paypal: {
    environment: env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
    clientId: env.PAYPAL_CLIENT_ID?.trim() ?? '',
    clientSecret: env.PAYPAL_CLIENT_SECRET?.trim() ?? '',
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() ?? '',
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY?.trim() ?? '',
    model: env.GEMINI_MODEL?.trim() ?? '',
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY?.trim() ?? '',
    model: env.OPENROUTER_MODEL?.trim() ?? '',
  },
  supabase: {
    url: cleanUrl(env.SUPABASE_URL),
    anonKey: env.SUPABASE_ANON_KEY?.trim() ?? '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
  },
  email: {
    smtpHost: env.SMTP_HOST?.trim() ?? '',
    smtpPort: Number(env.SMTP_PORT ?? 587),
    smtpSecure: env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER?.trim() ?? '',
    smtpPass: env.SMTP_PASS?.trim() ?? '',
    smtpFrom: env.SMTP_FROM?.trim() ?? '',
  },
  google: {
    clientId: env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
  },
  sessionSecret: env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex'),
  publicWebhookBaseUrl: cleanUrl(env.PUBLIC_WEBHOOK_BASE_URL),
};

/** Fail fast instead of running production with a per-process session secret or a localhost base URL. */
export function assertProductionConfig(): void {
  if (!config.isProduction) return;
  const missing = [
    !env.SESSION_SECRET?.trim() ? 'SESSION_SECRET' : '',
    !env.APP_BASE_URL?.trim() ? 'APP_BASE_URL' : '',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Production configuration is incomplete. Set ${missing.join(' and ')} in the server environment.`);
  }
}

export function paypalConfigured(): boolean {
  return Boolean(config.paypal.clientId && config.paypal.clientSecret);
}

export function paypalWebhookConfigured(): boolean {
  return paypalConfigured() && Boolean(config.paypal.webhookId);
}

export function geminiConfigured(): boolean {
  return Boolean(config.gemini.apiKey);
}

export function supabaseConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.anonKey);
}

export function googleAuthConfigured(): boolean {
  return supabaseConfigured() && Boolean(config.google.clientId && config.google.clientSecret);
}

export function openrouterConfigured(): boolean {
  return Boolean(config.openrouter.apiKey);
}

export function emailConfigured(): boolean {
  return Boolean(config.email.smtpHost && config.email.smtpFrom);
}

export function paypalApiBase(): string {
  return config.paypal.environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

export function webhookUrl(): string {
  const base = config.publicWebhookBaseUrl || config.appBaseUrl;
  return `${base}/api/paypal/webhook`;
}
