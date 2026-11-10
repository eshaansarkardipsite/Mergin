import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SettingsState } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { CopyButton, Icon, LoadingBlock, Spinner } from '../components/ui';
import { OnboardingShell } from '../components/OnboardingShell';

interface SettingsResponse {
  settings: SettingsState;
}

export default function OnboardingPaypal() {
  const { toast } = useApp();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; environment: string; detail: string } | null>(null);

  useEffect(() => {
    api
      .get<SettingsResponse>('/settings')
      .then((data) => setSettings(data.settings))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.get<{ ok: boolean; environment: string; detail: string }>('/settings/paypal/test');
      setTestResult(result);
      toast(result.ok ? 'PayPal OAuth succeeded.' : 'PayPal is not connected yet.', result.ok ? 'success' : 'info');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <OnboardingShell
      step={2}
      eyebrow="Authorization pipeline"
      title="Connect the PayPal Sandbox gateway"
      description="PayPal credentials are read server-side only. The browser never sees the client secret."
      width="max-w-4xl"
    >
      {loading ? (
        <LoadingBlock label="Loading PayPal status" />
      ) : !settings ? (
        <InlineAlert tone="error" title="PayPal status could not load">
          {error}
        </InlineAlert>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-stroke-line p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                <Icon name="account_balance_wallet" className="text-[24px]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-headline-sm text-ink-solid">PayPal Invoicing REST API v2</h2>
                  <span className="chip">OAuth 2.0</span>
                </div>
                <p className="mt-1 text-label-sm text-ink-slate">
                  Server-side OAuth · {settings.paypal.environment === 'live' ? 'Live' : 'Sandbox'} environment
                </p>
              </div>
            </div>
            <span
              className={`inline-flex h-7 items-center gap-1.5 self-start rounded-full px-3 text-label-sm sm:self-auto ${
                settings.paypal.configured ? 'bg-ink-solid text-on-primary' : 'border border-stroke-line text-ink-slate'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${settings.paypal.configured ? 'bg-on-primary' : 'bg-ink-muted'}`} />
              {settings.paypal.configured ? 'Credentials configured' : 'Not connected'}
            </span>
          </div>

          <div className="border-b border-stroke-line bg-surface-container-low/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-ink-graphite">
              <Icon name="verified_user" className="text-[18px] text-ink-solid" />
              <span className="font-medium">Environment: {settings.paypal.environment}</span>
              <span className="text-ink-slate">
                {settings.paypal.environment === 'live'
                  ? 'Live credentials are configured. Real invoices can be sent.'
                  : 'Sandbox only — no real monetary funds are accessed by this app.'}
              </span>
            </div>
          </div>

          <div className="space-y-5 p-6">
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

            {!settings.paypal.configured ? (
              <InlineAlert title="Demo mode is active">
                <p>
                  Set <code className="rounded bg-surface-container px-1 py-0.5 text-label-sm">PAYPAL_CLIENT_ID</code> and{' '}
                  <code className="rounded bg-surface-container px-1 py-0.5 text-label-sm">PAYPAL_CLIENT_SECRET</code> on the
                  server, then restart the API. Until then, invoices can be marked sent in demo mode only — no email is
                  delivered and no PayPal invoice is created.
                </p>
              </InlineAlert>
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Business account</p>
                <p className="mt-1.5 text-body-md font-medium text-ink-solid">
                  {settings.paypal.configured ? 'Sandbox merchant connected' : 'Not connected'}
                </p>
                <p className="mt-0.5 text-caption-micro text-ink-muted">
                  {settings.paypal.configured
                    ? 'Merchant identity is held by PayPal; no email is stored.'
                    : 'No merchant is linked in demo mode.'}
                </p>
              </div>
              <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Client ID</p>
                <p className="mt-1.5 font-mono text-body-md font-medium text-ink-solid">{settings.paypal.clientIdHint}</p>
                <p className="mt-0.5 text-caption-micro text-ink-muted">Only the last 4 characters are ever shown.</p>
              </div>
              <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Client secret</p>
                <p className="mt-1.5 text-body-md font-medium text-ink-solid">Stored server-side only</p>
                <p className="mt-0.5 text-caption-micro text-ink-muted">
                  Never sent to the browser, logged, or committed. Set via environment variable.
                </p>
              </div>
              <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Webhook verification</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-body-md font-medium text-ink-solid">
                  <Icon
                    name={settings.paypal.webhookConfigured ? 'check_circle' : 'warning'}
                    className="text-[17px]"
                  />
                  {settings.paypal.webhookConfigured ? 'Webhook ID configured' : 'Webhook ID missing'}
                </p>
                <p className="mt-0.5 text-caption-micro text-ink-muted">
                  {settings.paypal.webhookConfigured
                    ? 'Signatures are verified on every delivery.'
                    : 'Set PAYPAL_WEBHOOK_ID to verify signatures. Unsigned events are rejected.'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-stroke-line p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-label-sm font-medium text-ink-solid">Webhook ingestion endpoint</p>
                  <p className="mt-1 truncate font-mono text-caption-micro text-ink-graphite">{settings.webhookUrl}</p>
                </div>
                <CopyButton value={settings.webhookUrl} label="Copy URL" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  'INVOICING.INVOICE.PAID',
                  'INVOICING.INVOICE.UPDATED',
                  'INVOICING.INVOICE.REFUNDED',
                  'INVOICING.INVOICE.CANCELLED',
                ].map((event) => (
                  <span key={event} className="rounded bg-surface-container px-2 py-1 font-mono text-caption-micro text-ink-graphite">
                    {event}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-caption-micro leading-relaxed text-ink-muted">
                PayPal sends the transmission headers. The server calls PayPal's verify-webhook-signature endpoint before
                processing, then deduplicates by event ID.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-stroke-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-label-sm font-medium text-ink-solid">Connection test</p>
                <p className="mt-0.5 text-caption-micro text-ink-slate">
                  Requests a server-side OAuth token. No invoice is created.
                </p>
              </div>
              <button type="button" className="btn btn-secondary shrink-0" onClick={test} disabled={testing}>
                {testing ? <Spinner className="h-4 w-4" /> : <Icon name="cable" className="text-[17px]" />}
                {testing ? 'Testing' : 'Test connection'}
              </button>
            </div>

            {testResult ? (
              <InlineAlert tone={testResult.ok ? 'success' : 'error'} title={testResult.ok ? 'OAuth succeeded' : 'Not connected'}>
                {testResult.detail}
              </InlineAlert>
            ) : null}
          </div>

          <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-stroke-line bg-surface-container-low/40 px-6 py-4 sm:flex-row sm:items-center">
            <Link to="/onboarding/business" className="btn btn-ghost self-start">
              <Icon name="arrow_back" className="text-[17px]" />
              Business profile
            </Link>
            <Link to="/app" className="btn btn-primary">
              Continue to dashboard
              <Icon name="arrow_forward" className="text-[17px]" />
            </Link>
          </div>
        </div>
      )}
    </OnboardingShell>
  );
}
