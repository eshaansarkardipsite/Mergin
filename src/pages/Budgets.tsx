import { useEffect, useMemo, useState } from 'react';
import type { BudgetView } from '../../shared/types';
import { isoToday, monthKey } from '../../shared/dates';
import { parseMoneyToMinor } from '../../shared/money';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { formatMoney } from '../lib/format';
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  StatusBadge,
} from '../components/ui';

const CATEGORIES = ['Software', 'Contractors', 'Marketing', 'Travel & Ops', 'Rent & facilities', 'Other'];

interface Draft {
  category: string;
  period: string;
  limit: string;
}

function periodLabel(period: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${period}-01T12:00:00Z`),
  );
}

function shiftPeriod(period: string, delta: number): string {
  const date = new Date(`${period}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function stateLabel(state: BudgetView['state']): string {
  return state === 'over' ? 'Over limit' : state === 'near' ? 'Near limit' : 'On track';
}

export default function Budgets() {
  const { toast, confirm } = useApp();
  const [period, setPeriod] = useState(monthKey(isoToday()));
  const [budgets, setBudgets] = useState<BudgetView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = (target = period) => {
    setLoading(true);
    setError(null);
    api
      .get<{ budgets: BudgetView[]; period: string }>(`/budgets?period=${encodeURIComponent(target)}`)
      .then((data) => setBudgets(data.budgets))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const totals = useMemo(() => {
    const limit = budgets.reduce((sum, budget) => sum + budget.limitMinor, 0);
    const spent = budgets.reduce((sum, budget) => sum + budget.spentMinor, 0);
    return {
      limit,
      spent,
      remaining: limit - spent,
      utilisation: limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0,
      over: budgets.filter((budget) => budget.state === 'over').length,
      near: budgets.filter((budget) => budget.state === 'near').length,
    };
  }, [budgets]);

  const openCreate = () => {
    setEditing(null);
    setDraft({ category: CATEGORIES[0], period, limit: '' });
    setFormError(null);
  };

  const openEdit = (budget: BudgetView) => {
    setEditing(budget);
    setDraft({ category: budget.category, period: budget.period, limit: (budget.limitMinor / 100).toFixed(2) });
    setFormError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setFormError(null);
    const limitMinor = parseMoneyToMinor(draft.limit);
    if (!draft.category.trim()) return setFormError('Choose a category.');
    if (!/^\d{4}-\d{2}$/.test(draft.period)) return setFormError('Choose a valid budget month.');
    if (limitMinor <= 0) return setFormError('Enter a limit greater than zero.');

    setSaving(true);
    try {
      const body = { category: draft.category.trim(), period: draft.period, limitMinor };
      if (editing) {
        await api.put<{ budget: BudgetView }>(`/budgets/${editing.id}`, body);
        toast('Budget updated.', 'success');
      } else {
        await api.post<{ budget: BudgetView }>('/budgets', body);
        toast('Budget saved.', 'success');
      }
      setDraft(null);
      setEditing(null);
      if (draft.period !== period) setPeriod(draft.period);
      else load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (budget: BudgetView) => {
    const ok = await confirm({
      title: `Delete ${budget.category} budget?`,
      message: `The ${formatMoney(budget.limitMinor)} limit for ${periodLabel(budget.period)} is removed. Recorded expenses are not affected.`,
      confirmLabel: 'Delete budget',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(budget.id);
    try {
      await api.del(`/budgets/${budget.id}`, { confirm: true });
      toast('Budget deleted.', 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Treasury operations · variance &amp; control
          </>
        }
        title="Budgets"
        description="Category spending limits calculated from recorded expenses. Utilisation is recomputed server-side."
        actions={
          <>
            <div className="flex h-10 items-center gap-1 rounded-xl border border-stroke-line bg-surface-raised px-1">
              <button type="button" className="icon-btn h-8 w-8" aria-label="Previous month" onClick={() => setPeriod(shiftPeriod(period, -1))}>
                <Icon name="chevron_left" className="text-[18px]" />
              </button>
              <span className="min-w-[130px] px-2 text-center text-label-md tabular-nums text-ink-solid">{periodLabel(period)}</span>
              <button type="button" className="icon-btn h-8 w-8" aria-label="Next month" onClick={() => setPeriod(shiftPeriod(period, 1))}>
                <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </div>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Icon name="add" className="text-[18px]" />
              Create budget
            </button>
          </>
        }
      />

      <section aria-label="Budget totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total limit"
          value={formatMoney(totals.limit)}
          icon="savings"
          hint={`${budgets.length} category budget${budgets.length === 1 ? '' : 's'} · ${periodLabel(period)}`}
        />
        <StatCard
          label="Spent against limits"
          value={formatMoney(totals.spent)}
          icon="credit_card"
          hint={`${totals.utilisation}% of combined limits`}
        />
        <StatCard
          label="Remaining"
          value={formatMoney(totals.remaining)}
          icon="wallet"
          tone={totals.remaining < 0 ? 'emphasis' : 'default'}
          hint={totals.remaining < 0 ? 'Recorded spend exceeds combined limits' : 'Under combined limits'}
        />
        <StatCard
          label="Needs attention"
          value={`${totals.over + totals.near}`}
          icon="priority_high"
          tone={totals.over + totals.near > 0 ? 'emphasis' : 'default'}
          hint={`${totals.over} over · ${totals.near} near limit`}
        />
      </section>

      {loading ? (
        <LoadingBlock label="Loading budgets" rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : budgets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="savings"
            title={`No budgets for ${periodLabel(period)}`}
            description="Create a category limit for this month. Spending is matched by expense category and date."
            action={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                Create budget
              </button>
            }
          />
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex flex-col gap-1 border-b border-stroke-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-headline-sm text-ink-solid">Category budgets</h2>
              <p className="mt-0.5 text-caption-micro text-ink-muted">
                Under 80% is on track. 80–99% is near limit. 100% or more is over.
              </p>
            </div>
            <span className="chip">{periodLabel(period)}</span>
          </div>
          <ul className="divide-y divide-stroke-line">
            {budgets.map((budget) => (
              <li key={budget.id} className="px-5 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-body-md font-semibold text-ink-solid">{budget.category}</h3>
                        <StatusBadge
                          status={budget.state}
                          label={stateLabel(budget.state)}
                        />
                      </div>
                      <p className="mt-1 text-label-sm tabular-nums text-ink-slate">
                        {formatMoney(budget.spentMinor)} spent of {formatMoney(budget.limitMinor)}
                        <span className="text-ink-muted"> · </span>
                        {budget.remainingMinor >= 0
                          ? `${formatMoney(budget.remainingMinor)} remaining`
                          : `${formatMoney(Math.abs(budget.remainingMinor))} over`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-2 text-label-md font-semibold tabular-nums text-ink-solid">
                        {(budget.utilisationBps / 100).toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        className="icon-btn h-8 w-8"
                        aria-label={`Edit ${budget.category} budget`}
                        onClick={() => openEdit(budget)}
                      >
                        <Icon name="edit" className="text-[17px]" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-8 w-8"
                        aria-label={`Delete ${budget.category} budget`}
                        disabled={busyId === budget.id}
                        onClick={() => void remove(budget)}
                      >
                        <Icon name="delete" className="text-[17px]" />
                      </button>
                    </div>
                  </div>
                  <ProgressBar
                    value={budget.utilisationBps / 100}
                    label={`${budget.category} budget utilisation`}
                    tone={budget.state === 'under' ? 'soft' : 'solid'}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-start justify-between gap-2 border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted sm:flex-row sm:items-center">
            <span>
              {formatMoney(totals.spent)} of {formatMoney(totals.limit)} combined limits · {totals.utilisation}%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="info" className="text-[14px]" />
              Spending counts recorded expenses only. Pending items are not counted.
            </span>
          </div>
        </section>
      )}

      <Modal
        open={draft !== null}
        onClose={() => {
          if (!saving) {
            setDraft(null);
            setEditing(null);
          }
        }}
        title={editing ? 'Edit budget' : 'Create budget'}
        description="A budget is a category limit for one calendar month in the local demo ledger."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="budget-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[17px]" />}
              {saving ? 'Saving' : editing ? 'Save changes' : 'Create budget'}
            </button>
          </>
        }
      >
        {draft ? (
          <form id="budget-form" onSubmit={save} className="space-y-4" noValidate>
            {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}
            <div>
              <label className="field-label" htmlFor="budget-category">
                Category
              </label>
              <input
                id="budget-category"
                className="input"
                list="budget-categories"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                maxLength={80}
                disabled={saving}
                required
              />
              <datalist id="budget-categories">
                {CATEGORIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <p className="field-hint">Must match the expense category exactly to count spending.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="budget-period">
                  Month
                </label>
                <input
                  id="budget-period"
                  type="month"
                  className="input"
                  value={draft.period}
                  onChange={(event) => setDraft({ ...draft, period: event.target.value })}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="budget-limit">
                  Limit (USD)
                </label>
                <input
                  id="budget-limit"
                  className="input text-right tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.limit}
                  onChange={(event) => setDraft({ ...draft, limit: event.target.value })}
                  disabled={saving}
                  required
                />
              </div>
            </div>
            {editing ? (
              <p className="rounded-lg bg-surface-container-low p-3 text-caption-micro text-ink-slate">
                Changing the category or month moves this limit. Existing expenses are not edited.
              </p>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
