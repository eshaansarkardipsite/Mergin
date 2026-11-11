import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth';
import {
  addAuditEvent,
  createInvoice,
  deleteDraftInvoice,
  getInvoice,
  getWorkspace,
  listInvoices,
  setInvoicePaypal,
  updateDraftInvoice,
} from '../db/repo';
import { asyncRoute, notFound, parseBody } from '../http';
import { config, emailConfigured, paypalConfigured } from '../config';
import { formatDate } from '../../shared/dates';
import { formatMoney, formatQuantity } from '../../shared/money';
import { generateInvoicePdf } from '../services/invoicePdf';
import { sendInvoiceEmail } from '../services/email';
import {
  cancelPaypalInvoice,
  createPaypalInvoice,
  PaypalError,
  remindPaypalInvoice,
  sendPaypalInvoice,
  syncInvoiceFromPaypal,
} from '../services/paypal';

export const invoicesRouter = Router();

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

const itemSchema = z.object({
  description: z.string().trim().min(1).max(200),
  detail: z.string().max(1000).optional().default(''),
  quantityMilli: z.number().int().min(1).max(1_000_000_000),
  unitPriceMinor: z.number().int().min(0).max(100_000_000_000),
});

const invoiceSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().min(3).max(160),
  number: z.string().trim().max(40).optional().default(''),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxRateBps: z.number().int().min(0).max(10_000),
  discountMinor: z.number().int().min(0),
  notes: z.string().max(4000).optional().default(''),
  paymentTerms: z.string().max(2000).optional().default(''),
  items: z.array(itemSchema).min(1).max(100),
});

invoicesRouter.get('/', (req, res) => {
  const user = currentUser(req);
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  res.json({ invoices: listInvoices(user.workspaceId, { status, search }) });
});

invoicesRouter.get('/:id', (req, res) => {
  const user = currentUser(req);
  const invoice = getInvoice(user.workspaceId, String(req.params.id));
  if (!invoice) return notFound(res, 'Invoice');
  res.json({ invoice, paypalConfigured: paypalConfigured(), emailConfigured: emailConfigured() });
});

invoicesRouter.post('/', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(invoiceSchema, req, res);
  if (!input) return;
  const invoice = createInvoice(user.workspaceId, input);
  addAuditEvent(user.workspaceId, 'invoice.draft_created', user.name, `Created draft ${invoice.number} for ${invoice.customerName}`);
  res.status(201).json({ invoice });
});

invoicesRouter.put('/:id', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(invoiceSchema, req, res);
  if (!input) return;
  try {
    const invoice = updateDraftInvoice(user.workspaceId, String(req.params.id), input);
    addAuditEvent(user.workspaceId, 'invoice.draft_updated', user.name, `Updated draft ${invoice.number}`);
    res.json({ invoice });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : 'Could not update invoice.' });
  }
});

invoicesRouter.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const invoice = getInvoice(user.workspaceId, String(req.params.id));
  if (!invoice) return notFound(res, 'Invoice');
  if (!deleteDraftInvoice(user.workspaceId, invoice.id)) {
    res.status(409).json({ error: 'Only draft invoices can be deleted.' });
    return;
  }
  addAuditEvent(user.workspaceId, 'invoice.draft_deleted', user.name, `Deleted draft ${invoice.number}`);
  res.json({ ok: true });
});

