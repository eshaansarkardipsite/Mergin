import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Workspace } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import { InlineAlert } from '../context/AppContext';
import { CopyButton, Icon, LoadingBlock, Spinner } from '../components/ui';
import { OnboardingShell, OnboardingStepperFooter } from '../components/OnboardingShell';

interface OnboardingState {
  workspace: Workspace;
  demoSession: boolean;
  paypal: { environment: string; configured: boolean; webhookConfigured: boolean; appBaseUrl: string };
  geminiConfigured: boolean;
}

export default function OnboardingBusiness() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OnboardingState>('/onboarding')
      .then((data) => {
        setState(data);
        setName(data.workspace.name);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Enter a business name to continue.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.put<{ workspace: Workspace }>('/onboarding/business', { name: name.trim() });
      toast('Business profile saved.', 'success');
      navigate('/onboarding/paypal');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell
      step={1}
      eyebrow="Workspace initialization"
      title="Set up your business workspace"
      description="Configure the company identity that appears on invoices and across the workspace."
    >
      {loading ? (
        <LoadingBlock label="Loading workspace setup" />
      ) : error && !state ? (
        <InlineAlert tone="error" title="Setup could not load">
          {error}
        </InlineAlert>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          <form onSubmit={save} className="card flex flex-col gap-5 p-6 lg:col-span-8">
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="business-name">
                  Legal entity name
                </label>
                <input
                  id="business-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your company name"
                  maxLength={120}
                  required
                  disabled={saving}
                />
                <p className="field-hint">Printed on invoices and shown in the workspace switcher.</p>
              </div>

              <div>
                <span className="field-label">Workspace identifier</span>
                <div className="flex h-11 items-center gap-1 rounded-xl border border-stroke-line bg-surface-container-low px-3.5">
                  <span className="select-none text-body-md text-ink-muted">mergin.example/</span>
                  <span className="min-w-0 flex-1 truncate text-body-md text-ink-solid">{slug || 'workspace'}</span>
                  <CopyButton value={`https://mergin.example/${slug || 'workspace'}`} label="" />
                </div>
                <p className="field-hint">Display-only placeholder domain. No public portal is hosted.</p>
              </div>

              <div>
                <span className="field-label">Operating currency</span>
                <div className="flex h-11 items-center rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  USD — United States Dollar
                </div>
                <p className="field-hint">Fixed in this MVP. All money is stored in integer cents.</p>
              </div>

              <div>
                <span className="field-label">Industry</span>
                <div className="flex h-11 items-center rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  Design &amp; digital product studio
                </div>
                <p className="field-hint">Fixed in this demo; chart-of-accounts presets are not configurable.</p>
              </div>

              <div>
                <span className="field-label">Accounting timezone</span>
                <div className="flex h-11 items-center rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  America/New_York
                </div>
                <p className="field-hint">Stored on the workspace record; not editable in this build.</p>
              </div>
            </div>

            <div className="rounded-xl border border-stroke-line bg-surface-container-low/60 p-4">
              <p className="text-label-md font-medium text-ink-solid">What saves now</p>
              <p className="mt-1 text-caption-micro leading-relaxed text-ink-slate">
                Only the business name is writable through this step. Currency, timezone, and industry remain fixed demo
                values so the seeded ledger stays internally consistent.
              </p>
            </div>

            <OnboardingStepperFooter
              next={
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Spinner className="h-4 w-4" /> : null}
                  {saving ? 'Saving' : 'Save and continue'}
                  {!saving ? <Icon name="arrow_forward" className="text-[17px]" /> : null}
                </button>
              }
            />
          </form>

          <aside className="card p-6 lg:col-span-4">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-solid text-on-primary">
                <Icon name="account_balance" className="text-[17px]" />
              </span>
              <h2 className="text-headline-sm text-ink-solid">Workspace defaults</h2>
            </div>
            <ul className="mt-4 space-y-3 text-body-md text-ink-graphite">
              {[
                'Single USD ledger with integer-cent arithmetic',
                'PayPal Invoicing API v2 connection on the next step',
                'Sentinel needs at least 3 matching charges before flagging a pattern',
                'Copilot answers only from deterministic server calculations',
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Icon name="check" className="mt-0.5 text-[17px] text-ink-solid" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-stroke-line pt-4 text-caption-micro leading-relaxed text-ink-muted">
              Setup is reversible. The demo reset in Settings restores the seeded Northstar workspace without touching PayPal.
            </div>
            <Link to="/app" className="btn btn-ghost mt-4 w-full">
              Go to dashboard without saving
            </Link>
          </aside>
        </div>
      )}
    </OnboardingShell>
  );
}
