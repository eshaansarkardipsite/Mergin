import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Google Fonts stylesheet + React inline style attributes.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
});

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 1_000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' },
});
// shortcut: in-memory counters are per process; move to a shared store before running more than one API instance.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Development may use any local port (5173, 5174, …); production only accepts the configured origin. */
function originAllowed(origin: string): boolean {
  if (origin === config.appBaseUrl) return true;
  if (config.isProduction) return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Block browser cross-origin writes. Requests without Origin (webhooks, CLI) are not browser CSRF. */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (UNSAFE_METHODS.has(req.method) && origin && !originAllowed(origin)) {
    res.status(403).json({ error: 'Cross-origin request blocked.' });
    return;
  }
  next();
}

/** Only failed sign-in attempts count, so normal use never locks a workspace out. */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
});