invoicesRouter.post(
  '/:id/send',
  asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const invoice = getInvoice(user.workspaceId, String(req.params.id));
    if (!invoice) return notFound(res, 'Invoice');
    if (invoice.status !== 'draft') {
      res.status(409).json({ error: `Invoice is ${invoice.status}; only drafts can be sent.` });
      return;
    }

    if (!paypalConfigured() && !emailConfigured()) {
      setInvoicePaypal(invoice.id, {
        status: 'sent',
        paypalStatus: 'DEMO_ONLY',
        sentAt: new Date().toISOString(),
      });
      addAuditEvent(user.workspaceId, 'invoice.sent_demo', user.name, `Marked ${invoice.number} sent in demo mode · no email or PayPal invoice created`);
      res.json({
        invoice: getInvoice(user.workspaceId, invoice.id),
        mode: 'demo',
        message: 'Demo mode: invoice marked as sent. No email was delivered and no PayPal invoice was created.',
      });
      return;
    }

    // Generate PDF and email if SMTP is configured
    if (emailConfigured()) {
      try {
        const workspace = getWorkspace(user.workspaceId);
        const pdf = await generateInvoicePdf(invoice, workspace.name);
        const money = (minor: number) => formatMoney(minor, invoice.currency);
        const cell = 'padding: 8px; border: 1px solid #ccc;';
        const html = `
          <div style="font-family: Inter, sans-serif; color: #1a1a1a; line-height: 1.5;">
            <h2 style="margin: 0 0 8px 0; font-size: 16px;">Invoice ${escapeHtml(invoice.number)}</h2>
            <p style="margin: 0 0 20px 0; color: #555;">From ${escapeHtml(workspace.name)}</p>
            <p style="margin: 0 0 12px 0;">Dear ${escapeHtml(invoice.customerName)},</p>
            <p style="margin: 0 0 12px 0;">
              Thank you for availing our services. Please find invoice <strong>${escapeHtml(invoice.number)}</strong>
              attached as a PDF for your records.
            </p>
            <p style="margin: 0 0 24px 0;">
              Total due: <strong>${money(invoice.totalMinor)}</strong> · Due ${formatDate(invoice.dueDate)}
            </p>
            <table style="border-collapse: collapse; width: 100%; margin-bottom: 24px;">
              <thead>
                <tr style="background: #f0f0f0;">
                  <th style="text-align: left; ${cell}">Item</th>
                  <th style="text-align: right; ${cell}">Qty</th>
                  <th style="text-align: right; ${cell}">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map((item) => `
                  <tr>
                    <td style="${cell}">${escapeHtml(item.description)}${item.detail ? `<br><span style="color:#555; font-size:0.9em;">${escapeHtml(item.detail)}</span>` : ''}</td>
                    <td style="text-align: right; ${cell}">${formatQuantity(item.quantityMilli)}</td>
                    <td style="text-align: right; ${cell}">${money(item.totalMinor)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <table style="border-collapse: collapse; width: 100%; margin-bottom: 24px;">
              <tr>
                <td style="text-align: right; padding: 6px;">Subtotal</td>
                <td style="text-align: right; padding: 6px;">${money(invoice.subtotalMinor)}</td>
              </tr>
              <tr>
                <td style="text-align: right; padding: 6px;">Tax</td>
                <td style="text-align: right; padding: 6px;">${money(invoice.taxMinor)}</td>
              </tr>
              ${invoice.discountMinor > 0 ? `<tr>
                <td style="text-align: right; padding: 6px;">Discount</td>
                <td style="text-align: right; padding: 6px;">-${money(invoice.discountMinor)}</td>
              </tr>` : ''}
              <tr style="border-top: 2px solid #1a1a1a;">
                <td style="text-align: right; padding: 6px; font-weight: bold;">Total due</td>
                <td style="text-align: right; padding: 6px; font-weight: bold;">${money(invoice.totalMinor)}</td>
              </tr>
            </table>
            <p style="margin: 0; color: #555;">Payment terms: ${escapeHtml(invoice.paymentTerms || 'Net 30')}</p>
            ${invoice.notes ? `<p style="margin: 16px 0 0 0; color: #1a1a1a;">${escapeHtml(invoice.notes)}</p>` : ''}
            <p style="margin: 24px 0 0 0;">If you have any questions about this invoice, simply reply to this email.</p>
            <p style="margin: 16px 0 0 0;">Warm regards,<br>${escapeHtml(workspace.name)}</p>
          </div>
        `;

        await sendInvoiceEmail({
          to: invoice.customerEmail,
          subject: `Invoice ${invoice.number} from ${workspace.name}`,
          html,
          attachments: [{
            filename: `invoice-${invoice.number}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          }],
        });

        setInvoicePaypal(invoice.id, {
          status: 'sent',
          paypalStatus: 'EMAILED',
          sentAt: new Date().toISOString(),
        });
        addAuditEvent(user.workspaceId, 'invoice.sent_email', user.name, `Emailed ${invoice.number} as PDF to ${invoice.customerEmail}`);
        res.json({
          invoice: getInvoice(user.workspaceId, invoice.id),
          mode: 'email',
          message: `Invoice ${invoice.number} emailed as PDF to ${invoice.customerEmail}.`,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Email send failed.';
        res.status(502).json({ error: `Invoice email failed: ${message}` });
        return;
      }
    }

    // PayPal path (existing)
    try {
      let paypalInvoiceId = invoice.paypalInvoiceId;
      let approvalUrl = invoice.paypalApprovalUrl;
      if (!paypalInvoiceId) {
        const created = await createPaypalInvoice(invoice, getWorkspace(user.workspaceId).name);
        paypalInvoiceId = created.id;
        approvalUrl = created.detail?.metadata?.recipient_view_url ?? null;
        setInvoicePaypal(invoice.id, {
          paypalInvoiceId,
          paypalStatus: created.status ?? 'DRAFT',
          paypalApprovalUrl: approvalUrl,
        });
      }
      await sendPaypalInvoice(paypalInvoiceId);
      setInvoicePaypal(invoice.id, {
        status: 'sent',
        paypalStatus: 'SENT',
        sentAt: new Date().toISOString(),
        paypalApprovalUrl: approvalUrl,
      });
      let reconciled = null;
      try {
        reconciled = await syncInvoiceFromPaypal(user.workspaceId, invoice.id);
      } catch {
        // Send succeeded; a later reconcile can still retrieve the hosted URL.
      }
      addAuditEvent(
        user.workspaceId,
        'invoice.sent_paypal',
        user.name,
        `Created and sent ${invoice.number} through PayPal ${config.paypal.environment}`,
      );
      res.json({
        invoice: reconciled ?? getInvoice(user.workspaceId, invoice.id),
        mode: 'paypal',
        message: `PayPal ${config.paypal.environment} invoice created and sent.`,
      });
    } catch (error) {
      const message = error instanceof PaypalError ? error.detail : error instanceof Error ? error.message : 'PayPal request failed.';
      res.status(502).json({ error: `PayPal did not complete the send: ${message}` });
    }
  }),
);

