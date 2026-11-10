import { config, paypalApiBase, paypalConfigured } from '../config';
import { createTransaction, getInvoice, reconcileInvoice } from '../db/repo';
import type { Invoice } from '../../shared/types';
import { formatMoney } from '../../shared/money';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export class PaypalError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function getAccessToken(): Promise<string> {
  if (!paypalConfigured()) throw new PaypalError(409, 'PayPal server credentials are not configured.');
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const basic = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new PaypalError(response.status, `PayPal OAuth failed: ${text.slice(0, 300)}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function paypalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${paypalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? parsed.error_description ?? detail;
    } catch {
      // keep raw text
    }
    throw new PaypalError(response.status, detail);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function testPaypalConnection(): Promise<{ ok: boolean; environment: string; detail: string }> {
  if (!paypalConfigured()) {
    return { ok: false, environment: config.paypal.environment, detail: 'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are not set.' };
  }
  try {
    await getAccessToken();
    return { ok: true, environment: config.paypal.environment, detail: `Server OAuth succeeded against PayPal ${config.paypal.environment}.` };
  } catch (error) {
    return {
      ok: false,
      environment: config.paypal.environment,
      detail: error instanceof Error ? error.message : 'OAuth failed.',
    };
  }
}

function minorToPaypalValue(minor: number): string {
  return (minor / 100).toFixed(2);
}

function contactName(name: string): { given_name: string; surname: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { given_name: parts[0], surname: '' };
  return { given_name: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] };
}

export interface PaypalInvoiceResponse {
  id: string;
  status?: string;
  amount?: { value?: string; currency_code?: string };
  due_amount?: { value?: string };
  payments?: { paid_amount?: { value?: string }; transactions?: { payment_id?: string; payment_date?: string; amount?: { value?: string } }[] };
  refunds?: { transactions?: { amount?: { value?: string } }[] };
  detail?: { metadata?: { recipient_view_url?: string; invoicer_view_url?: string } };
}

function buildCreateBody(invoice: Invoice, businessName: string) {
  const items = invoice.items.map((item) => ({
    name: item.description.slice(0, 200),
    description: (item.detail || item.description).slice(0, 1000),
    quantity: (item.quantityMilli / 1000).toFixed(2),
    unit_amount: { currency_code: invoice.currency, value: minorToPaypalValue(item.unitPriceMinor) },
  }));
  const body: Record<string, unknown> = {
    detail: {
      invoice_number: invoice.number,
      currency_code: invoice.currency,
      invoice_date: invoice.issueDate,
      payment_term: { due_date: invoice.dueDate },
      note: invoice.notes.slice(0, 1000),
    },
    invoicer: { business_name: businessName },
    primary_recipients: [
      {
        billing_info: {
          email_address: invoice.customerEmail,
          name: contactName(invoice.customerName),
        },
      },
    ],
    items,
    amount: {
      currency_code: invoice.currency,
      value: minorToPaypalValue(invoice.totalMinor),
      breakdown: {
        item_total: { currency_code: invoice.currency, value: minorToPaypalValue(invoice.subtotalMinor) },
        ...(invoice.taxMinor > 0
          ? { tax_total: { currency_code: invoice.currency, value: minorToPaypalValue(invoice.taxMinor) } }
          : {}),
        ...(invoice.discountMinor > 0
          ? { discount: { currency_code: invoice.currency, value: minorToPaypalValue(invoice.discountMinor) } }
          : {}),
      },
    },
    configuration: {
      allow_tip: false,
      tax_calculated_after_discount: true,
      tax_inclusive: false,
      partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: invoice.currency, value: '1.00' } },
    },
  };
  return body;
}

export async function createPaypalInvoice(invoice: Invoice, businessName: string): Promise<PaypalInvoiceResponse> {
  return paypalRequest<PaypalInvoiceResponse>('/v2/invoicing/invoices', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(buildCreateBody(invoice, businessName)),
  });
}

export async function sendPaypalInvoice(paypalInvoiceId: string): Promise<void> {
  await paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}/send`, {
    method: 'POST',
    body: JSON.stringify({ send_to_invoicer: true, send_to_recipient: true }),
  });
}

export async function getPaypalInvoice(paypalInvoiceId: string): Promise<PaypalInvoiceResponse> {
  return paypalRequest<PaypalInvoiceResponse>(`/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}`);
}

