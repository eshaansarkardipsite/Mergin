import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Transaction } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import { downloadCsv, formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format';
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingBlock,
  Modal,
  PageHeader,
  SearchField,
  StatCard,
  StatusBadge,
  Tabs,
} from '../components/ui';

const DIRECTION_TABS = [
  { value: 'all', label: 'All' },
  { value: 'incoming', label: 'Incoming' },
  { value: 'outgoing', label: 'Outgoing' },
];

const STATUS_TABS = [
  { value: 'all', label: 'Any status' },
  { value: 'settled', label: 'Settled' },
  { value: 'pending', label: 'Pending' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
];

export default function Transactions() {
  const { toast } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Transaction | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ transactions: Transaction[] }>('/transactions')
      .then((data) => setTransactions(data.transactions))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (direction !== 'all' && transaction.direction !== direction) return false;
      if (status !== 'all' && transaction.status !== status) return false;
      if (!query) return true;
      return [
        transaction.counterparty,
        transaction.description,
        transaction.externalId,
        transaction.category,
        transaction.invoiceNumber ?? '',
        transaction.source,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [transactions, search, direction, status]);

  const totals = useMemo(() => {
    const settled = transactions.filter((t) => t.status === 'settled');
    const incoming = settled.filter((t) => t.direction === 'incoming').reduce((sum, t) => sum + t.amountMinor, 0);
    const outgoing = settled.filter((t) => t.direction === 'outgoing').reduce((sum, t) => sum + t.amountMinor, 0);
    return {
      incoming,
      outgoing,
      net: incoming - outgoing,
      pending: transactions.filter((t) => t.status === 'pending').length,
      settledCount: settled.length,
    };
  }, [transactions]);

  const exportCsv = () => {
    downloadCsv(`mergin-transactions-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Date', 'Transaction ID', 'Counterparty', 'Description', 'Category', 'Invoice', 'Source', 'Direction', 'Status', 'Amount', 'Currency'],
      ...filtered.map((t) => [
        t.date,
        t.externalId,
        t.counterparty,
        t.description,
        t.category,
        t.invoiceNumber ?? '',
        t.source,
        t.direction,
        t.status,
        (t.amountMinor / 100).toFixed(2),
        t.currency,
      ]),
    ]);
    toast(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}.`, 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Ledger module · verified records
          </>
        }
        title="Transactions"
        description="Searchable ledger of local demo records. Amounts are integer USD cents; nothing here is a live bank feed."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
              <Icon name="download" className="text-[18px]" />
              Export CSV
            </button>
            <Link to="/app/expenses?new=1" className="btn btn-primary">
              <Icon name="add" className="text-[18px]" />
              Record expense
            </Link>
          </>
        }
      />

      <section aria-label="Ledger totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total inflow"
          value={formatMoney(totals.incoming)}
          icon="south_west"
          hint={`${transactions.filter((t) => t.direction === 'incoming' && t.status === 'settled').length} settled receipts`}
        />
        <StatCard
          label="Total outflow"
          value={formatMoney(totals.outgoing)}
          icon="north_east"
          hint={`${transactions.filter((t) => t.direction === 'outgoing' && t.status === 'settled').length} settled disbursements`}
        />
        <StatCard
          label="Net settled"
          value={formatMoney(totals.net)}
          icon="account_balance_wallet"
          tone={totals.net < 0 ? 'emphasis' : 'default'}
          hint={`${totals.settledCount} settled records`}
        />
        <StatCard
          label="Pending"
          value={String(totals.pending)}
          icon="schedule"
          hint={totals.pending > 0 ? 'Not counted in the settled balance' : 'No pending records'}
        />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stroke-line p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={direction} onChange={setDirection} options={DIRECTION_TABS.map((tab) => ({
              ...tab,
              count: tab.value === 'all' ? transactions.length : transactions.filter((t) => t.direction === tab.value).length,
            }))} />
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search counterparty, reference, or invoice"
              label="Search transactions"
              className="lg:w-[340px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-stroke-line pt-3">
            <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Status</span>
            <Tabs value={status} onChange={setStatus} options={STATUS_TABS} />
            {search || direction !== 'all' || status !== 'all' ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost ml-auto"
                onClick={() => {
                  setSearch('');
                  setDirection('all');
                  setStatus('all');
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <LoadingBlock label="Loading transaction ledger" rows={5} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="swap_horiz"
            title="No matching transactions"
            description="Adjust the search or filters to see more ledger records."
            action={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearch('');
                  setDirection('all');
                  setStatus('all');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[820px] border-collapse">
                <thead>
                  <tr className="border-b border-stroke-line bg-surface-container-low/40">
                    <th className="table-th">Date</th>
                    <th className="table-th">Counterparty</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Invoice</th>
                    <th className="table-th">Status</th>
                    <th className="table-th text-right">Amount</th>
                    <th className="table-th text-right">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-line">
                  {filtered.map((transaction) => (
                    <tr key={transaction.id} className="transition-colors hover:bg-surface-hover/50">
                      <td className="table-td whitespace-nowrap">
                        <p className="text-ink-solid">{formatDate(transaction.date)}</p>
                        <p className="text-caption-micro text-ink-muted">{transaction.source}</p>
                      </td>
                      <td className="table-td">
                        <p className="font-medium text-ink-solid">{transaction.counterparty}</p>
                        <p className="max-w-[260px] truncate text-caption-micro text-ink-muted">{transaction.description}</p>
                      </td>
                      <td className="table-td whitespace-nowrap text-ink-slate">{transaction.category}</td>
                      <td className="table-td whitespace-nowrap">
                        {transaction.invoiceNumber ? (
                          <span className="inline-flex items-center gap-1 text-label-sm text-ink-graphite">
                            <Icon name="receipt" className="text-[14px]" />
                            {transaction.invoiceNumber}
                          </span>
                        ) : (
                          <span className="text-caption-micro text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="table-td">
                        <StatusBadge status={transaction.status} />
                      </td>
                      <td
                        className={`table-td whitespace-nowrap text-right font-medium tabular-nums ${
                          transaction.direction === 'incoming' ? 'text-ink-solid' : 'text-ink-graphite'
                        }`}
                      >
                        {transaction.direction === 'incoming' ? '+' : '−'}
                        {formatMoney(transaction.amountMinor)}
                      </td>
                      <td className="table-td text-right">
                        <button type="button" className="icon-btn h-8 w-8" aria-label="View transaction" onClick={() => setSelected(transaction)}>
                          <Icon name="visibility" className="text-[17px]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-start justify-between gap-2 border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted sm:flex-row sm:items-center">
              <span>
                Showing {filtered.length} of {transactions.length} records
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="info" className="text-[14px]" />
                Demo ledger · external IDs are seeded identifiers, not live PayPal references.
              </span>
            </div>
          </>
        )}
      </section>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.counterparty} · ${formatMoney(selected.amountMinor)}` : 'Transaction'}
        description={selected ? `${formatDate(selected.date)} · ${selected.direction}` : undefined}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setSelected(null)}>
            Close
          </button>
        }
      >
        {selected ? (
          <dl className="space-y-3 text-body-md">
            {[
              ['Description', selected.description],
              ['Category', selected.category],
              ['Status', titleCase(selected.status)],
              ['Direction', titleCase(selected.direction)],
              ['Source', selected.source],
              ['External ID', selected.externalId],
              ['Invoice', selected.invoiceNumber ?? 'Not linked'],
              ['Amount', `${formatMoney(selected.amountMinor)} ${selected.currency}`],
              ['Recorded', formatDateTime(selected.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 border-b border-stroke-line pb-2 last:border-0 last:pb-0">
                <dt className="shrink-0 text-ink-muted">{label}</dt>
                <dd className={`text-right ${label === 'External ID' ? 'font-mono text-label-sm' : ''} text-ink-solid`}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}