invoicesRouter.post(
  '/:id/remind',
  asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const invoice = getInvoice(user.workspaceId, String(req.params.id));
    if (!invoice) return notFound(res, 'Invoice');
    if (!['sent', 'overdue', 'partial', 'pending'].includes(invoice.status)) {
      res.status(409).json({ error: `A reminder is not available for a ${invoice.status} invoice.` });
      return;
    }
    if (paypalConfigured() && invoice.paypalInvoiceId) {
      try {
        await remindPaypalInvoice(invoice.paypalInvoiceId);
        addAuditEvent(user.workspaceId, 'invoice.reminder_sent', user.name, `Sent PayPal reminder for ${invoice.number}`);
        res.json({ mode: 'paypal', message: `Reminder sent through PayPal ${config.paypal.environment}.` });
      } catch (error) {
        const message = error instanceof PaypalError ? error.detail : 'PayPal reminder failed.';
        res.status(502).json({ error: message });
      }
      return;
    }
    addAuditEvent(user.workspaceId, 'invoice.reminder_demo', user.name, `Recorded demo reminder for ${invoice.number} · no email sent`);
    res.json({
      mode: 'demo',
      message: 'Demo reminder recorded in the audit log. No email was sent.',
    });
  }),
);

const confirmSchema = z.object({ confirm: z.literal(true) });

invoicesRouter.post(
  '/:id/cancel',
  asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const input = parseBody(confirmSchema, req, res);
    if (!input) return;
    const invoice = getInvoice(user.workspaceId, String(req.params.id));
    if (!invoice) return notFound(res, 'Invoice');
    if (invoice.status === 'draft') {
      deleteDraftInvoice(user.workspaceId, invoice.id);
      addAuditEvent(user.workspaceId, 'invoice.draft_deleted', user.name, `Deleted draft ${invoice.number}`);
      res.json({ deleted: true, message: 'Draft deleted.' });
      return;
    }
    if (['paid', 'refunded', 'cancelled'].includes(invoice.status)) {
      res.status(409).json({ error: `A ${invoice.status} invoice cannot be cancelled.` });
      return;
    }
    if (paypalConfigured() && invoice.paypalInvoiceId) {
      try {
        await cancelPaypalInvoice(invoice.paypalInvoiceId);
        await syncInvoiceFromPaypal(user.workspaceId, invoice.id);
        addAuditEvent(user.workspaceId, 'invoice.cancelled', user.name, `Cancelled ${invoice.number} through PayPal`);
        res.json({ invoice: getInvoice(user.workspaceId, invoice.id), mode: 'paypal', message: 'PayPal invoice cancelled.' });
      } catch (error) {
        const message = error instanceof PaypalError ? error.detail : 'PayPal cancellation failed.';
        res.status(502).json({ error: message });
      }
      return;
    }
    setInvoicePaypal(invoice.id, { status: 'cancelled', paypalStatus: 'DEMO_CANCELLED' });
    addAuditEvent(user.workspaceId, 'invoice.cancelled_demo', user.name, `Cancelled ${invoice.number} in demo mode`);
    res.json({ invoice: getInvoice(user.workspaceId, invoice.id), mode: 'demo', message: 'Invoice cancelled in demo mode.' });
  }),
);

invoicesRouter.post(
  '/:id/reconcile',
  asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const invoice = getInvoice(user.workspaceId, String(req.params.id));
    if (!invoice) return notFound(res, 'Invoice');
    if (!invoice.paypalInvoiceId) {
      res.status(409).json({ error: 'This invoice has no PayPal invoice ID. It was never sent through PayPal.' });
      return;
    }
    if (!paypalConfigured()) {
      res.status(409).json({ error: 'PayPal server credentials are not configured.' });
      return;
    }
    try {
      const updated = await syncInvoiceFromPaypal(user.workspaceId, invoice.id);
      addAuditEvent(user.workspaceId, 'invoice.reconciled', user.name, `Reconciled ${invoice.number} with PayPal`);
      res.json({ invoice: updated, message: 'PayPal state retrieved and applied.' });
    } catch (error) {
      const message = error instanceof PaypalError ? error.detail : 'PayPal reconciliation failed.';
      res.status(502).json({ error: message });
    }
  }),
);
