import { useEffect, useState } from 'react';
import type { AuditEvent, SettingsState, WebhookEventRecord } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { formatDateTime, titleCase } from '../lib/format';
import {
  CopyButton,
  ErrorState,
  Icon,
  LoadingBlock,
  PageHeader,
  Spinner,
  StatusBadge,
  Tabs,
} from '../components/ui';

interface SettingsResponse {
  settings: SettingsState;
  audit: AuditEvent[];
  webhookEvents: WebhookEventRecord[];
}

const TABS = [
  { value: 'paypal', label: 'PayPal gateway' },
  { value: 'policy', label: 'AI & Sentinel' },
  { value: 'audit', label: 'Audit & webhooks' },
  { value: 'profile', label: 'Business profile' },
];

function actionLabel(action: string): string {
  return action
    .split('.')
    .map((part) => titleCase(part))
    .join(' · ');
}

export default function Settings() {
  const { toast, confirm, refreshSession, user } = useApp();
  const [tab, setTab] = useState('paypal');
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [minimumObservations, setMinimumObservations] = useState('3');
  const [thresholdPercent, setThresholdPercent] = useState('5');
  const [renewalLeadDays, setRenewalLeadDays] = useState('14');
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; environment: string; detail: string } | null>(null);
  const [resetting, setResetting] = useState(false);

  const applySettings = (settings: SettingsState) => {
    setData((current) => (current ? { ...current, settings } : current));
    setWorkspaceName(settings.workspace.name);
    setProfileName(settings.profile.name);
    setMinimumObservations(String(settings.sentinel.minimumObservations));
    setThresholdPercent((settings.sentinel.priceChangeThresholdBps / 100).toFixed(1));
    setRenewalLeadDays(String(settings.sentinel.renewalLeadDays));
  };

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<SettingsResponse>('/settings')
      .then((response) => {
        setData(response);
        setWorkspaceName(response.settings.workspace.name);
        setProfileName(response.settings.profile.name);
        setMinimumObservations(String(response.settings.sentinel.minimumObservations));
        setThresholdPercent((response.settings.sentinel.priceChangeThresholdBps / 100).toFixed(1));
        setRenewalLeadDays(String(response.settings.sentinel.renewalLeadDays));
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorkspaceError(null);
    if (!workspaceName.trim()) return setWorkspaceError('Enter a workspace name.');
    if (!profileName.trim()) return setWorkspaceError('Enter a profile name.');
    setSavingWorkspace(true);
    try {
      const result = await api.put<{ settings: SettingsState }>('/settings/workspace', {
        workspaceName: workspaceName.trim(),
        profileName: profileName.trim(),
      });
      applySettings(result.settings);
      await refreshSession();
      toast('Workspace and profile names saved.', 'success');
      load();
    } catch (err) {
      setWorkspaceError(errorMessage(err));
    } finally {
      setSavingWorkspace(false);
    }
  };

  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    setPolicyError(null);
    const observations = Number.parseInt(minimumObservations, 10);
    const thresholdBps = Math.round((Number.parseFloat(thresholdPercent) || 0) * 100);
    const leadDays = Number.parseInt(renewalLeadDays, 10);
    if (!Number.isInteger(observations) || observations < 3 || observations > 12) {
      return setPolicyError('Minimum observations must be a whole number from 3 to 12.');
    }
    if (!Number.isFinite(thresholdBps) || thresholdBps < 100 || thresholdBps > 10_000) {
      return setPolicyError('Price-change threshold must be between 1% and 100%.');
    }
    if (!Number.isInteger(leadDays) || leadDays < 1 || leadDays > 60) {
      return setPolicyError('Renewal lead time must be a whole number from 1 to 60 days.');
    }
    setSavingPolicy(true);
    try {
      const result = await api.put<{ settings: SettingsState }>('/settings/sentinel', {
        minimumObservations: observations,
        priceChangeThresholdBps: thresholdBps,
        renewalLeadDays: leadDays,
      });
      applySettings(result.settings);
      toast('Sentinel policy updated.', 'success');
      load();
    } catch (err) {
      setPolicyError(errorMessage(err));
    } finally {
      setSavingPolicy(false);
    }
  };

  const testPaypal = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.get<{ ok: boolean; environment: string; detail: string }>('/settings/paypal/test');
      setTestResult(result);
      toast(result.ok ? 'PayPal OAuth succeeded.' : 'PayPal OAuth did not succeed.', result.ok ? 'success' : 'info');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setTesting(false);
    }
  };

  const resetDemo = async () => {
    const ok = await confirm({
      title: 'Reset all demo data?',
      message:
        'Every local invoice, transaction, expense, budget, Sentinel decision, and audit record is deleted and the seeded Northstar workspace is restored. PayPal is not contacted and no PayPal resources are changed.',
      confirmLabel: 'Reset demo data',
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    try {
      await api.post<{ message: string }>('/settings/demo-reset', { confirm: true });
      await refreshSession();
      load();
      toast('Demo data reset. No PayPal resources were touched.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setResetting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <LoadingBlock label="Loading settings" rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error ?? 'Settings could not load.'} onRetry={load} />;
  }

  const { settings, audit, webhookEvents } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Workspace configuration
          </>
        }
        title="Settings"
        description="Payment gateway status, deterministic policy, audit history, and the local demo profile. Secrets are never shown."
        actions={
          <span className="chip-outline">
            <span className={`h-1.5 w-1.5 rounded-full ${settings.paypal.configured ? 'bg-ink-solid' : 'bg-ink-muted'}`} />
            {settings.paypal.configured ? 'PayPal configured' : 'Demo mode'}
          </span>
        }
      />

      <Tabs value={tab} onChange={setTab} options={TABS} />

      {tab === 'paypal' ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <section className="card lg:col-span-8">
            <div className="flex flex-col gap-3 border-b border-stroke-line p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                  <Icon name="account_balance_wallet" className="text-[22px]" />
                </div>
                <div>
                  <h2 className="text-headline-sm text-ink-solid">PayPal Invoicing API v2</h2>
                  <p className="mt-0.5 text-caption-micro text-ink-slate">
                    Server-side OAuth · {settings.paypal.environment} environment
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex h-7 items-center gap-1.5 self-start rounded-full px-3 text-label-sm sm:self-auto ${
                  settings.paypal.configured ? 'bg-ink-solid text-on-primary' : 'border border-stroke-line text-ink-slate'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${settings.paypal.configured ? 'bg-on-primary' : 'bg-ink-muted'}`} />
                {settings.paypal.statusLabel}
              </span>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-body-md leading-relaxed text-ink-slate">{settings.paypal.detail}</p>

              {!settings.paypal.configured ? (
                <InlineAlert title="Demo mode is active">
                  <p>
                    Set <code className="rounded bg-surface-container px-1 py-0.5 text-label-sm">PAYPAL_CLIENT_ID</code> and{' '}
                    <code className="rounded bg-surface-container px-1 py-0.5 text-label-sm">PAYPAL_CLIENT_SECRET</code> in the
                    server environment, then restart the API. Invoices can still be marked sent in demo mode, but no email or
                    PayPal invoice is created.
                  </p>
                </InlineAlert>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                  <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Client ID</p>
                  <p className="mt-1.5 font-mono text-body-md font-medium text-ink-solid">{settings.paypal.clientIdHint}</p>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">Only the last 4 characters are exposed.</p>
                </div>
                <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                  <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Client secret</p>
                  <p className="mt-1.5 text-body-md font-medium text-ink-solid">Server-side only</p>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">Never sent to this browser or written to logs.</p>
                </div>
                <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                  <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Webhook verification</p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-body-md font-medium text-ink-solid">
                    <Icon name={settings.paypal.webhookConfigured ? 'check_circle' : 'warning'} className="text-[17px]" />
                    {settings.paypal.webhookConfigured ? 'Webhook ID configured' : 'Webhook ID missing'}
                  </p>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">
                    {settings.paypal.webhookConfigured
                      ? 'Every delivery is signature-verified before processing.'
                      : 'Unsigned or unverifiable events are rejected.'}
                  </p>
                </div>
                <div className="rounded-xl border border-stroke-line bg-surface-container-low/50 p-4">
                  <p className="text-caption-micro uppercase tracking-wider text-ink-slate">Environment</p>
                  <p className="mt-1.5 text-body-md font-medium text-ink-solid">{titleCase(settings.paypal.environment)}</p>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">
                    {settings.paypal.environment === 'live'
                      ? 'Live credentials are configured. Real invoices may be created.'
                      : 'Sandbox mode. No production funds are accessed.'}
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
                  {['INVOICING.INVOICE.PAID', 'INVOICING.INVOICE.UPDATED', 'INVOICING.INVOICE.REFUNDED', 'INVOICING.INVOICE.CANCELLED'].map(
                    (event) => (
                      <span key={event} className="rounded bg-surface-container px-2 py-1 font-mono text-caption-micro text-ink-graphite">
                        {event}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-stroke-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-label-sm font-medium text-ink-solid">Connection test</p>
                  <p className="mt-0.5 text-caption-micro text-ink-slate">Requests a server-side OAuth token. No invoice is created.</p>
                </div>
                <button type="button" className="btn btn-secondary shrink-0" onClick={testPaypal} disabled={testing}>
                  {testing ? <Spinner className="h-4 w-4" /> : <Icon name="cable" className="text-[17px]" />}
                  {testing ? 'Testing' : 'Test connection'}
                </button>
              </div>

              {testResult ? (
                <InlineAlert tone={testResult.ok ? 'success' : 'error'} title={testResult.ok ? 'OAuth succeeded' : 'OAuth failed'}>
                  {testResult.detail}
                </InlineAlert>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col gap-5 lg:col-span-4">
            <section className="card p-5">
              <h2 className="text-headline-sm text-ink-solid">How reconciliation works</h2>
              <ul className="mt-3 space-y-2.5 text-body-md text-ink-graphite">
                {[
                  'Webhook signatures are verified with PayPal before any record changes.',
                  'Event IDs are deduplicated so retries do not double-count payments.',
                  'Paid, partial, pending, refunded, and cancelled states are mapped from PayPal’s authoritative invoice data.',
                  'The public payment page never marks an invoice paid on browser return.',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Icon name="check" className="mt-0.5 text-[17px] text-ink-solid" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card p-4">
              <div className="flex items-start gap-2.5 text-caption-micro leading-relaxed text-ink-slate">
                <Icon name="lock" className="mt-px text-[16px] text-ink-solid" />
                <span>
                  Credentials are read from server environment variables at startup. This settings screen is read-only for
                  secrets by design.
                </span>
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === 'policy' ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <form onSubmit={savePolicy} className="card p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <div>
                <h2 className="text-headline-sm text-ink-solid">Sentinel policy</h2>
                <p className="mt-0.5 text-caption-micro text-ink-muted">
                  Applies to new scans and decisions, not retroactively to evidence.
                </p>
              </div>
              <Icon name="radar" className="text-[20px] text-ink-muted" />
            </div>

            {policyError ? (
              <div className="mt-4">
                <InlineAlert tone="error">{policyError}</InlineAlert>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="min-observations">
                  Minimum observations
                </label>
                <input
                  id="min-observations"
                  type="number"
                  min={3}
                  max={12}
                  step={1}
                  className="input tabular-nums"
                  value={minimumObservations}
                  onChange={(event) => setMinimumObservations(event.target.value)}
                  disabled={savingPolicy}
                />
                <p className="field-hint">3–12 matching charges</p>
              </div>
              <div>
                <label className="field-label" htmlFor="price-threshold">
                  Price-change threshold
                </label>
                <div className="relative">
                  <input
                    id="price-threshold"
                    type="number"
                    min={1}
                    max={100}
                    step={0.1}
                    className="input pr-8 tabular-nums"
                    value={thresholdPercent}
                    onChange={(event) => setThresholdPercent(event.target.value)}
                    disabled={savingPolicy}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-label-md text-ink-muted">%</span>
                </div>
                <p className="field-hint">1–100% increase</p>
              </div>
              <div>
                <label className="field-label" htmlFor="renewal-lead">
                  Renewal lead time
                </label>
                <div className="relative">
                  <input
                    id="renewal-lead"
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    className="input pr-10 tabular-nums"
                    value={renewalLeadDays}
                    onChange={(event) => setRenewalLeadDays(event.target.value)}
                    disabled={savingPolicy}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-label-md text-ink-muted">days</span>
                </div>
                <p className="field-hint">1–60 days before renewal</p>
              </div>
            </div>

            <button type="submit" className="btn btn-primary mt-5" disabled={savingPolicy}>
              {savingPolicy ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[17px]" />}
              {savingPolicy ? 'Saving' : 'Save policy'}
            </button>

            <p className="mt-3 text-caption-micro leading-relaxed text-ink-muted">
              Current policy: {settings.sentinel.minimumObservations} observations · {(settings.sentinel.priceChangeThresholdBps / 100).toFixed(1)}%
              price threshold · {settings.sentinel.renewalLeadDays}-day renewal lead.
            </p>
          </form>

          <div className="flex flex-col gap-5 lg:col-span-5">
            <section className="card p-5">
              <div className="flex items-center justify-between border-b border-stroke-line pb-3">
                <h2 className="text-headline-sm text-ink-solid">Gemini Copilot</h2>
                <StatusBadge status={settings.gemini.configured ? 'live' : 'deterministic'} label={settings.gemini.configured ? 'Configured' : 'Deterministic'} />
              </div>
              <dl className="mt-4 space-y-3 text-label-md">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Mode</dt>
                  <dd className="text-ink-solid">{settings.gemini.mode === 'live' ? 'Gemini explanation' : 'Local deterministic'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Model</dt>
                  <dd className="font-mono text-label-sm text-ink-solid">{settings.gemini.model ?? 'Not configured'}</dd>
                </div>
              </dl>
              <p className="mt-4 text-caption-micro leading-relaxed text-ink-slate">
                {settings.gemini.configured
                  ? 'The server calculates all figures, then sends the question and calculated facts to Gemini for explanation.'
                  : 'No GEMINI_API_KEY is configured. Copilot answers are generated locally from deterministic calculations.'}
              </p>
            </section>

            <section className="card p-5">
              <h2 className="text-headline-sm text-ink-solid">Usage telemetry</h2>
              <p className="mt-2 text-body-md leading-relaxed text-ink-slate">
                Sentinel does not receive usage data from subscription providers. It can evidence charges, cadence, and price
                changes, but it must not claim a service is used or unused.
              </p>
              <p className="mt-3 rounded-lg bg-surface-container-low p-3 text-caption-micro text-ink-slate">
                Connecting usage data would require separate provider integrations. None are configured in this build.
              </p>
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'audit' ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <section className="card overflow-hidden lg:col-span-7">
            <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
              <div>
                <h2 className="text-headline-sm text-ink-solid">Audit history</h2>
                <p className="mt-0.5 text-caption-micro text-ink-muted">Local records of actions taken in this workspace</p>
              </div>
              <span className="chip-outline">{audit.length}</span>
            </div>
            {audit.length === 0 ? (
              <p className="px-5 py-10 text-center text-body-md text-ink-muted">No audit events recorded.</p>
            ) : (
              <ul className="max-h-[520px] divide-y divide-stroke-line overflow-y-auto scroll-thin">
                {audit.map((event) => (
                  <li key={event.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-label-md font-medium text-ink-solid">{actionLabel(event.action)}</p>
                        <p className="mt-0.5 text-caption-micro leading-relaxed text-ink-slate">{event.detail}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-caption-micro text-ink-muted">{event.actor}</p>
                        <p className="mt-0.5 text-caption-micro text-ink-muted">{formatDateTime(event.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden lg:col-span-5">
            <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
              <div>
                <h2 className="text-headline-sm text-ink-solid">Webhook deliveries</h2>
                <p className="mt-0.5 text-caption-micro text-ink-muted">Verified PayPal events received by the server</p>
              </div>
              <span className="chip-outline">{webhookEvents.length}</span>
            </div>
            {webhookEvents.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Icon name="webhook" className="text-[26px] text-ink-muted" />
                <p className="mt-2 text-body-md text-ink-muted">No webhook events received.</p>
                <p className="mt-1 text-caption-micro text-ink-muted">
                  {settings.paypal.webhookConfigured
                    ? 'Deliveries will appear here after PayPal sends them.'
                    : 'Configure PAYPAL_WEBHOOK_ID to verify deliveries.'}
                </p>
              </div>
            ) : (
              <ul className="max-h-[520px] divide-y divide-stroke-line overflow-y-auto scroll-thin">
                {webhookEvents.map((event) => (
                  <li key={event.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-caption-micro text-ink-graphite">{event.eventType}</p>
                      <StatusBadge status={event.processingState} />
                    </div>
                    <p className="mt-1 text-caption-micro text-ink-slate">{event.note}</p>
                    <p className="mt-1 text-caption-micro text-ink-muted">
                      {event.providerEventId} · {formatDateTime(event.receivedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'profile' ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <form onSubmit={saveWorkspace} className="card p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">Workspace &amp; profile</h2>
              <span className="chip">{settings.demoSession ? 'Demo session' : 'Signed in'}</span>
            </div>

            {workspaceError ? (
              <div className="mt-4">
                <InlineAlert tone="error">{workspaceError}</InlineAlert>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="workspace-name">
                  Workspace name
                </label>
                <input
                  id="workspace-name"
                  className="input"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  maxLength={120}
                  disabled={savingWorkspace}
                  required
                />
                <p className="field-hint">Shown in the sidebar and on payment pages.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="profile-name">
                  Your name
                </label>
                <input
                  id="profile-name"
                  className="input"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  maxLength={120}
                  disabled={savingWorkspace}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="profile-email">
                  Email
                </label>
                <input id="profile-email" className="input" value={settings.profile.email} readOnly disabled />
                <p className="field-hint">Sign-in email is fixed in this demo.</p>
              </div>
              <div>
                <span className="field-label">Workspace identifier</span>
                <div className="flex h-11 items-center rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  mergin.example / {settings.workspace.slug}
                </div>
              </div>
              <div>
                <span className="field-label">Currency &amp; timezone</span>
                <div className="flex h-11 items-center rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  {settings.workspace.currency} · {settings.workspace.timezone}
                </div>
                <p className="field-hint">Fixed demo values; all money is stored in integer cents.</p>
              </div>
            </div>

            <button type="submit" className="btn btn-primary mt-5" disabled={savingWorkspace}>
              {savingWorkspace ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[17px]" />}
              {savingWorkspace ? 'Saving' : 'Save changes'}
            </button>
          </form>

          <div className="flex flex-col gap-5 lg:col-span-5">
            <section className="card p-5">
              <h2 className="text-headline-sm text-ink-solid">Session</h2>
              <dl className="mt-3 space-y-2 text-label-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Signed in as</dt>
                  <dd className="text-ink-solid">{user?.name ?? settings.profile.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="text-ink-solid">{settings.profile.email}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Session type</dt>
                  <dd className="text-ink-solid">{settings.demoSession ? 'One-click demo session' : 'Password sign-in'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">App base URL</dt>
                  <dd className="truncate font-mono text-caption-micro text-ink-graphite">{settings.appBaseUrl}</dd>
                </div>
              </dl>
            </section>

            <section className="card border-ink-solid/30 p-5">
              <div className="flex items-center gap-2">
                <Icon name="restart_alt" className="text-[19px] text-ink-solid" />
                <h2 className="text-headline-sm text-ink-solid">Reset demo data</h2>
              </div>
              <p className="mt-2 text-body-md leading-relaxed text-ink-slate">
                Restores the seeded Northstar workspace. Local changes, including demo payments and Sentinel decisions, are
                discarded. PayPal is never contacted.
              </p>
              <button type="button" className="btn btn-danger mt-4 w-full" onClick={resetDemo} disabled={resetting}>
                {resetting ? <Spinner className="h-4 w-4" /> : <Icon name="restart_alt" className="text-[17px]" />}
                {resetting ? 'Resetting' : 'Reset demo data'}
              </button>
            </section>

            <section className="card p-4">
              <div className="flex items-start gap-2.5 text-caption-micro leading-relaxed text-ink-slate">
                <Icon name="info" className="mt-px text-[16px] text-ink-solid" />
                <span>
                  This build has a single demo user and no team invitation or role system. No email is sent by the app.
                </span>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
