import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { invoicesRouter } from './routes/invoices';
import { payRouter } from './routes/payments';
import { financesRouter } from './routes/finances';
import { sentinelRouter } from './routes/sentinel';
import { copilotRouter } from './routes/copilot';
import { settingsRouter, onboardingRouter } from './routes/settings';
import { webhookRouter } from './routes/webhooks';
import { config } from './config';
import { apiLimiter, sameOriginOnly, securityHeaders } from './security';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', apiLimiter);
  app.use('/api', sameOriginOnly);
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        (req as Request & { rawBody?: string }).rawBody = buffer.toString('utf8');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mergin-api', environment: config.paypal.environment });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/pay', payRouter);
  app.use('/api', webhookRouter);

  app.use('/api/invoices', requireAuth, invoicesRouter);
  app.use('/api', requireAuth, financesRouter);
  app.use('/api/sentinel', requireAuth, sentinelRouter);
  app.use('/api/copilot', requireAuth, copilotRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/onboarding', requireAuth, onboardingRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[mergin-api]', error);
    res.status(500).json({ error: 'Unexpected server error.' });
  });

  return app;
}
