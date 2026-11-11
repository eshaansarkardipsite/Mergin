import { describe, expect, it } from 'vitest';
import { sanitizeHeader } from '../server/services/email';

describe('email header sanitization', () => {
  it('collapses newlines so user text cannot add headers', () => {
    expect(sanitizeHeader('Invoice INV-1\r\nBcc: evil@example.com')).toBe('Invoice INV-1 Bcc: evil@example.com');
    expect(sanitizeHeader('  Invoice INV-2  ')).toBe('Invoice INV-2');
  });
});
