import { useEffect, useMemo, useState } from 'react';
import type { CashFlowScenario, CashFlowSummary } from '../../shared/types';
import { isoToday } from '../../shared/dates';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import { downloadCsv, formatDate, formatMoney } from '../lib/format';
import { ErrorState, Icon, LoadingBlock, PageHeader, StatCard, Tabs } from '../components/ui';
import { LineAreaChart } from '../components/charts';

export default function CashFlow() {
  const { toast } = useApp();
  const [horizon, setHorizon] = useState<'7' | '30'>('30');
  const [scenario, setScenario] = useState<CashFlowScenario>('baseline');
  const [cashFlow, setCashFlow] = useState<CashFlowSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ cashFlow: CashFlowSummary }>(`/cash-flow?horizon=${horizon}&scenario=${scenario}`)
      .then((data) => {
        if (!cancelled) setCashFlow(data.cashFlow);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizon, scenario, refreshKey]);

  const chartPoints = useMemo(
    () => (cashFlow?.points ?? []).map((point) => ({ label: point.label, value: point.balanceMinor })),
    [cashFlow],
  );

  const projected = cashFlow?.points[cashFlow.points.length - 1]?.balanceMinor ?? 0;
  const netChange = cashFlow ? projected - cashFlow.recordedBalanceMinor : 0;

  const exportCsv = () => {
    if (!cashFlow) return;
    downloadCsv(`mergin-cash-flow-${isoToday()}.csv`, [
      ['Date', 'Label', 'Estimated', 'Inflow', 'Outflow', 'Balance', 'Currency'],
      ...cashFlow.points.map((point) => [
        point.date,
        point.label,
        point.estimated ? 'estimated' : 'recorded',
        (point.inflowMinor / 100).toFixed(2),
        (point.outflowMinor / 100).toFixed(2),
        (point.balanceMinor / 100).toFixed(2),
        cashFlow.currency,
      ]),
    ]);
    toast(`Exported ${cashFlow.points.length} cash-flow points.`, 'success');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-ink-solid" />
            Treasury operations · liquidity forecast
          </>
        }
        title="Cash Flow"
        description="Recorded balance plus detected recurring outflows. Unpaid invoices are shown as receivables, never counted as cash."
        actions={
          <>
            <Tabs
              value={horizon}
              onChange={(value) => setHorizon(value as '7' | '30')}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
              ]}
            />
            <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!cashFlow}>
              <Icon name="download" className="text-[18px]" />
              Export forecast
            </button>
          </>
        }
      />

      <div className="flex flex-col justify-between gap-3 rounded-xl border border-stroke-line bg-surface-raised px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <Icon name="tune" className="text-[18px] text-ink-slate" />
          <div>
            <p className="text-label-md font-medium text-ink-solid">Forecast scenario</p>
            <p className="text-caption-micro text-ink-muted">
              {scenario === 'conservative'
                ? 'Adds a 10% buffer to every estimated outflow. Receivables stay excluded.'
                : 'Uses detected recurring charge amounts without an extra buffer.'}
            </p>
          </div>
        </div>
        <Tabs
          value={scenario}
          onChange={(value) => setScenario(value as CashFlowScenario)}
          options={[
            { value: 'baseline', label: 'Baseline' },
            { value: 'conservative', label: 'Conservative' },
          ]}
        />
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card p-5">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton mt-6 h-8 w-36" />
              </div>
            ))}
          </div>
          <LoadingBlock label="Loading cash flow" rows={4} />
        </div>
      ) : error || !cashFlow ? (
        <ErrorState message={error ?? 'Cash flow data is unavailable.'} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <>
          <section aria-label="Cash flow metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Recorded balance"
              value={formatMoney(cashFlow.recordedBalanceMinor)}
              icon="account_balance_wallet"
              hint="Opening balance plus settled demo ledger activity"
            />
            <StatCard
              label="Confirmed receipts"
              value={formatMoney(cashFlow.confirmedReceiptsMinor)}
              icon="south_west"
              hint="Settled incoming transactions recorded this month"
            />
            <StatCard
              label={`Scheduled outflows · ${horizon}d`}
              value={formatMoney(cashFlow.scheduledOutflowsMinor)}
              icon="north_east"
              hint={scenario === 'conservative' ? 'Includes a 10% scenario buffer' : 'Detected recurring charges only'}
            />
            <StatCard
              label={`Projected balance · day ${horizon}`}
              value={formatMoney(projected)}
              icon="insights"
              tone={projected < 0 ? 'emphasis' : 'default'}
              hint={
                <span className={netChange < 0 ? 'text-ink-solid' : ''}>
                  {netChange >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(netChange))} vs today
                </span>
              }
            />
          </section>

          <section className="card p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-headline-sm text-ink-solid">
                    {horizon}-day liquidity trajectory
                  </h2>
                  <span className="chip">{scenario === 'conservative' ? 'Conservative' : 'Baseline'}</span>
                </div>
                <p className="mt-0.5 text-body-md text-ink-slate">
                  Recorded balances through today, then forecast balances after detected recurring outflows.
                </p>
              </div>
              <div className="flex items-center gap-4 text-caption-micro text-ink-slate">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 bg-ink-solid" />
                  Recorded
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-ink-solid" />
                  Forecast
                </span>
              </div>
            </div>

            <div className="mt-5">
              <LineAreaChart points={chartPoints} height={280} valueLabel="Projected balance" showAxis={false} />
            </div>
            <div className="mt-2 flex items-center justify-between text-caption-micro text-ink-muted">
              <span>{formatDate(cashFlow.points[0]?.date ?? isoToday(), { month: 'short', day: 'numeric' })}</span>
              <span>Today · {formatDate(isoToday(), { month: 'short', day: 'numeric' })}</span>
              <span>{formatDate(cashFlow.points[cashFlow.points.length - 1]?.date ?? isoToday(), { month: 'short', day: 'numeric' })}</span>
            </div>
            <p className="mt-3 border-t border-stroke-line pt-3 text-caption-micro text-ink-muted">
              Only balances after today are forecast. All amounts are USD integer cents.
            </p>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="card p-5 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-stroke-line pb-3">
                <h2 className="text-headline-sm text-ink-solid">Forecast assumptions</h2>
                <span className="chip-outline">Deterministic</span>
              </div>
              <ul className="mt-4 space-y-2.5">
                {cashFlow.assumptions.map((assumption) => (
                  <li key={assumption} className="flex gap-2.5 text-body-md text-ink-graphite">
                    <Icon name="check" className="mt-0.5 text-[17px] text-ink-solid" />
                    <span>{assumption}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-stroke-line pb-3">
                <h2 className="text-headline-sm text-ink-solid">Receivables context</h2>
                <Icon name="receipt_long" className="text-[19px] text-ink-muted" />
              </div>
              <div className="mt-4">
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Outstanding invoices</span>
                <p className="mt-1 text-headline-md tabular-nums text-ink-solid">{formatMoney(cashFlow.outstandingMinor)}</p>
                <p className="mt-1 text-caption-micro leading-relaxed text-ink-slate">
                  This amount is not included in any projected balance. An invoice becomes cash only when a settled receipt is
                  recorded.
                </p>
              </div>
              <div className="mt-4 rounded-xl bg-surface-canvas p-4">
                <div className="flex items-center justify-between text-label-sm">
                  <span className="text-ink-muted">Recorded balance</span>
                  <span className="tabular-nums text-ink-solid">{formatMoney(cashFlow.recordedBalanceMinor)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-label-sm">
                  <span className="text-ink-muted">Scheduled outflows</span>
                  <span className="tabular-nums text-ink-solid">−{formatMoney(cashFlow.scheduledOutflowsMinor)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-stroke-line pt-2 text-label-md font-medium">
                  <span className="text-ink-solid">Projected day {horizon}</span>
                  <span className="tabular-nums text-ink-solid">{formatMoney(projected)}</span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
