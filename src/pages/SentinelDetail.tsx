import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { RecurringPattern, SentinelReview, SentinelStatus, Transaction } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  sentinelReasonLabel,
  sentinelStatusLabel,
  titleCase,
} from '../lib/format';
import {
  BackLink,
  EmptyState,
  ErrorState,
  Icon,
  LoadingBlock,
  StatusBadge,
} from '../components/ui';

interface DetailResponse {
  review: SentinelReview;
  pattern: RecurringPattern | null;
  evidence: Transaction[];
  relatedReviews: SentinelReview[];
  usageDataConnected: boolean;
}

const DECISIONS: { value: Exclude<SentinelStatus, 'open'>; label: string; description: string; icon: string }[] = [
  {
    value: 'kept',
    label: 'Keep and monitor',
    description: 'Accept the charge and keep watching this pattern.',
    icon: 'check',
  },
  {
    value: 'remind',
    label: 'Remind me',
    description: 'Keep the signal open for a later reminder.',
    icon: 'notifications',
  },
  {
    value: 'follow-up',
    label: 'Follow up',
    description: 'Mark that you will review this with the vendor or team.',
    icon: 'schedule',
  },
  {
    value: 'dismissed',
    label: 'Dismiss',
    description: 'Close the signal without further action.',
    icon: 'close',
  },
];

