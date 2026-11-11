import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDbForTests } from '../server/db/connection';
import { getInvoice } from '../server/db/repo';
import { seedDatabase, WORKSPACE_ID } from '../server/db/seed';
import { generateInvoicePdf } from '../server/services/invoicePdf';

beforeEach(() => {
  seedDatabase(resetDbForTests());
});

afterEach(() => {
  closeDb();
});

describe('invoice PDF generation', () => {
  it('produces a valid PDF from Unicode and control characters', async () => {
    const invoice = getInvoice(WORKSPACE_ID, 'inv_1054');
    expect(invoice).not.toBeNull();

    const pdf = await generateInvoicePdf(
      {
        ...invoice!,
        customerName: '测试客户\r\nBcc: evil@example.com',
        notes: 'Emoji 🚀 and accents éü — “quotes”',
        paymentTerms: 'Net 30\u0000',
        items: invoice!.items.map((item, index) =>
          index === 0
            ? { ...item, description: '设计 =SUM(A1)', detail: 'line\r\nbreak' }
            : item,
        ),
      },
      'Northstar\r\nCreative',
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
