import { Router } from 'express';
import { paypalConfigured, paypalWebhookConfigured } from '../config';
import { asyncRoute } from '../http';
import { PaypalError, verifyPaypalWebhook } from '../services/paypal';
import { processPaypalWebhook } from '../services/webhook';

export const webhookRouter = Router();

webhookRouter.post(
  '/paypal/webhook',
  asyncRoute(async (req, res) => {
    if (!paypalConfigured()) {
      res.status(503).json({
        error: 'PayPal credentials are not configured on the server. Webhook verification requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
      });
      return;
    }
    if (!paypalWebhookConfigured()) {
      res.status(503).json({
        error:
          'PAYPAL_WEBHOOK_ID is not configured. Create a webhook in the PayPal Developer Dashboard for INVOICING.INVOICE.* events, then set PAYPAL_WEBHOOK_ID.',
      });
      return;
    }

    const rawBody = (req as typeof req & { rawBody?: string }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Raw webhook body is unavailable.' });
      return;
    }
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload.' });
      return;
    }

    try {
      const verified = await verifyPaypalWebhook(req.headers, event);
      if (!verified) {
        res.status(400).json({ error: 'PayPal webhook signature verification failed.' });
        return;
      }
    } catch (error) {
      const message = error instanceof PaypalError ? error.detail : 'Webhook verification request failed.';
      res.status(502).json({ error: message });
      return;
    }

    const outcome = await processPaypalWebhook(event as Parameters<typeof processPaypalWebhook>[0]);
    res.status(outcome.state === 'failed' ? 500 : 200).json(outcome);
  }),
);
