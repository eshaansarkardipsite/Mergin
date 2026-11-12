import { afterEach, describe, expect, it } from 'vitest';
import { config } from '../server/config';
import { sanitizeHeader, sendInvoiceEmail } from '../server/services/email';

describe('email header sanitization', () => {
  it('collapses newlines so user text cannot add headers', () => {
    expect(sanitizeHeader('Invoice INV-1\r\nBcc: evil@example.com')).toBe('Invoice INV-1 Bcc: evil@example.com');
    expect(sanitizeHeader('  Invoice INV-2  ')).toBe('Invoice INV-2');
  });
});

describe('invoice email delivery', () => {
  const original = { ...config.email };

  afterEach(() => {
    Object.assign(config.email, original);
  });

  it('fails fast with an actionable message when SMTP is unreachable', async () => {
    Object.assign(config.email, {
      smtpHost: '127.0.0.1',
      smtpPort: 1,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      smtpFrom: 'billing@example.com',
    });

    const started = Date.now();
    await expect(
      sendInvoiceEmail({ to: 'customer@example.com', subject: 'Invoice', html: '<p>Test</p>' }),
    ).rejects.toThrow(/SMTP 127\.0\.0\.1:1 (could not be reached|did not respond)/);
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 15_000);
});
