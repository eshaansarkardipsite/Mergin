import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { paypalInvoiceSummary, verifyPaypalWebhook } from '../server/services/paypal';

describe('PayPal invoice state mapping', () => {
  it('maps a fully paid invoice', () => {
    const summary = paypalInvoiceSummary({
      id: 'PP-1',
      status: 'PAID',
      amount: { value: '100.00', currency_code: 'USD' },
      due_amount: { value: '0.00' },
      payments: { paid_amount: { value: '100.00' }, transactions: [{ payment_date: '2026-01-02T00:00:00Z' }] },
    });
    expect(summary).toMatchObject({ paypalStatus: 'PAID', paidMinor: 10_000, dueMinor: 0, totalMinor: 10_000 });
  });

  it('maps a partial payment and derives the remaining balance', () => {
    const summary = paypalInvoiceSummary({
      id: 'PP-2',
      status: 'PARTIALLY_PAID',
      amount: { value: '100.00' },
      due_amount: { value: '60.00' },
      payments: { paid_amount: { value: '40.00' } },
    });
    expect(summary.paidMinor).toBe(4_000);
    expect(summary.dueMinor).toBe(6_000);
    expect(summary.totalMinor).toBe(10_000);
  });

  it('keeps a pending invoice unpaid', () => {
    const summary = paypalInvoiceSummary({
      id: 'PP-3',
      status: 'PAYMENT_PENDING',
      amount: { value: '250.50' },
      due_amount: { value: '250.50' },
      payments: { paid_amount: { value: '0.00' } },
    });
    expect(summary.paidMinor).toBe(0);
    expect(summary.dueMinor).toBe(25_050);
  });

  it('subtracts refunds and clamps at zero', () => {
    const summary = paypalInvoiceSummary({
      id: 'PP-4',
      status: 'REFUNDED',
      amount: { value: '100.00' },
      due_amount: { value: '0.00' },
      payments: { paid_amount: { value: '100.00' } },
      refunds: { transactions: [{ amount: { value: '20.00' } }, { amount: { value: '200.00' } }] },
    });
    expect(summary.paidMinor).toBe(0);
  });

  it('derives the due amount when PayPal omits it', () => {
    const summary = paypalInvoiceSummary({
      id: 'PP-5',
      status: 'PARTIALLY_PAID',
      amount: { value: '80.00' },
      payments: { paid_amount: { value: '30.00' } },
    });
    expect(summary.dueMinor).toBe(5_000);
  });
});

const originalPaypal = { ...config.paypal };

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  Object.assign(config.paypal, originalPaypal);
  vi.unstubAllGlobals();
});

describe('PayPal webhook signature verification', () => {
  it('refuses to verify without a webhook ID', async () => {
    config.paypal.clientId = 'client';
    config.paypal.clientSecret = 'secret';
    config.paypal.webhookId = '';
    await expect(
      verifyPaypalWebhook({}, { id: 'WH-1', event_type: 'INVOICING.INVOICE.PAID' }),
    ).rejects.toThrow(/PAYPAL_WEBHOOK_ID is not configured/);
  });

  it('sends transmission headers and the webhook ID to PayPal', async () => {
    config.paypal.clientId = 'client';
    config.paypal.clientSecret = 'secret';
    config.paypal.webhookId = 'WH-TEST';
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      if (String(input).includes('/v1/oauth2/token')) {
        return jsonResponse({ access_token: 'test-token', expires_in: 3_600 });
      }
      return jsonResponse({ verification_status: 'SUCCESS' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const event = { id: 'WH-1', event_type: 'INVOICING.INVOICE.PAID' };
    const verified = await verifyPaypalWebhook(
      {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://example.test/cert.pem',
        'paypal-transmission-id': 'transmission-1',
        'paypal-transmission-sig': 'signature-1',
        'paypal-transmission-time': '2026-01-01T00:00:00Z',
      },
      event,
    );

    expect(verified).toBe(true);
    const verifyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/verify-webhook-signature'));
    expect(verifyCall).toBeTruthy();
    const body = JSON.parse(String((verifyCall![1] as RequestInit).body));
    expect(body.webhook_id).toBe('WH-TEST');
    expect(body.transmission_id).toBe('transmission-1');
    expect(body.webhook_event).toEqual(event);
  });

  it('returns false when PayPal rejects the signature', async () => {
    config.paypal.clientId = 'client';
    config.paypal.clientSecret = 'secret';
    config.paypal.webhookId = 'WH-TEST';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/v1/oauth2/token')
          ? jsonResponse({ access_token: 'test-token', expires_in: 3_600 })
          : jsonResponse({ verification_status: 'FAILURE' }),
      ),
    );

    await expect(verifyPaypalWebhook({}, { id: 'WH-2', event_type: 'INVOICING.INVOICE.PAID' })).resolves.toBe(false);
  });
});
