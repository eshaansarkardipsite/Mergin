import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Expense } from '../../shared/types';
import { isoToday, monthKey } from '../../shared/dates';
import { parseMoneyToMinor } from '../../shared/money';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { downloadCsv, formatDate, formatMoney } from '../lib/format';
import {
  EmptyState,
  ErrorState,
  Icon,
  Modal,
  PageHeader,
  SearchField,
  Spinner,
  StatCard,
  Tabs,
} from '../components/ui';

const CATEGORIES = ['Software', 'Contractors', 'Marketing', 'Travel & Ops', 'Rent & facilities', 'Client payments', 'Other'];

interface Draft {
  date: string;
  merchant: string;
  category: string;
  amount: string;
  source: string;
  notes: string;
  receiptName: string;
}

function blankDraft(): Draft {
  return {
    date: isoToday(),
    merchant: '',
    category: 'Software',
    amount: '',
    source: 'Corporate card',
    notes: '',
    receiptName: '',
  };
}

export default function Expenses() {
  const { toast, confirm } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ expenses: Expense[] }>('/expenses')
      .then((data) => setExpenses(data.expenses))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null);
      setDraft(blankDraft());
      setFormError(null);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const categories = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.category))).sort(),
    [expenses],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (category !== 'all' && expense.category !== category) return false;
      if (!query) return true;
      return [expense.merchant, expense.category, expense.notes, expense.source, expense.receiptName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [expenses, search, category]);

  const totals = useMemo(() => {
    const month = monthKey(isoToday());
    const thisMonth = expenses.filter((expense) => expense.date.startsWith(month));
    const sum = (list: Expense[]) => list.reduce((total, expense) => total + expense.amountMinor, 0);
    const byCategory = new Map<string, number>();
    for (const expense of expenses) {
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountMinor);
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      monthTotal: sum(thisMonth),
      monthCount: thisMonth.length,
      allTotal: sum(expenses),
      top: top ? { category: top[0], amountMinor: top[1] } : null,
      missingReceipts: expenses.filter((expense) => !expense.receiptName).length,
    };
  }, [expenses]);

  const openCreate = () => {
    setEditing(null);
    setDraft(blankDraft());
    setFormError(null);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setDraft({
      date: expense.date,
      merchant: expense.merchant,
      category: expense.category,
      amount: (expense.amountMinor / 100).toFixed(2),
      source: expense.source,
      notes: expense.notes,
      receiptName: expense.receiptName ?? '',
    });
    setFormError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setFormError(null);
    const amountMinor = parseMoneyToMinor(draft.amount);
    if (!draft.merchant.trim()) return setFormError('Enter a merchant name.');
    if (!draft.category.trim()) return setFormError('Choose a category.');
    if (!draft.date) return setFormError('Choose an expense date.');
    if (amountMinor <= 0) return setFormError('Enter an amount greater than zero.');
    if (!draft.source.trim()) return setFormError('Enter a payment source.');

    setSaving(true);
    try {
      const body = {
        date: draft.date,
        merchant: draft.merchant.trim(),
        category: draft.category.trim(),
        amountMinor,
        source: draft.source.trim(),
        notes: draft.notes.trim(),
        receiptName: draft.receiptName.trim() || null,
      };
      if (editing) {
        await api.put<{ expense: Expense }>(`/expenses/${editing.id}`, body);
        toast('Expense updated.', 'success');
      } else {
        await api.post<{ expense: Expense }>('/expenses', body);
        toast('Expense recorded.', 'success');
      }
      setDraft(null);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense: Expense) => {
    const ok = await confirm({
      title: `Delete ${expense.merchant}?`,
      message: `${formatMoney(expense.amountMinor)} recorded on ${formatDate(expense.date)} will be removed from the local demo ledger. This cannot be undone.`,
      confirmLabel: 'Delete expense',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(expense.id);
    try {
      await api.del(`/expenses/${expense.id}`, { confirm: true });
      toast('Expense deleted.', 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(`mergin-expenses-${isoToday()}.csv`, [
      ['Date', 'Merchant', 'Category', 'Amount', 'Currency', 'Source', 'Receipt', 'Notes'],
      ...filtered.map((expense) => [
        expense.date,
        expense.merchant,
        expense.category,
        (expense.amountMinor / 100).toFixed(2),
        expense.currency,
        expense.source,
        expense.receiptName ?? '',
        expense.notes,
      ]),
    ]);
    toast(`Exported ${filtered.length} expense${filtered.length === 1 ? '' : 's'}.`, 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Disbursements &amp; claims
          </>
        }
        title="Expenses"
        description="Track local demo spend and receipt references. Receipt files are not uploaded or stored in this build."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Icon name="download" className="text-[18px]" />
              Export CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Icon name="add" className="text-[18px]" />
              Record expense
            </button>
          </>
        }
      />

      <section aria-label="Expense metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Spend this month"
          value={formatMoney(totals.monthTotal)}
          icon="query_stats"
          hint={`${totals.monthCount} record${totals.monthCount === 1 ? '' : 's'} dated this month`}
        />
        <StatCard
          label="All recorded spend"
          value={formatMoney(totals.allTotal)}
          icon="credit_card"
          hint={`${expenses.length} expense record${expenses.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Top category"
          value={totals.top?.category ?? '—'}
          icon="pie_chart"
          hint={totals.top ? `${formatMoney(totals.top.amountMinor)} recorded` : 'No expenses yet'}
        />
        <StatCard
          label="Missing receipts"
          value={String(totals.missingReceipts)}
          icon="receipt_long"
          tone={totals.missingReceipts > 0 ? 'emphasis' : 'default'}
          hint={totals.missingReceipts > 0 ? 'Receipt name not recorded' : 'All expenses have a receipt reference'}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stroke-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={category}
            onChange={setCategory}
            options={[{ value: 'all', label: 'All categories', count: expenses.length }, ...categories.map((item) => ({
              value: item,
              label: item,
              count: expenses.filter((expense) => expense.category === item).length,
            }))]}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search merchant, category, or source"
            label="Search expenses"
            className="lg:w-[320px]"
          />
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-14 w-full" />
            ))}
            <span className="sr-only">Loading expenses</span>
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="credit_card"
            title={expenses.length === 0 ? 'No expenses recorded' : 'No matching expenses'}
            description={
              expenses.length === 0
                ? 'Record the first expense to start tracking spend.'
                : 'Adjust the category or search to see more records.'
            }
            action={
              expenses.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                  Record expense
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch('');
                    setCategory('all');
                  }}
                >
                  Clear filters
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-stroke-line bg-surface-container-low/40">
                    <th className="table-th">Date</th>
                    <th className="table-th">Merchant</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Source</th>
                    <th className="table-th">Receipt</th>
                    <th className="table-th text-right">Amount</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-line">
                  {filtered.map((expense) => (
                    <tr key={expense.id} className="transition-colors hover:bg-surface-hover/50">
                      <td className="table-td whitespace-nowrap text-ink-slate">{formatDate(expense.date)}</td>
                      <td className="table-td">
                        <p className="font-medium text-ink-solid">{expense.merchant}</p>
                        <p className="max-w-[260px] truncate text-caption-micro text-ink-muted">{expense.notes || 'No notes'}</p>
                      </td>
                      <td className="table-td whitespace-nowrap">
                        <span className="chip-outline">{expense.category}</span>
                      </td>
                      <td className="table-td whitespace-nowrap text-ink-slate">{expense.source}</td>
                      <td className="table-td whitespace-nowrap">
                        {expense.receiptName ? (
                          <span className="inline-flex items-center gap-1 text-label-sm text-ink-graphite">
                            <Icon name="attachment" className="text-[14px]" />
                            {expense.receiptName}
                          </span>
                        ) : (
                          <span className="text-caption-micro text-ink-muted">Not recorded</span>
                        )}
                      </td>
                      <td className="table-td whitespace-nowrap text-right font-medium tabular-nums text-ink-solid">
                        {formatMoney(expense.amountMinor)}
                      </td>
                      <td className="table-td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="icon-btn h-8 w-8"
                            aria-label={`Edit ${expense.merchant}`}
                            onClick={() => openEdit(expense)}
                          >
                            <Icon name="edit" className="text-[17px]" />
                          </button>
                          <button
                            type="button"
                            className="icon-btn h-8 w-8"
                            aria-label={`Delete ${expense.merchant}`}
                            disabled={busyId === expense.id}
                            onClick={() => void remove(expense)}
                          >
                            <Icon name="delete" className="text-[17px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted">
              <span>
                Showing {filtered.length} of {expenses.length} expenses
              </span>
              <span>{formatMoney(filtered.reduce((sum, expense) => sum + expense.amountMinor, 0))} filtered total</span>
            </div>
          </>
        )}
      </section>

      <Modal
        open={draft !== null}
        onClose={() => {
          if (!saving) {
            setDraft(null);
            setEditing(null);
          }
        }}
        title={editing ? 'Edit expense' : 'Record expense'}
        description="Writes to the local demo database. No receipt file is uploaded."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="expense-form" className="btn btn-primary" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[17px]" />}
              {saving ? 'Saving' : editing ? 'Save changes' : 'Record expense'}
            </button>
          </>
        }
      >
        {draft ? (
          <form id="expense-form" onSubmit={save} className="space-y-4" noValidate>
            {formError ? <InlineAlert tone="error">{formError}</InlineAlert> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="expense-date">
                  Date
                </label>
                <input
                  id="expense-date"
                  type="date"
                  className="input"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="expense-amount">
                  Amount (USD)
                </label>
                <input
                  id="expense-amount"
                  className="input text-right tabular-nums"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                  disabled={saving}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="expense-merchant">
                  Merchant
                </label>
                <input
                  id="expense-merchant"
                  className="input"
                  value={draft.merchant}
                  onChange={(event) => setDraft({ ...draft, merchant: event.target.value })}
                  placeholder="Vendor or payee"
                  maxLength={160}
                  disabled={saving}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="expense-category">
                  Category
                </label>
                <select
                  id="expense-category"
                  className="select"
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  disabled={saving}
                >
                  {Array.from(new Set([...CATEGORIES, ...categories])).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="expense-source">
                  Payment source
                </label>
                <input
                  id="expense-source"
                  className="input"
                  value={draft.source}
                  onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                  placeholder="Corporate card •• 1234"
                  maxLength={120}
                  disabled={saving}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="expense-receipt">
                  Receipt reference
                </label>
                <input
                  id="expense-receipt"
                  className="input"
                  value={draft.receiptName}
                  onChange={(event) => setDraft({ ...draft, receiptName: event.target.value })}
                  placeholder="e.g. receipt-oct-aws.pdf"
                  maxLength={200}
                  disabled={saving}
                />
                <p className="field-hint">A filename reference only. File upload and storage are not implemented.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="expense-notes">
                  Notes
                </label>
                <textarea
                  id="expense-notes"
                  className="textarea"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  placeholder="What was this expense for?"
                  maxLength={2000}
                  disabled={saving}
                />
              </div>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
