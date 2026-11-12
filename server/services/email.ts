import nodemailer from 'nodemailer';
import { config } from '../config';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string | null;
}

function resolveConfig(): EmailConfig | null {
  const host = config.email?.smtpHost?.trim();
  const port = Number(config.email?.smtpPort ?? 587);
  const secure = config.email?.smtpSecure ?? false;
  const user = config.email?.smtpUser?.trim() ?? null;
  const pass = config.email?.smtpPass?.trim() ?? null;
  const from = config.email?.smtpFrom?.trim() ?? null;

  if (!host || !from) return null;

  return { host, port, secure, user, pass, from };
}

export function emailConfigured(): boolean {
  return resolveConfig() !== null;
}

/** Collapse CR/LF so user text cannot inject extra mail headers. */
export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

// nodemailer waits 2 minutes to connect by default; a PaaS edge kills the request first.
const SEND_TIMEOUT_MS = 10_000;

const UNREACHABLE = new Set(['ETIMEDOUT', 'EDNS', 'ESOCKET', 'ECONNECTION']);

/** Name the env vars to fix instead of surfacing nodemailer's bare "Connection timeout". */
function smtpFailure(error: unknown, cfg: EmailConfig): Error {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  if (!code || !UNREACHABLE.has(code)) {
    return error instanceof Error ? error : new Error('Email send failed.');
  }
  const reason =
    code === 'ETIMEDOUT'
      ? `SMTP ${cfg.host}:${cfg.port} did not respond within ${SEND_TIMEOUT_MS / 1000}s.`
      : `SMTP ${cfg.host}:${cfg.port} could not be reached (${code}).`;
  return new Error(`${reason} Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE.`);
}

export async function sendInvoiceEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}): Promise<{ accepted: string[]; rejected: string[]; messageId: string }> {
  const cfg = resolveConfig();
  if (!cfg) {
    throw new Error('Email is not configured. Set SMTP_* environment variables.');
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS * 2,
  });

  try {
    const info = await transporter.sendMail({
      from: cfg.from ? sanitizeHeader(cfg.from) : undefined,
      to: sanitizeHeader(to),
      subject: sanitizeHeader(subject),
      html,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return {
      accepted: info.accepted,
      rejected: info.rejected,
      messageId: info.messageId,
    };
  } catch (error) {
    throw smtpFailure(error, cfg);
  }
}