export default function SentinelDetail() {
  const { id = '' } = useParams();
  const { toast } = useApp();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Exclude<SentinelStatus, 'open'>>('kept');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<DetailResponse>(`/sentinel/${encodeURIComponent(id)}`)
      .then((response) => {
        setData(response);
        if (response.review.status !== 'open') setStatus(response.review.status);
        setNote(response.review.decisionNote ?? '');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const decide = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data) return;
    setSaving(true);
    setFormError(null);
    try {
      const result = await api.post<{ review: SentinelReview }>(`/sentinel/${data.review.id}/decision`, {
        status,
        note: note.trim(),
      });
      toast(`Decision recorded: ${DECISIONS.find((decision) => decision.value === result.review.status)?.label ?? result.review.status}.`, 'success');
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading Sentinel review" rows={5} />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) {
    return (
      <EmptyState
        icon="radar"
        title="Sentinel review not found"
        description="This review does not exist in the demo workspace."
        action={
          <Link to="/app/sentinel" className="btn btn-primary">
            Back to Sentinel
          </Link>
        }
      />
    );
  }

  const { review, pattern, evidence } = data;
  const decided = review.status !== 'open';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink to="/app/sentinel" label="Sentinel" />
        <div className="flex flex-col justify-between gap-3 border-b border-stroke-line pb-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">{review.merchant}</h1>
              <StatusBadge status={review.status} label={sentinelStatusLabel(review.status)} />
              <span className="chip-outline">{sentinelReasonLabel(review.reason)}</span>
            </div>
            <p className="mt-1.5 text-body-md text-ink-slate">{review.title}</p>
            <p className="mt-1 text-caption-micro text-ink-muted">
              Detected {formatDate(review.createdAt)} · last updated {formatDateTime(review.updatedAt)}
            </p>
          </div>
          <div className="shrink-0 md:text-right">
            <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Detected charge</span>
            <p className="text-headline-md tabular-nums text-ink-solid">
              {formatMoney(review.amountMinor)}
              <span className="text-label-md font-normal text-ink-slate"> / mo</span>
            </p>
            {review.previousAmountMinor !== review.amountMinor ? (
              <p className="mt-0.5 text-caption-micro tabular-nums text-ink-slate">
                Previous {formatMoney(review.previousAmountMinor)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <InlineAlert title={data.usageDataConnected ? 'Usage telemetry connected' : 'Usage data is not connected'}>
        {data.usageDataConnected
          ? 'Usage data is available for this workspace. Sentinel still reports only what the evidence supports.'
          : 'This signal is based on charges in the ledger only. MERGIN cannot tell whether the service is used, unused, or necessary. Your decision records judgment, not a verified usage fact.'}
      </InlineAlert>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <section className="card p-6">
            <div className="flex items-center justify-between border-b border-stroke-line pb-4">
              <h2 className="text-headline-sm text-ink-solid">Signal summary</h2>
              <span className="chip">Evidence-based</span>
            </div>
            <p className="mt-4 text-body-md leading-relaxed text-ink-graphite">{review.summary}</p>
            {review.decisionNote ? (
              <div className="mt-4 rounded-xl bg-surface-container-low p-4">
                <p className="text-caption-micro uppercase tracking-wider text-ink-muted">Latest decision note</p>
                <p className="mt-1 text-body-md text-ink-graphite">{review.decisionNote}</p>
                {review.decidedAt ? (
                  <p className="mt-1 text-caption-micro text-ink-muted">Recorded {formatDateTime(review.decidedAt)}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          {pattern ? (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-stroke-line px-6 py-4">
                <h2 className="text-headline-sm text-ink-solid">Detected pattern</h2>
                <span className="chip-outline">{titleCase(pattern.confidence)} confidence</span>
              </div>
              <dl className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
                <div>
                  <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Cadence</dt>
                  <dd className="mt-1 text-body-md font-medium text-ink-solid">{titleCase(pattern.cadence)}</dd>
                </div>
                <div>
                  <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Observations</dt>
                  <dd className="mt-1 text-body-md font-medium tabular-nums text-ink-solid">{pattern.occurrences}</dd>
                </div>
                <div>
                  <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Last charge</dt>
                  <dd className="mt-1 text-body-md font-medium text-ink-solid">{formatDate(pattern.lastChargeDate)}</dd>
                </div>
                <div>
                  <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Next expected</dt>
                  <dd className="mt-1 text-body-md font-medium text-ink-solid">{formatDate(pattern.nextExpectedDate)}</dd>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Evidence note</dt>
                  <dd className="mt-1 text-body-md leading-relaxed text-ink-slate">{pattern.evidenceNote}</dd>
                </div>
                {pattern.priceChangeBps > 0 ? (
                  <div className="col-span-2 sm:col-span-4">
                    <dt className="text-caption-micro uppercase tracking-wider text-ink-muted">Price change</dt>
                    <dd className="mt-1 text-body-md font-medium tabular-nums text-ink-solid">
                      +{(pattern.priceChangeBps / 100).toFixed(1)}% · {formatMoney(pattern.previousAmountMinor)} →{' '}
                      {formatMoney(pattern.amountMinor)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-stroke-line px-5 py-4">
              <div>
                <h2 className="text-headline-sm text-ink-solid">Transaction evidence</h2>
                <p className="mt-0.5 text-caption-micro text-ink-muted">Recorded charges that formed this pattern</p>
              </div>
              <span className="chip-outline">{evidence.length} charges</span>
            </div>
            {evidence.length === 0 ? (
              <EmptyState icon="receipt_long" title="No linked transactions" description="The pattern evidence could not be linked to ledger records." />
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-stroke-line bg-surface-container-low/40">
                      <th className="table-th">Date</th>
                      <th className="table-th">Description</th>
                      <th className="table-th">Status</th>
                      <th className="table-th text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke-line">
                    {evidence.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="table-td whitespace-nowrap text-ink-slate">{formatDate(transaction.date)}</td>
                        <td className="table-td">
                          <p className="text-ink-solid">{transaction.counterparty}</p>
                          <p className="text-caption-micro text-ink-muted">{transaction.description}</p>
                        </td>
                        <td className="table-td">
                          <StatusBadge status={transaction.status} />
                        </td>
                        <td className="table-td text-right font-medium tabular-nums text-ink-solid">
                          {formatMoney(transaction.amountMinor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="border-t border-stroke-line px-5 py-3 text-caption-micro text-ink-muted">
              Evidence is stored locally. No bank or subscription-provider API is queried.
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          <form onSubmit={decide} className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">Record decision</h2>
              {decided ? <StatusBadge status={review.status} label="Decided" /> : <span className="chip">Open</span>}
            </div>

            {formError ? (
              <div className="mt-3">
                <InlineAlert tone="error">{formError}</InlineAlert>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {DECISIONS.map((decision) => (
                <button
                  key={decision.value}
                  type="button"
                  aria-pressed={status === decision.value}
                  onClick={() => setStatus(decision.value)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    status === decision.value
                      ? 'border-ink-solid bg-surface-container-low'
                      : 'border-stroke-line hover:bg-surface-hover'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      status === decision.value ? 'border-ink-solid bg-ink-solid text-on-primary' : 'border-stroke-line text-ink-slate'
                    }`}
                  >
                    <Icon name={decision.icon} className="text-[15px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label-md font-medium text-ink-solid">{decision.label}</span>
                    <span className="mt-0.5 block text-caption-micro leading-4 text-ink-slate">{decision.description}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="field-label" htmlFor="decision-note">
                Decision note <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <textarea
                id="decision-note"
                className="textarea"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why this decision? e.g. confirmed with the team, or waiting on vendor reply."
                maxLength={500}
                disabled={saving}
              />
              <p className="field-hint">{note.length}/500 · Stored in the local audit trail.</p>
            </div>

            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={saving}>
              <Icon name="save" className="text-[17px]" />
              {saving ? 'Recording' : decided ? 'Update decision' : 'Record decision'}
            </button>
            <p className="mt-2 text-caption-micro leading-relaxed text-ink-muted">
              Decisions do not cancel the vendor subscription. MERGIN does not contact the merchant.
            </p>
          </form>

          <section className="card p-5">
            <h2 className="text-label-md uppercase tracking-wider text-ink-solid">Signal reference</h2>
            <dl className="mt-3 space-y-2 text-caption-micro">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Review ID</dt>
                <dd className="truncate font-mono text-ink-graphite">{review.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Pattern ID</dt>
                <dd className="truncate font-mono text-ink-graphite">{review.patternId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Reason</dt>
                <dd className="text-ink-graphite">{sentinelReasonLabel(review.reason)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Severity</dt>
                <dd className="text-ink-graphite">{titleCase(review.severity)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Currency</dt>
                <dd className="text-ink-graphite">{review.currency}</dd>
              </div>
            </dl>
          </section>

          {data.relatedReviews.length > 0 ? (
            <section className="card p-5">
              <h2 className="text-label-md uppercase tracking-wider text-ink-solid">Related signals</h2>
              <ul className="mt-3 divide-y divide-stroke-line">
                {data.relatedReviews.map((related) => (
                  <li key={related.id}>
                    <Link to={`/app/sentinel/${related.id}`} className="flex items-center justify-between gap-3 py-2.5 text-body-md transition-colors hover:text-ink-solid">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-graphite">{related.title}</span>
                        <span className="block text-caption-micro text-ink-muted">{sentinelReasonLabel(related.reason)}</span>
                      </span>
                      <Icon name="chevron_right" className="shrink-0 text-[16px] text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Link to="/app/sentinel" className="btn btn-secondary w-full">
            <Icon name="arrow_back" className="text-[17px]" />
            Back to review queue
          </Link>
        </aside>
      </div>
    </div>
  );
}
