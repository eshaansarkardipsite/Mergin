import { getInvoiceByPaypalId, getWebhookEvent, reconcileInvoice, recordWebhookEvent, setInvoicePaypal } from '../db/repo';
import { getPaypalInvoice, paypalInvoiceSummary, syncInvoiceFromPaypal } from './paypal';

interface PaypalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: Record<string, unknown>;
  summary?: Record<string, unknown>;
}

export interface WebhookOutcome {
  state: 'processed' | 'duplicate' | 'ignored' | 'failed';
  note: string;
}

function extractInvoiceId(event: PaypalWebhookEvent): string | null {
  const resource = event.resource ?? {};
  const direct = resource.id;
  const invoice = resource.invoice as Record<string, unknown> | undefined;
  if (typeof direct === 'string' && /^[A-Z0-9-]{6,30}$/i.test(direct)) return direct;
  if (typeof invoice?.id === 'string') return invoice.id;
  if (typeof resource.invoice_id === 'string') return resource.invoice_id;
  const summary = event.summary ?? {};
  if (typeof summary.invoice_id === 'string') return summary.invoice_id;
  return null;
}

const RECONCILE_EVENTS = new Set([
  'INVOICING.INVOICE.PAID',
  'INVOICING.INVOICE.UPDATED',
  'INVOICING.INVOICE.REFUNDED',
  'INVOICING.INVOICE.CANCELLED',
]);

const STATUS_ONLY_EVENTS = new Set(['INVOICING.INVOICE.CREATED', 'INVOICING.INVOICE.SENT', 'INVOICING.INVOICE.SCHEDULED']);

/** Process a verified PayPal event. Safe to call twice: event IDs are persisted. */
export async function processPaypalWebhook(event: PaypalWebhookEvent): Promise<WebhookOutcome> {
  const eventId = event.id;
  const eventType = event.event_type ?? 'UNKNOWN';
  if (!eventId) return { state: 'failed', note: 'Event has no id.' };

  const seen = getWebhookEvent(eventId);
  if (seen && seen.processingState === 'processed') {
    return { state: 'duplicate', note: `Event ${eventId} was already processed.` };
  }

  const paypalInvoiceId = extractInvoiceId(event);
  const invoice = paypalInvoiceId ? getInvoiceByPaypalId(paypalInvoiceId) : null;
  if (!invoice) {
    recordWebhookEvent({
      workspaceId: null,
      providerEventId: eventId,
      eventType,
      paypalInvoiceId,
      processingState: 'ignored',
      note: 'No MERGIN invoice matches this PayPal invoice ID.',
    });
    return { state: 'ignored', note: 'No matching MERGIN invoice.' };
  }

  try {
    if (RECONCILE_EVENTS.has(eventType)) {
      // PAID can mean partial or pending, so always retrieve authoritative state.
      await syncInvoiceFromPaypal(invoice.workspaceId, invoice.id);
      recordWebhookEvent({
        workspaceId: invoice.workspaceId,
        providerEventId: eventId,
        eventType,
        paypalInvoiceId,
        processingState: 'processed',
        note: 'Authoritative PayPal invoice state reconciled.',
      });
      return { state: 'processed', note: 'Authoritative invoice state reconciled.' };
    }

    if (STATUS_ONLY_EVENTS.has(eventType) && paypalInvoiceId) {
      const pp = await getPaypalInvoice(paypalInvoiceId);
      const summary = paypalInvoiceSummary(pp);
      setInvoicePaypal(invoice.id, {
        paypalStatus: summary.paypalStatus,
        paypalApprovalUrl: summary.approvalUrl ?? invoice.paypalApprovalUrl,
        status: eventType === 'INVOICING.INVOICE.SENT' ? 'sent' : invoice.status,
        sentAt: eventType === 'INVOICING.INVOICE.SENT' ? new Date().toISOString() : invoice.sentAt,
      });
      if (eventType === 'INVOICING.INVOICE.CANCELLED') {
        reconcileInvoice(invoice.id, {
          paypalStatus: 'CANCELLED',
          paidMinor: invoice.paidMinor,
          dueMinor: invoice.dueMinor,
          totalMinor: invoice.totalMinor,
          paidAt: invoice.paidAt,
        });
      }
      recordWebhookEvent({
        workspaceId: invoice.workspaceId,
        providerEventId: eventId,
        eventType,
        paypalInvoiceId,
        processingState: 'processed',
        note: `${eventType} applied.`,
      });
      return { state: 'processed', note: `${eventType} applied.` };
    }

    recordWebhookEvent({
      workspaceId: invoice.workspaceId,
      providerEventId: eventId,
      eventType,
      paypalInvoiceId,
      processingState: 'ignored',
      note: 'Event type is not handled by this MVP.',
    });
    return { state: 'ignored', note: 'Event type is not handled.' };
  } catch (error) {
    recordWebhookEvent({
      workspaceId: invoice.workspaceId,
      providerEventId: eventId,
      eventType,
      paypalInvoiceId,
      processingState: 'failed',
      note: error instanceof Error ? error.message.slice(0, 300) : 'Unknown error',
    });
    return { state: 'failed', note: error instanceof Error ? error.message : 'Unknown error' };
  }
}
