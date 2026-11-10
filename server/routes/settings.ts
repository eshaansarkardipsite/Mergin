import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth';
import { config, geminiConfigured, paypalConfigured, paypalWebhookConfigured, webhookUrl } from '../config';
import {
  addAuditEvent,
  getSessionUser,
  getWorkspace,
  getWorkspaceSettings,
  listAuditEvents,
  listWebhookEvents,
  renameWorkspace,
  updateProfile,
  updateWorkspaceSettings,
} from '../db/repo';
import { resetDemoData } from '../db/reset';
import { parseBody } from '../http';
import { testPaypalConnection } from '../services/paypal';
import type { SettingsState } from '../../shared/types';

export const settingsRouter = Router();
export const onboardingRouter = Router();

function buildSettings(userId: string, workspaceId: string, demoSession: boolean): SettingsState {
  const workspace = getWorkspace(workspaceId);
  const profile = getSessionUser(userId)!;
  const policy = getWorkspaceSettings(workspaceId);
  const paypalReady = paypalConfigured();
  const webhookReady = paypalWebhookConfigured();
  return {
    workspace,
    profile: { name: profile.name, email: profile.email },
    paypal: {
      environment: config.paypal.environment,
      configured: paypalReady,
      connected: paypalReady,
      webhookConfigured: webhookReady,
      statusLabel: paypalReady ? (webhookReady ? 'Credentials configured' : 'Credentials configured · webhook missing') : 'Not configured',
      detail: paypalReady
        ? 'Server-side credentials are present. Run the connection test to verify OAuth.'
        : 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server to enable Sandbox invoices.',
      clientIdHint: paypalReady ? `••••${config.paypal.clientId.slice(-4)}` : 'Not connected',
    },
    gemini: {
      configured: geminiConfigured(),
      model: geminiConfigured() ? config.gemini.model || 'gemini-2.5-flash' : null,
      mode: geminiConfigured() ? 'live' : 'deterministic',
    },
    sentinel: {
      minimumObservations: policy.sentinelMinObservations,
      priceChangeThresholdBps: policy.priceChangeThresholdBps,
      renewalLeadDays: policy.renewalLeadDays,
    },
    demoMode: !paypalReady,
    demoSession,
    appBaseUrl: config.appBaseUrl,
    webhookUrl: webhookUrl(),
  };
}

settingsRouter.get('/', (req, res) => {
  const user = currentUser(req);
  res.json({
    settings: buildSettings(user.id, user.workspaceId, user.demo),
    audit: listAuditEvents(user.workspaceId),
    webhookEvents: listWebhookEvents(user.workspaceId),
  });
});

const workspaceSchema = z
  .object({
    workspaceName: z.string().trim().min(1).max(120).optional(),
    profileName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.workspaceName || value.profileName, { message: 'Provide a workspace or profile name.' });

settingsRouter.put('/workspace', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(workspaceSchema, req, res);
  if (!input) return;
  if (input.workspaceName) renameWorkspace(user.workspaceId, input.workspaceName);
  if (input.profileName) updateProfile(user.id, input.profileName);
  addAuditEvent(
    user.workspaceId,
    'settings.workspace_updated',
    user.name,
    [input.workspaceName, input.profileName].filter(Boolean).join(' · '),
  );
  res.json({ settings: buildSettings(user.id, user.workspaceId, user.demo) });
});

const sentinelPolicySchema = z.object({
  minimumObservations: z.number().int().min(3).max(12),
  priceChangeThresholdBps: z.number().int().min(100).max(10_000),
  renewalLeadDays: z.number().int().min(1).max(60),
});

settingsRouter.put('/sentinel', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(sentinelPolicySchema, req, res);
  if (!input) return;
  updateWorkspaceSettings(user.workspaceId, {
    sentinelMinObservations: input.minimumObservations,
    priceChangeThresholdBps: input.priceChangeThresholdBps,
    renewalLeadDays: input.renewalLeadDays,
  });
  addAuditEvent(
    user.workspaceId,
    'settings.sentinel_updated',
    user.name,
    `Min observations ${input.minimumObservations} · threshold ${(input.priceChangeThresholdBps / 100).toFixed(1)}% · lead ${input.renewalLeadDays}d`,
  );
  res.json({ settings: buildSettings(user.id, user.workspaceId, user.demo) });
});

settingsRouter.get('/paypal/test', async (req, res) => {
  const user = currentUser(req);
  const result = await testPaypalConnection();
  addAuditEvent(
    user.workspaceId,
    'settings.paypal_tested',
    user.name,
    `${result.ok ? 'OAuth succeeded' : 'OAuth failed'} · ${result.environment}`,
  );
  res.json(result);
});

const confirmSchema = z.object({ confirm: z.literal(true) });

settingsRouter.post('/demo-reset', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(confirmSchema, req, res);
  if (!input) return;
  resetDemoData();
  addAuditEvent(user.workspaceId, 'settings.demo_reset', user.name, 'Demo data reset. No PayPal resources were touched.');
  res.json({ ok: true, message: 'Demo data reset. No PayPal resources were touched.' });
});

// ---------- onboarding ----------

onboardingRouter.get('/', (req, res) => {
  const user = currentUser(req);
  const workspace = getWorkspace(user.workspaceId);
  res.json({
    workspace,
    demoSession: user.demo,
    paypal: {
      environment: config.paypal.environment,
      configured: paypalConfigured(),
      webhookConfigured: paypalWebhookConfigured(),
      appBaseUrl: config.appBaseUrl,
    },
    geminiConfigured: geminiConfigured(),
  });
});

onboardingRouter.put('/business', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(z.object({ name: z.string().trim().min(1).max(120) }), req, res);
  if (!input) return;
  renameWorkspace(user.workspaceId, input.name);
  updateProfile(user.id, user.name);
  addAuditEvent(user.workspaceId, 'onboarding.business_updated', user.name, `Workspace renamed to ${input.name}`);
  res.json({ workspace: getWorkspace(user.workspaceId) });
});
