import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../server/db/connection';
import { getInvoice, getWebhookEvent, recordWebhookEvent, setInvoicePaypal } from '../server/db/repo';
import { seedDatabase, WORKSPACE_ID } from '../server/db/seed';
import { processPaypalWebhook } from '../server/services/webhook';

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  seedDatabase(db);
});

describe('PayPal webhook event handling', () => {
  it('treats an already processed event as a duplicate', async () => {
    recordWebhookEvent({
      workspaceId: WORKSPACE_ID,
      providerEventId: 'WH-EVT-1',
      eventType: 'INVOICING.INVOICE.PAID',
      paypalInvoiceId: null,
      processingState: 'processed',
      note: 'first delivery',
    });

    const outcome = await processPaypalWebhook({ id: 'WH-EVT-1', event_type: 'INVOICING.INVOICE.PAID' });
    expect(outcome.state).toBe('duplicate');
    expect(getWebhookEvent('WH-EVT-1')?.note).toBe('first delivery');
  });

  it('records an ignored event when no invoice matches', async () => {
    const outcome = await processPaypalWebhook({
      id: 'WH-EVT-2',
      event_type: 'INVOICING.INVOICE.PAID',
      resource: { id: 'PP-INVOICE-999' },
    });

    expect(outcome.state).toBe('ignored');
    expect(getWebhookEvent('WH-EVT-2')).toMatchObject({
      workspaceId: null,
      processingState: 'ignored',
      paypalInvoiceId: 'PP-INVOICE-999',
    });
  });

  it('ignores unhandled event types for a known invoice without calling PayPal', async () => {
    const invoice = getInvoice(WORKSPACE_ID, 'inv_1054');
    expect(invoice).not.toBeNull();
    setInvoicePaypal(invoice!.id, { paypalInvoiceId: 'PP-INVOICE-123' });

    const outcome = await processPaypalWebhook({
      id: 'WH-EVT-3',
      event_type: 'INVOICING.INVOICE.REMINDED',
      resource: { id: 'PP-INVOICE-123' },
    });

    expect(outcome.state).toBe('ignored');
    expect(getWebhookEvent('WH-EVT-3')).toMatchObject({
      workspaceId: WORKSPACE_ID,
      paypalInvoiceId: 'PP-INVOICE-123',
      processingState: 'ignored',
    });
  });

  it('fails an event without an id', async () => {
    const outcome = await processPaypalWebhook({ event_type: 'INVOICING.INVOICE.PAID' });
    expect(outcome.state).toBe('failed');
  });
});
