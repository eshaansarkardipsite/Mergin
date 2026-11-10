import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RecurringPattern, SentinelReview } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDate, formatMoney, sentinelReasonLabel, sentinelStatusLabel, titleCase } from '../lib/format';
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingBlock,
  PageHeader,
  StatCard,
  StatusBadge,
  Tabs,
} from '../components/ui';

interface SentinelSummary {
  reviews: SentinelReview[];
  patterns: RecurringPattern[];
  counts: { open: number; attention: number; decided: number };
  estimatedMonthlyMinor: number;
  usageDataConnected: boolean;
  minimumObservations: number;
}

export default function Sentinel() {
  const { toast } = useApp();
  const [summary, setSummary] = useState<SentinelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [tab, setTab] = useState<'open' | 'decided' | 'all'>('open');

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<SentinelSummary>('/sentinel')
      .then((data) => setSummary(data))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await api.post<SentinelSummary & { added: number }>('/sentinel/scan');
      setSummary(result);
      toast(
        result.added > 0
          ? `Scan complete. ${result.added} new signal${result.added === 1 ? '' : 's'} from transaction evidence.`
          : 'Scan complete. No new signals; existing evidence already covers detected patterns.',
        result.added > 0 ? 'success' : 'info',
      );
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setScanning(false);
    }
  };

  const reviews = useMemo(() => {
    const list = summary?.reviews ?? [];
    if (tab === 'open') return list.filter((review) => review.status === 'open');
    if (tab === 'decided') return list.filter((review) => review.status !== 'open');
    return list;
  }, [summary, tab]);

  const annualised = summary ? summary.estimatedMonthlyMinor * 12 : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <>
            <Icon name="verified_user" className="text-[14px]" />
            Recurring intelligence · evidence only
          </>
        }
        title="Sentinel"
        description="Recurring charges detected from at least three matching ledger observations. Sentinel never claims whether a service is used or unused."
        actions={
          <>
            <Link to="/app/settings" className="btn btn-secondary">
              <Icon name="tune" className="text-[18px]" />
              Policy settings
            </Link>
            <button type="button" className="btn btn-primary" onClick={scan} disabled={scanning}>
              {scanning ? <Icon name="sync" className="animate-spin text-[18px]" /> : <Icon name="radar" className="text-[18px]" />}
              {scanning ? 'Scanning' : 'Run deep scan'}
            </button>
          </>
        }
      />

      {summary && !summary.usageDataConnected ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-stroke-line bg-surface-container-low/70 px-4 py-3 text-caption-micro text-ink-slate">
          <Icon name="visibility_off" className="mt-px text-[16px]" />
          <span>
            Usage telemetry is not connected. MERGIN can evidence charges and price changes, but not whether a subscription is
            actively used. Review decisions are yours to make.
          </span>
        </div>
      ) : null}

      {loading && !summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card p-5">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton mt-6 h-8 w-36" />
              </div>
            ))}
          </div>
          <LoadingBlock label="Loading Sentinel" rows={4} />
        </div>
      ) : error || !summary ? (
        <ErrorState message={error ?? 'Sentinel data is unavailable.'} onRetry={load} />
      ) : (
        <>
          <section aria-label="Sentinel metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Detected recurring spend"
              value={`${formatMoney(summary.estimatedMonthlyMinor)}/mo`}
              icon="payments"
              hint={`${formatMoney(annualised)} annualised · detected amounts`}
            />
            <StatCard
              label="Recurring patterns"
              value={String(summary.patterns.length)}
              icon="inventory_2"
              hint={`Minimum ${summary.minimumObservations} observations per pattern`}
            />
            <StatCard
              label="Open reviews"
              value={String(summary.counts.open)}
              icon="notification_important"
              tone={summary.counts.open > 0 ? 'emphasis' : 'default'}
              hint={`${summary.counts.attention} marked attention`}
            />
            <StatCard
              label="Usage telemetry"
              value="Not connected"
              icon="visibility_off"
              hint="No usage or non-usage claims are made"
            />
          </section>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <section className="card overflow-hidden lg:col-span-7">
              <div className="flex flex-col gap-3 border-b border-stroke-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-headline-sm text-ink-solid">Review queue</h2>
                    <p className="mt-0.5 text-caption-micro text-ink-muted">Evidence-backed signals, newest first</p>
                  </div>
                  <span className="chip">{summary.reviews.length} total</span>
                </div>
                <Tabs
                  value={tab}
                  onChange={(value) => setTab(value as 'open' | 'decided' | 'all')}
                  options={[
                    { value: 'open', label: 'Needs review', count: summary.counts.open },
                    { value: 'decided', label: 'Decided', count: summary.counts.decided },
                    { value: 'all', label: 'All', count: summary.reviews.length },
                  ]}
                />
              </div>

              {reviews.length === 0 ? (
                <EmptyState
                  icon={tab === 'decided' ? 'history' : 'check_circle'}
                  title={tab === 'decided' ? 'No decisions recorded' : 'Nothing needs review'}
                  description={
                    tab === 'decided'
                      ? 'Decisions you record on a signal will appear here.'
                      : 'Run a scan to detect recurring patterns from matching charges.'
                  }
                />
              ) : (
                <ul className="divide-y divide-stroke-line">
                  {reviews.map((review) => (
                    <li key={review.id}>
                      <Link to={`/app/sentinel/${review.id}`} className="block px-5 py-4 transition-colors hover:bg-surface-hover/60">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-body-md font-semibold text-ink-solid">{review.merchant}</h3>
                              <StatusBadge status={review.status} label={sentinelStatusLabel(review.status)} />
                              <span className="chip-outline">{sentinelReasonLabel(review.reason)}</span>
                            </div>
                            <p className="mt-1 text-body-md text-ink-slate">{review.title}</p>
                            <p className="mt-1 line-clamp-2 text-caption-micro leading-relaxed text-ink-muted">{review.summary}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-body-md font-semibold tabular-nums text-ink-solid">
                              {formatMoney(review.amountMinor)}
                              <span className="text-caption-micro font-normal text-ink-muted">/mo</span>
                            </p>
                            {review.previousAmountMinor !== review.amountMinor ? (
                              <p className="mt-0.5 text-caption-micro tabular-nums text-ink-muted">
                                was {formatMoney(review.previousAmountMinor)}
                              </p>
                            ) : null}
                            <p className="mt-1 text-caption-micro text-ink-muted">{formatDate(review.createdAt)}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card overflow-hidden lg:col-span-5">
              <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
                <div>
                  <h2 className="text-headline-sm text-ink-solid">Detected patterns</h2>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">Grouped from transaction evidence</p>
                </div>
                <span className="chip-outline">{summary.patterns.length}</span>
              </div>
              {summary.patterns.length === 0 ? (
                <EmptyState icon="radar" title="No patterns detected" description="Run a scan to look for at least three matching charges." />
              ) : (
                <ul className="divide-y divide-stroke-line">
                  {summary.patterns.map((pattern) => (
                    <li key={pattern.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-label-md font-medium text-ink-solid">{pattern.merchant}</p>
                          <p className="mt-0.5 text-caption-micro text-ink-muted">
                            {titleCase(pattern.cadence)} · {pattern.occurrences} observations · {pattern.category}
                          </p>
                          <p className="mt-1 text-caption-micro text-ink-slate">
                            Next expected {formatDate(pattern.nextExpectedDate)} · {titleCase(pattern.confidence)} confidence
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-label-md font-medium tabular-nums text-ink-solid">{formatMoney(pattern.amountMinor)}</p>
                          {pattern.priceChangeBps > 0 ? (
                            <p className="mt-0.5 text-caption-micro tabular-nums text-ink-muted">
                              +{(pattern.priceChangeBps / 100).toFixed(1)}%
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted">
                Amounts are detected from recorded charges. Annualised figures are arithmetic, not a forecast.
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
