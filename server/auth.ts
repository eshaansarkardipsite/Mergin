import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from './config';
import { getSessionUser } from './db/repo';
import type { SessionUser } from '../shared/types';

const COOKIE_NAME = 'mergin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_COOKIE_NAME = 'mergin_oauth';
const OAUTH_TTL_SECONDS = 60 * 10;

interface SessionPayload {
  userId: string;
  exp: number;
}

export interface OAuthPayload {
  provider: string;
  state: string;
  verifier?: string;
  exp: number;
}

function sign(value: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function createSignedToken(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

function verifySignedToken<T extends { exp: number }>(token: string): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string): string {
  return createSignedToken({ userId }, SESSION_TTL_SECONDS);
}

export function verifySessionToken(token: string): string | null {
  return verifySignedToken<SessionPayload>(token)?.userId ?? null;
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = createSessionToken(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setOAuthCookie(res: Response, payload: Omit<OAuthPayload, 'exp'>): void {
  res.cookie(OAUTH_COOKIE_NAME, createSignedToken(payload, OAUTH_TTL_SECONDS), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: OAUTH_TTL_SECONDS * 1000,
    path: '/api/auth',
  });
}

export function readOAuthCookie(req: Request): OAuthPayload | null {
  const token = readCookie(req, OAUTH_COOKIE_NAME);
  return token ? verifySignedToken<OAuthPayload>(token) : null;
}

export function clearOAuthCookie(res: Response): void {
  res.clearCookie(OAUTH_COOKIE_NAME, { path: '/api/auth' });
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function getSession(req: Request): SessionUser | null {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  const userId = verifySessionToken(token);
  return userId ? getSessionUser(userId) : null;
}

export function requireAuth(req: Request, res: Response, next: () => void): void {
  const user = getSession(req);
  if (!user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  (req as Request & { user: SessionUser }).user = user;
  next();
}

export function currentUser(req: Request): SessionUser {
  return (req as Request & { user: SessionUser }).user;
}
