import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Invoice } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import {
  downloadCsv,
  dueLabel,
  formatDate,
  formatMoney,
  initials,
  invoiceStatusLabel,
} from '../lib/format';
import { currentMonthLabel } from '../../shared/dates';
import {
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  SearchField,
  StatCard,
  StatusBadge,
  Tabs,
} from '../components/ui';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
];

export default function Invoices() {
  const { toast, confirm } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ invoices: Invoice[] }>('/invoices')
      .then((data) => setInvoices(data.invoices))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const param = searchParams.get('search') ?? '';
    setSearch(param);
    if (param) setStatus('all');
  }, [searchParams]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (status !== 'all' && invoice.status !== status) return false;
      if (!query) return true;
      return (
        invoice.number.toLowerCase().includes(query) ||
        invoice.customerName.toLowerCase().includes(query) ||
        invoice.customerEmail.toLowerCase().includes(query)
      );
    });
  }, [invoices, status, search]);

  const counts = useMemo(() => {
    const by = (list: Invoice[], predicate: (invoice: Invoice) => boolean) => list.filter(predicate);
    const draft = by(invoices, (i) => i.status === 'draft');
    const awaiting = by(invoices, (i) => ['sent', 'partial', 'pending'].includes(i.status));
    const overdue = by(invoices, (i) => i.status === 'overdue');
    const month = new Date().toISOString().slice(0, 7);
    const settled = by(invoices, (i) => i.status === 'paid' && (i.paidAt?.startsWith(month) ?? false));
    const sum = (list: Invoice[]) => list.reduce((total, invoice) => total + invoice.totalMinor, 0);
    return { draft, awaiting, overdue, settled, sum };
  }, [invoices]);

  const runAction = async (invoice: Invoice, action: 'send' | 'remind') => {
    setBusyId(invoice.id);
    try {
      const result = await api.post<{ message?: string; mode?: string }>(`/invoices/${invoice.id}/${action}`);
      toast(result.message ?? (action === 'send' ? 'Invoice sent.' : 'Reminder recorded.'), 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const cancelInvoice = async (invoice: Invoice) => {
    const ok = await confirm({
      title: invoice.status === 'draft' ? `Delete draft ${invoice.number}?` : `Cancel ${invoice.number}?`,
      message:
        invoice.status === 'draft'
          ? 'This removes the draft from the demo workspace. It cannot be undone.'
          : 'The invoice will be cancelled in the demo ledger. If it was sent through PayPal, the PayPal invoice is cancelled only when credentials are configured.',
      confirmLabel: invoice.status === 'draft' ? 'Delete draft' : 'Cancel invoice',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(invoice.id);
    try {
      const result = await api.post<{ message?: string; deleted?: boolean }>(`/invoices/${invoice.id}/cancel`, { confirm: true });
      toast(result.message ?? 'Invoice cancelled.', 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (invoice: Invoice) => {
    const url = `${window.location.origin}/pay/${invoice.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Customer payment link copied.', 'success');
    } catch {
      toast('Clipboard access was blocked. Open the invoice to copy its link.', 'error');
    }
  };

  const exportCsv = () => {
    downloadCsv(`mergin-invoices-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Invoice', 'Customer', 'Email', 'Issued', 'Due', 'Status', 'Total', 'Paid', 'Balance', 'Currency'],
      ...filtered.map((invoice) => [
        invoice.number,
        invoice.customerName,
        invoice.customerEmail,
        invoice.issueDate,
        invoice.dueDate,
        invoice.status,
        (invoice.totalMinor / 100).toFixed(2),
        (invoice.paidMinor / 100).toFixed(2),
        (invoice.dueMinor / 100).toFixed(2),
        invoice.currency,
      ]),
    ]);
    toast(`Exported ${filtered.length} invoice${filtered.length === 1 ? '' : 's'} to CSV.`, 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Treasury operations · receivables
          </>
        }
        title="Invoices"
        description="Track receivables and reconcile PayPal payments against the local ledger. Demo invoices never count as cash until settled."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
              <Icon name="download" className="text-[18px]" />
              Export CSV
            </button>
            <Link to="/app/invoices/new" className="btn btn-primary">
              <Icon name="add" className="text-[18px]" />
              Create invoice
            </Link>
          </>
        }
      />

      <section aria-label="Invoice metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Draft"
          value={formatMoney(counts.sum(counts.draft))}
          icon="edit_note"
          hint={`${counts.draft.length} draft${counts.draft.length === 1 ? '' : 's'} · not sent`}
        />
        <StatCard
          label="Sent · awaiting"
          value={formatMoney(counts.sum(counts.awaiting))}
          icon="outgoing_mail"
          hint={`${counts.awaiting.length} invoice${counts.awaiting.length === 1 ? '' : 's'} outstanding`}
        />
        <StatCard
          label="Overdue"
          value={formatMoney(counts.sum(counts.overdue))}
          icon="priority_high"
          tone={counts.overdue.length > 0 ? 'emphasis' : 'default'}
          hint={
            counts.overdue.length > 0
              ? `${counts.overdue.length} past due · collect first`
              : 'No invoice is past its due date'
          }
        />
        <StatCard
          label="Settled this month"
          value={formatMoney(counts.sum(counts.settled))}
          icon="verified"
          hint={`${counts.settled.length} paid · ${currentMonthLabel()}`}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stroke-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={status}
            onChange={setStatus}
            options={TABS.map((tab) => ({
              ...tab,
              count:
                tab.value === 'all'
                  ? invoices.length
                  : invoices.filter((invoice) => invoice.status === tab.value).length,
            }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              value={search}
              onChange={(value) => {
                setSearch(value);
                if (searchParams.has('search')) {
                  const next = new URLSearchParams(searchParams);
                  if (value) next.set('search', value);
                  else next.delete('search');
                  setSearchParams(next, { replace: true });
                }
              }}
              placeholder="Search client, invoice, or email"
              label="Search invoices"
              className="sm:w-[280px]"
            />
            {search ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setSearch('');
                  const next = new URLSearchParams(searchParams);
                  next.delete('search');
                  setSearchParams(next, { replace: true });
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton h-14 w-full" />
            ))}
            <span className="sr-only">Loading invoices</span>
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title={search || status !== 'all' ? 'No matching invoices' : 'No invoices yet'}
            description={
              search || status !== 'all'
                ? 'Adjust the status tab or clear the search to see more records.'
                : 'Create the first invoice to start tracking receivables.'
            }
            action={
              search || status !== 'all' ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setStatus('all');
                    setSearch('');
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/app/invoices/new" className="btn btn-primary">
                  Create invoice
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="border-b border-stroke-line bg-surface-container-low/40">
                    <th className="table-th">Invoice</th>
                    <th className="table-th">Customer</th>
                    <th className="table-th">Issued</th>
                    <th className="table-th">Due</th>
                    <th className="table-th text-right">Amount</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-line">
                  {filtered.map((invoice) => {
                    const busy = busyId === invoice.id;
                    const canRemind = ['sent', 'overdue', 'partial', 'pending'].includes(invoice.status);
                    return (
                      <tr key={invoice.id} className="transition-colors hover:bg-surface-hover/50">
                        <td className="table-td whitespace-nowrap">
                          <Link to={`/app/invoices/${invoice.id}`} className="inline-flex items-center gap-2 font-medium text-ink-solid hover:underline">
                            <Icon name="receipt" className="text-[16px] text-ink-muted" />
                            {invoice.number}
                          </Link>
                        </td>
                        <td className="table-td">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-container text-label-sm font-medium">
                              {initials(invoice.customerName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium leading-tight text-ink-solid">{invoice.customerName}</p>
                              <p className="truncate text-caption-micro text-ink-muted">{invoice.customerEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="table-td whitespace-nowrap text-ink-slate">{formatDate(invoice.issueDate)}</td>
                        <td className="table-td whitespace-nowrap">
                          <p className="text-ink-solid">{formatDate(invoice.dueDate)}</p>
                          <p className="text-caption-micro text-ink-slate">{dueLabel(invoice.dueDate, invoice.status)}</p>
                        </td>
                        <td className="table-td whitespace-nowrap text-right font-medium tabular-nums">
                          {formatMoney(invoice.totalMinor)}
                          {invoice.status === 'partial' ? (
                            <span className="block text-caption-micro font-normal text-ink-muted">
                              {formatMoney(invoice.dueMinor)} due
                            </span>
                          ) : null}
                        </td>
                        <td className="table-td">
                          <StatusBadge status={invoice.status} label={invoiceStatusLabel(invoice.status)} />
                        </td>
                        <td className="table-td">
                          <div className="flex items-center justify-end gap-1.5">
                            {invoice.status === 'draft' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                onClick={() => runAction(invoice, 'send')}
                              >
                                {busy ? 'Sending' : 'Send'}
                              </button>
                            ) : null}
                            {canRemind ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary"
                                disabled={busy}
                                onClick={() => runAction(invoice, 'remind')}
                              >
                                <Icon name="notification_important" className="text-[15px]" />
                                {busy ? 'Working' : 'Remind'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="icon-btn h-8 w-8"
                              title="Copy payment link"
                              aria-label={`Copy payment link for ${invoice.number}`}
                              onClick={() => copyLink(invoice)}
                            >
                              <Icon name="link" className="text-[17px]" />
                            </button>
                            <Link
                              to={`/app/invoices/${invoice.id}`}
                              className="icon-btn h-8 w-8"
                              title="View invoice"
                              aria-label={`View ${invoice.number}`}
                            >
                              <Icon name="visibility" className="text-[17px]" />
                            </Link>
                            {['sent', 'overdue', 'partial', 'pending'].includes(invoice.status) ? (
                              <button
                                type="button"
                                className="icon-btn h-8 w-8"
                                title="Cancel invoice"
                                aria-label={`Cancel ${invoice.number}`}
                                disabled={busy}
                                onClick={() => cancelInvoice(invoice)}
                              >
                                <Icon name="block" className="text-[17px]" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-start justify-between gap-2 border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted sm:flex-row sm:items-center">
              <span>
                Showing {filtered.length} of {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="info" className="text-[14px]" />
                PayPal reconciliation is authoritative; local status is a mirror.
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
