import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSummary, Transaction } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDate, formatMoney, relativeTime } from '../lib/format';
import { currentMonthLabel } from '../../shared/dates';
import { ErrorState, Icon, LoadingBlock, PageHeader, StatCard, StatusBadge } from '../components/ui';
import { LineAreaChart } from '../components/charts';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { user } = useApp();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ summary: DashboardSummary }>('/dashboard')
      .then((data) => {
        setSummary(data.summary);
        setRecent(data.summary.recentTransactions);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <LoadingBlock label="Loading dashboard" rows={2} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card p-5">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton mt-6 h-8 w-36" />
            </div>
          ))}
        </div>
        <LoadingBlock label="Loading recent ledger" rows={4} />
      </div>
    );
  }

  if (error || !summary) {
    return <ErrorState message={error ?? 'Dashboard data is unavailable.'} onRetry={load} />;
  }

  const net = summary.incomingThisMonthMinor - summary.expensesThisMonthMinor;
  const points = summary.revenueSeries.map((point) => ({ label: point.label, value: point.valueMinor }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Treasury snapshot · demo feed
          </>
        }
        title="Overview"
        description={`${greeting()}, ${user?.name.split(' ')[0] ?? 'Maya'}. Here is the workspace's financial posture today.`}
        actions={
          <>
            <Link to="/app/copilot" className="btn btn-secondary">
              <Icon name="terminal" className="text-[18px]" />
              Ask Copilot
            </Link>
            <Link to="/app/invoices/new" className="btn btn-primary">
              <Icon name="add" className="text-[18px]" />
              Create invoice
            </Link>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Recorded balance"
          value={formatMoney(summary.recordedBalanceMinor)}
          icon="account_balance_wallet"
          hint="Opening balance plus settled demo ledger activity"
        />
        <StatCard
          label="Incoming this month"
          value={formatMoney(summary.incomingThisMonthMinor)}
          icon="call_received"
          hint={`Settled receipts · ${currentMonthLabel()}`}
        />
        <StatCard
          label="Outstanding invoices"
          value={formatMoney(summary.outstandingMinor)}
          icon="receipt_long"
          tone={summary.overdueCount > 0 ? 'emphasis' : 'default'}
          hint={
            <span className="flex flex-wrap items-center gap-1.5">
              {summary.overdueCount > 0 ? (
                <StatusBadge status="overdue" label={`${summary.overdueCount} overdue`} />
              ) : null}
              <span>Receivables — never counted as cash</span>
            </span>
          }
        />
        <StatCard
          label="Monthly expenses"
          value={formatMoney(summary.expensesThisMonthMinor)}
          icon="credit_card"
          hint={`Expense records dated ${currentMonthLabel()}`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="card flex flex-col p-5 lg:col-span-8">
          <div className="flex flex-col justify-between gap-3 pb-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-headline-sm text-ink-solid">Six-month inflow velocity</h2>
                <span className="chip">{currentMonthLabel()}</span>
              </div>
              <p className="mt-0.5 text-body-md text-ink-slate">
                Settled incoming ledger transactions. Forecasts never include unpaid invoices.
              </p>
            </div>
            <div className="text-left sm:text-right">
              <span className="block text-caption-micro uppercase tracking-wider text-ink-muted">Net this month</span>
              <span className="text-headline-sm font-semibold tabular-nums text-ink-solid">
                {net >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(net))}
              </span>
            </div>
          </div>
          <div className="mt-1">
            <LineAreaChart points={points} height={236} valueLabel="Inflow" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stroke-line pt-3 text-caption-micro text-ink-muted">
            <span>Source: local demo ledger · {summary.streakLabel}</span>
            <Link to="/app/transactions" className="inline-flex items-center gap-1 text-ink-slate transition-colors hover:text-ink-solid">
              Open transactions
              <Icon name="arrow_forward" className="text-[14px]" />
            </Link>
          </div>
        </div>

        <div className="card flex flex-col lg:col-span-4">
          <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
            <div>
              <h2 className="text-headline-sm text-ink-solid">Needs attention</h2>
              <p className="mt-0.5 text-caption-micro text-ink-muted">Evidence-backed items only</p>
            </div>
            <span className="chip">{summary.attention.length}</span>
          </div>
          {summary.attention.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
              <Icon name="check_circle" className="text-[28px] text-ink-slate" />
              <p className="mt-2 text-body-md text-ink-slate">Nothing needs attention right now.</p>
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-stroke-line">
              {summary.attention.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to={item.href} className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-hover">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container">
                      <Icon
                        name={
                          item.kind === 'invoice'
                            ? 'receipt_long'
                            : item.kind === 'sentinel'
                              ? 'radar'
                              : item.kind === 'budget'
                                ? 'savings'
                                : 'event'
                        }
                        className="text-[17px]"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-label-md font-medium text-ink-solid">{item.title}</span>
                      <span className="mt-0.5 block truncate text-caption-micro text-ink-muted">{item.detail}</span>
                    </span>
                    {item.amountMinor != null ? (
                      <span className="shrink-0 text-label-md font-medium tabular-nums text-ink-solid">
                        {formatMoney(item.amountMinor)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t border-stroke-line px-5 py-3">
            <Link to="/app/sentinel" className="text-label-sm text-ink-slate underline-offset-4 hover:text-ink-solid hover:underline">
              Review Sentinel
            </Link>
            <Link to="/app/copilot" className="inline-flex items-center gap-1 text-label-sm text-ink-solid">
              Explain
              <Icon name="arrow_forward" className="text-[14px]" />
            </Link>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
          <div>
            <h2 className="text-headline-sm text-ink-solid">Recent ledger activity</h2>
            <p className="mt-0.5 text-caption-micro text-ink-muted">Latest settled records across the demo workspace</p>
          </div>
          <Link to="/app/transactions" className="btn btn-sm btn-secondary">
            View all
            <Icon name="arrow_forward" className="text-[15px]" />
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-md text-ink-muted">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-stroke-line bg-surface-container-low/40">
                  <th className="table-th">Date</th>
                  <th className="table-th">Counterparty</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Status</th>
                  <th className="table-th text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke-line">
                {recent.map((tx) => (
                  <tr key={tx.id} className="transition-colors hover:bg-surface-hover/60">
                    <td className="table-td whitespace-nowrap text-ink-slate">{formatDate(tx.date)}</td>
                    <td className="table-td font-medium text-ink-solid">{tx.counterparty}</td>
                    <td className="table-td max-w-[280px] truncate text-ink-slate">{tx.description}</td>
                    <td className="table-td">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td
                      className={`table-td whitespace-nowrap text-right font-medium tabular-nums ${
                        tx.direction === 'incoming' ? 'text-ink-solid' : 'text-ink-graphite'
                      }`}
                    >
                      {tx.direction === 'incoming' ? '+' : '−'}
                      {formatMoney(tx.amountMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted">
          <Icon name="schedule" className="text-[14px]" />
          Snapshot generated {relativeTime(new Date().toISOString())} · demo data, not a live bank feed
        </div>
      </section>
    </div>
  );
}