export async function remindPaypalInvoice(paypalInvoiceId: string): Promise<void> {
  await paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}/remind`, {
    method: 'POST',
    body: JSON.stringify({ send_to_invoicer: true, send_to_recipient: true }),
  });
}

export async function cancelPaypalInvoice(paypalInvoiceId: string): Promise<void> {
  await paypalRequest(`/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ note: 'Cancelled from MERGIN', send_to_invoicer: true, send_to_recipient: true }),
  });
}

export async function verifyPaypalWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
  if (!config.paypal.webhookId) throw new PaypalError(503, 'PAYPAL_WEBHOOK_ID is not configured.');
  const header = (name: string) => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : (value ?? '');
  };
  const response = await paypalRequest<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: header('paypal-auth-algo'),
      cert_url: header('paypal-cert-url'),
      transmission_id: header('paypal-transmission-id'),
      transmission_sig: header('paypal-transmission-sig'),
      transmission_time: header('paypal-transmission-time'),
      webhook_id: config.paypal.webhookId,
      webhook_event: event,
    }),
  });
  return response.verification_status === 'SUCCESS';
}

export function paypalInvoiceSummary(pp: PaypalInvoiceResponse): {
  paypalStatus: string | null;
  paidMinor: number;
  dueMinor: number;
  totalMinor: number;
  approvalUrl: string | null;
  paidAt: string | null;
} {
  const paidMinor = Math.round(Number(pp.payments?.paid_amount?.value ?? 0) * 100);
  const refundedMinor = (pp.refunds?.transactions ?? []).reduce(
    (sum, tx) => sum + Math.round(Number(tx.amount?.value ?? 0) * 100),
    0,
  );
  const totalMinor = Math.round(Number(pp.amount?.value ?? 0) * 100);
  const dueMinor = Math.round(Number(pp.due_amount?.value ?? Math.max(0, totalMinor - paidMinor) / 100) * 100);
  const firstPayment = pp.payments?.transactions?.[0]?.payment_date;
  return {
    paypalStatus: pp.status ?? null,
    paidMinor: Math.max(0, paidMinor - refundedMinor),
    dueMinor: Math.max(0, dueMinor),
    totalMinor,
    approvalUrl: pp.detail?.metadata?.recipient_view_url ?? null,
    paidAt: firstPayment ? `${firstPayment.slice(0, 10)}T12:00:00.000Z` : null,
  };
}

export async function reconcileInvoiceWithPaypal(invoice: Invoice): Promise<Invoice> {
  return syncInvoiceFromPaypal(invoice.workspaceId, invoice.id);
}

/** Fetch authoritative PayPal invoice state, reconcile it, and idempotently add ledger rows. */
export async function syncInvoiceFromPaypal(workspaceId: string, invoiceId: string): Promise<Invoice> {
  const invoice = getInvoice(workspaceId, invoiceId);
  if (!invoice) throw new PaypalError(404, 'Invoice not found.');
  if (!invoice.paypalInvoiceId) throw new PaypalError(409, 'This invoice has no PayPal invoice ID yet.');
  const pp = await getPaypalInvoice(invoice.paypalInvoiceId);
  const summary = paypalInvoiceSummary(pp);
  reconcileInvoice(invoice.id, {
    paypalStatus: summary.paypalStatus,
    paidMinor: summary.paidMinor,
    dueMinor: summary.dueMinor,
    totalMinor: invoice.totalMinor,
    paidAt: summary.paidAt,
    approvalUrl: summary.approvalUrl,
  });
  for (const payment of pp.payments?.transactions ?? []) {
    if (!payment.payment_id) continue;
    createTransaction(workspaceId, {
      date: (payment.payment_date ?? new Date().toISOString()).slice(0, 10),
      externalId: `paypal_${payment.payment_id}`,
      counterparty: invoice.customerName,
      description: `PayPal payment · ${invoice.number}`,
      category: 'Client payments',
      invoiceId: invoice.id,
      source: `PayPal ${config.paypal.environment}`,
      direction: 'incoming',
      status: 'settled',
      amountMinor: Math.round(Number(payment.amount?.value ?? 0) * 100),
    });
  }
  return getInvoice(workspaceId, invoiceId)!;
}

export function paypalStatusLabel(status: string | null): string {
  if (!status) return 'No PayPal state';
  return status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function paypalAmountLabel(minor: number, currency: Invoice['currency'] = 'USD'): string {
  return formatMoney(minor, currency);
}
