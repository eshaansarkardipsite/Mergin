import { Router } from 'express';
import { config, paypalConfigured } from '../config';
import {
  addAuditEvent,
  createTransaction,
  getInvoiceByToken,
  getWorkspace,
  listPayments,
  recordDemoPayment,
} from '../db/repo';
import { asyncRoute, notFound } from '../http';
import { PaypalError, syncInvoiceFromPaypal } from '../services/paypal';

export const payRouter = Router();

function publicView(token: string) {
  const invoice = getInvoiceByToken(token);
  if (!invoice) return null;
  const workspace = getWorkspace(invoice.workspaceId);
  const payments = listPayments(invoice.id);
  const hasPaypalLink = Boolean(invoice.paypalInvoiceId && paypalConfigured());
  const paymentMode = hasPaypalLink ? 'paypal' : invoice.paypalStatus === 'DEMO_ONLY' ? 'demo' : 'sample';
  const paymentRef =
    payments.find((p) => p.paypal_payment_id)?.paypal_payment_id ??
    (invoice.status === 'paid' ? `DEMO-${invoice.number}` : null);
  return {
    workspaceName: workspace.name,
    demoEnvironment: !paypalConfigured(),
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      customerName: invoice.customerName,
      items: invoice.items,
      subtotalMinor: invoice.subtotalMinor,
      taxMinor: invoice.taxMinor,
      discountMinor: invoice.discountMinor,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      dueMinor: invoice.dueMinor,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      paypalStatus: invoice.paypalStatus,
      paypalApprovalUrl: invoice.paypalApprovalUrl,
    },
    paypalConfigured: hasPaypalLink,
    canDemoPay:
      !hasPaypalLink &&
      invoice.dueMinor > 0 &&
      !['paid', 'refunded', 'cancelled'].includes(invoice.status) &&
      !(config.isProduction && paypalConfigured()),
    paymentMode,
    paymentRef,
    simulated: paymentMode !== 'paypal',
  };
}

payRouter.get('/:token', (req, res) => {
  const view = publicView(String(req.params.token));
  if (!view) return notFound(res, 'Payment link');
  res.json(view);
});

payRouter.post(
  '/:token/refresh',
  asyncRoute(async (req, res) => {
    const invoice = getInvoiceByToken(String(req.params.token));
    if (!invoice) return notFound(res, 'Payment link');
    if (invoice.paypalInvoiceId && paypalConfigured()) {
      try {
        await syncInvoiceFromPaypal(invoice.workspaceId, invoice.id);
      } catch (error) {
        const message = error instanceof PaypalError ? error.detail : 'PayPal state could not be retrieved.';
        res.status(502).json({ error: message });
        return;
      }
    }
    res.json(publicView(String(req.params.token)));
  }),
);

payRouter.post('/:token/demo-pay', (req, res) => {
  const invoice = getInvoiceByToken(String(req.params.token));
  if (!invoice) return notFound(res, 'Payment link');
  if (invoice.paypalInvoiceId && paypalConfigured()) {
    res.status(409).json({ error: 'This is a real PayPal invoice. Complete payment on the PayPal-hosted page.' });
    return;
  }
  if (['paid', 'refunded', 'cancelled'].includes(invoice.status) || invoice.dueMinor <= 0) {
    res.status(409).json({ error: 'This invoice does not have a balance available for demo payment.' });
    return;
  }
  const amount = invoice.dueMinor;
  recordDemoPayment(invoice.id, amount, 'demo');
  createTransaction(invoice.workspaceId, {
    date: new Date().toISOString().slice(0, 10),
    externalId: `demo_payment_${invoice.id}`,
    counterparty: invoice.customerName,
    description: `Simulated demo payment · ${invoice.number}`,
    category: 'Client payments',
    invoiceId: invoice.id,
    source: 'Demo simulator',
    direction: 'incoming',
    status: 'settled',
    amountMinor: amount,
  });
  addAuditEvent(
    invoice.workspaceId,
    'payment.demo_simulated',
    'Customer simulator',
    `Simulated ${amount} minor units for ${invoice.number} · no PayPal funds moved`,
  );
  res.json({ ...publicView(String(req.params.token)), simulated: true, message: 'Demo payment recorded locally. No real funds moved.' });
});
