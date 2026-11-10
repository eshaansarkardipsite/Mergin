import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';

const env = process.env;

function dbPathFromUrl(url: string | undefined): string {
  if (!url || url === 'file:./dev.db') return path.resolve(process.cwd(), 'dev.db');
  if (url.startsWith('file:')) return path.resolve(process.cwd(), url.slice('file:'.length));
  return path.resolve(process.cwd(), url);
}

export const config = {
  nodeEnv: env.NODE_ENV ?? 'development',
  isProduction: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 3001),
  appBaseUrl: (env.APP_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
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
  sessionSecret: env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex'),
  publicWebhookBaseUrl: env.PUBLIC_WEBHOOK_BASE_URL?.trim().replace(/\/$/, '') ?? '',
};

export function paypalConfigured(): boolean {
  return Boolean(config.paypal.clientId && config.paypal.clientSecret);
}

export function paypalWebhookConfigured(): boolean {
  return paypalConfigured() && Boolean(config.paypal.webhookId);
}

export function geminiConfigured(): boolean {
  return Boolean(config.gemini.apiKey);
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
