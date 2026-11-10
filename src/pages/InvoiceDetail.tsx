import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Invoice } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../context/AppContext';
import {
  dueLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  invoiceStatusLabel,
  titleCase,
} from '../lib/format';
import { EmptyState, ErrorState, Icon, LoadingBlock, StatusBadge } from '../components/ui';

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, confirm } = useApp();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paypalConfigured, setPaypalConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<{ invoice: Invoice; paypalConfigured: boolean }>(`/invoices/${encodeURIComponent(id)}`)
      .then((data) => {
        setInvoice(data.invoice);
        setPaypalConfigured(data.paypalConfigured);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const act = async (action: 'send' | 'remind' | 'reconcile') => {
    if (!invoice) return;
    setBusy(action);
    try {
      const result = await api.post<{ message?: string }>(`/invoices/${invoice.id}/${action}`);
      toast(result.message ?? 'Action completed.', 'success');
      load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const cancelInvoice = async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: invoice.status === 'draft' ? `Delete draft ${invoice.number}?` : `Cancel ${invoice.number}?`,
      message:
        invoice.status === 'draft'
          ? 'The draft is removed from the local ledger. This cannot be undone.'
          : 'The invoice is cancelled. A PayPal invoice is only cancelled remotely when credentials are configured and the invoice was sent through PayPal.',
      confirmLabel: invoice.status === 'draft' ? 'Delete draft' : 'Cancel invoice',
      destructive: true,
    });
    if (!ok) return;
    setBusy('cancel');
    try {
      const result = await api.post<{ message?: string; deleted?: boolean }>(`/invoices/${invoice.id}/cancel`, { confirm: true });
      toast(result.message ?? 'Invoice cancelled.', 'success');
      if (result.deleted) navigate('/app/invoices');
      else load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.publicToken}`);
      toast('Customer payment link copied.', 'success');
    } catch {
      toast('Clipboard access was blocked by the browser.', 'error');
    }
  };

  if (loading && !invoice) return <LoadingBlock label="Loading invoice" rows={4} />;
  if (error && !invoice) return <ErrorState message={error} onRetry={load} />;
  if (!invoice) {
    return (
      <EmptyState
        icon="receipt_long"
        title="Invoice not found"
        description="This invoice does not exist in the demo workspace."
        action={<Link to="/app/invoices" className="btn btn-primary">Back to invoices</Link>}
      />
    );
  }

  const canSend = invoice.status === 'draft';
  const canRemind = ['sent', 'overdue', 'partial', 'pending'].includes(invoice.status);
  const canCancel = ['draft', 'sent', 'overdue', 'partial', 'pending'].includes(invoice.status);
  const canReconcile = Boolean(invoice.paypalInvoiceId) && paypalConfigured;
  const hostedUrl = invoice.paypalApprovalUrl?.startsWith('http') ? invoice.paypalApprovalUrl : null;

  const timeline: { label: string; detail: string | null; done: boolean; icon: string }[] = [
    { label: 'Draft created', detail: formatDateTime(invoice.createdAt), done: true, icon: 'edit_note' },
    {
      label: 'Sent to customer',
      detail: invoice.sentAt ? formatDateTime(invoice.sentAt) : null,
      done: Boolean(invoice.sentAt),
      icon: 'send',
    },
    {
      label: 'Payment received',
      detail: invoice.paidAt ? formatDateTime(invoice.paidAt) : null,
      done: invoice.status === 'paid' || invoice.paidMinor > 0,
      icon: 'payments',
    },
    {
      label: 'Reconciled',
      detail:
        invoice.status === 'paid'
          ? 'Local ledger mirrors the recorded payment'
          : invoice.status === 'refunded'
            ? 'Refund recorded'
            : null,
      done: invoice.status === 'paid' || invoice.status === 'refunded',
      icon: 'verified',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-label-md text-ink-muted">
          <Link to="/app/invoices" className="transition-colors hover:text-ink-solid">Invoices</Link>
          <Icon name="chevron_right" className="text-[14px]" />
          <span className="font-medium text-ink-solid">{invoice.number}</span>
        </div>
        <div className="flex flex-col justify-between gap-4 border-b border-stroke-line pb-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">
                {invoice.number} — {invoice.customerName}
              </h1>
              <StatusBadge status={invoice.status} label={invoiceStatusLabel(invoice.status)} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md text-ink-slate">
              <span>Issued {formatDate(invoice.issueDate)}</span>
              <span className="h-1 w-1 rounded-full bg-ink-muted" />
              <span>{dueLabel(invoice.dueDate, invoice.status)}</span>
              <span className="h-1 w-1 rounded-full bg-ink-muted" />
              <span className="uppercase tracking-wider text-caption-micro">Recorded in USD ledger</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 no-print">
            <div className="mr-1 hidden text-right sm:block">
              <span className="block text-caption-micro uppercase tracking-wider text-ink-muted">Total amount</span>
              <span className="text-headline-md tabular-nums text-ink-solid">{formatMoney(invoice.totalMinor)}</span>
            </div>
            {canSend ? (
              <button type="button" className="btn btn-primary" onClick={() => act('send')} disabled={busy !== null}>
                <Icon name="send" className="text-[17px]" />
                {busy === 'send' ? 'Sending' : 'Send invoice'}
              </button>
            ) : null}
            {canRemind ? (
              <button type="button" className="btn btn-secondary" onClick={() => act('remind')} disabled={busy !== null}>
                <Icon name="notification_important" className="text-[17px]" />
                {busy === 'remind' ? 'Working' : 'Remind'}
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={copyLink}>
              <Icon name="link" className="text-[17px]" />
              Copy link
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Icon name="print" className="text-[17px]" />
              Print / PDF
            </button>
            {canCancel ? (
              <button type="button" className="btn btn-danger" onClick={cancelInvoice} disabled={busy !== null}>
                <Icon name="block" className="text-[17px]" />
                {invoice.status === 'draft' ? 'Delete' : 'Cancel'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!paypalConfigured ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-stroke-line bg-surface-container-low/70 px-4 py-3 text-caption-micro text-ink-slate no-print">
          <Icon name="info" className="mt-px text-[16px]" />
          <span>
            PayPal server credentials are not configured. This invoice can still be sent in demo mode, where it is marked sent
            and no email or PayPal invoice is created.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-8">
          <section className="card p-6">
            <div className="flex items-center justify-between border-b border-stroke-line pb-4">
              <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
                <Icon name="account_balance_wallet" className="text-[20px] text-ink-slate" />
                Invoice overview
              </h2>
              <span className="chip">Local record</span>
            </div>
            <div className="grid grid-cols-1 gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Billed recipient</span>
                <p className="mt-1 truncate text-body-md font-medium text-ink-solid">{invoice.customerName}</p>
                <p className="mt-0.5 truncate text-label-sm text-ink-slate">{invoice.customerEmail}</p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Issue &amp; due</span>
                <p className="mt-1 text-body-md text-ink-solid">Issued {formatDate(invoice.issueDate)}</p>
                <p className="mt-0.5 text-body-md text-ink-solid">Due {formatDate(invoice.dueDate)}</p>
                <p className="mt-1 text-caption-micro text-ink-muted">{dueLabel(invoice.dueDate, invoice.status)}</p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Payment timestamp</span>
                <p className="mt-1 text-body-md font-medium text-ink-solid">
                  {invoice.paidAt ? formatDate(invoice.paidAt) : 'Not paid yet'}
                </p>
                <p className="mt-0.5 text-label-sm text-ink-slate">
                  {invoice.paidAt ? formatDateTime(invoice.paidAt) : invoice.status === 'draft' ? 'Draft not sent' : 'Awaiting settlement'}
                </p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Settlement method</span>
                <p className="mt-1 text-body-md font-medium text-ink-solid">
                  {invoice.paypalStatus === 'DEMO_ONLY'
                    ? 'Demo mode'
                    : invoice.paypalInvoiceId
                      ? 'PayPal Invoicing v2'
                      : 'Not sent'}
                </p>
                <p className="mt-0.5 truncate font-mono text-label-sm text-ink-slate">
                  {invoice.paypalInvoiceId ?? 'No PayPal invoice ID'}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-stroke-line pt-4 sm:grid-cols-4">
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Total</span>
                <p className="mt-0.5 text-body-md font-semibold tabular-nums text-ink-solid">{formatMoney(invoice.totalMinor)}</p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Paid</span>
                <p className="mt-0.5 text-body-md font-semibold tabular-nums text-ink-solid">{formatMoney(invoice.paidMinor)}</p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Balance</span>
                <p className="mt-0.5 text-body-md font-semibold tabular-nums text-ink-solid">{formatMoney(invoice.dueMinor)}</p>
              </div>
              <div>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Currency</span>
                <p className="mt-0.5 text-body-md font-semibold text-ink-solid">{invoice.currency}</p>
              </div>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-stroke-line px-6 py-4">
              <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
                <Icon name="format_list_bulleted" className="text-[20px] text-ink-slate" />
                Line items
              </h2>
              <span className="text-label-sm text-ink-muted">
                {invoice.items.length} deliverable{invoice.items.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="border-b border-stroke-line bg-surface-canvas/60">
                    <th className="table-th">Item &amp; description</th>
                    <th className="table-th text-center">Qty</th>
                    <th className="table-th text-right">Rate</th>
                    <th className="table-th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke-line">
                  {invoice.items.map((item) => (
                    <tr key={item.id}>
                      <td className="table-td align-top">
                        <p className="font-medium text-ink-solid">{item.description}</p>
                        {item.detail ? <p className="mt-1 max-w-md text-label-sm leading-relaxed text-ink-slate">{item.detail}</p> : null}
                      </td>
                      <td className="table-td text-center align-top tabular-nums">{formatQuantity(item.quantityMilli)}</td>
                      <td className="table-td text-right align-top tabular-nums">{formatMoney(item.unitPriceMinor)}</td>
                      <td className="table-td text-right align-top font-medium tabular-nums text-ink-solid">
                        {formatMoney(item.totalMinor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-stroke-line bg-surface-canvas/40 px-6 py-5">
              <div className="w-full max-w-xs space-y-2 text-body-md">
                <div className="flex justify-between text-ink-slate">
                  <span>Subtotal</span>
                  <span className="font-medium tabular-nums text-ink-solid">{formatMoney(invoice.subtotalMinor)}</span>
                </div>
                <div className="flex justify-between text-ink-slate">
                  <span>Tax ({invoice.taxRateBps / 100}%)</span>
                  <span className="tabular-nums text-ink-solid">{formatMoney(invoice.taxMinor)}</span>
                </div>
                <div className="flex justify-between text-ink-slate">
                  <span>Discount</span>
                  <span className="tabular-nums text-ink-solid">−{formatMoney(invoice.discountMinor)}</span>
                </div>
                <div className="border-t border-stroke-line pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-headline-sm text-ink-solid">Total</span>
                    <span className="text-headline-md tabular-nums text-ink-solid">{formatMoney(invoice.totalMinor)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-caption-micro text-ink-muted">
                    <span>Settled / balance</span>
                    <span className="tabular-nums">
                      {formatMoney(invoice.paidMinor)} / {formatMoney(invoice.dueMinor)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {invoice.notes || invoice.paymentTerms ? (
            <section className="card p-6">
              <div className="flex items-center gap-2">
                <Icon name="article" className="text-[18px] text-ink-slate" />
                <h2 className="text-label-md uppercase tracking-wider text-ink-solid">Terms &amp; notes</h2>
              </div>
              {invoice.notes ? <p className="mt-3 whitespace-pre-wrap text-body-md leading-relaxed text-ink-slate">{invoice.notes}</p> : null}
              {invoice.paymentTerms ? (
                <p className="mt-3 border-t border-stroke-line pt-3 text-caption-micro text-ink-muted">
                  Payment terms: <span className="text-ink-graphite">{invoice.paymentTerms}</span>
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5 lg:col-span-4">
          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">Payment timeline</h2>
              <Icon name="timeline" className="text-[19px] text-ink-muted" />
            </div>
            <ol className="mt-4 space-y-4">
              {timeline.map((event, index) => (
                <li key={event.label} className="relative flex gap-3">
                  {index < timeline.length - 1 ? (
                    <span className="absolute left-[13px] top-7 h-[calc(100%+2px)] w-px bg-stroke-line" aria-hidden="true" />
                  ) : null}
                  <span
                    className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      event.done ? 'border-ink-solid bg-ink-solid text-on-primary' : 'border-stroke-line bg-surface-raised text-ink-muted'
                    }`}
                  >
                    <Icon name={event.done ? 'check' : event.icon} className="text-[14px]" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className={`text-label-md ${event.done ? 'font-medium text-ink-solid' : 'text-ink-muted'}`}>{event.label}</p>
                    <p className="mt-0.5 text-caption-micro text-ink-muted">{event.detail ?? 'Pending'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="text-headline-sm text-ink-solid">PayPal reconciliation</h2>
              <StatusBadge status={paypalConfigured ? 'live' : 'info'} label={paypalConfigured ? 'Live' : 'Demo'} />
            </div>
            <dl className="mt-4 space-y-3 text-label-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-muted">PayPal status</dt>
                <dd className="text-right font-medium text-ink-solid">
                  {invoice.paypalStatus ? titleCase(invoice.paypalStatus) : 'Not sent'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-muted">Invoice ID</dt>
                <dd className="truncate text-right font-mono text-caption-micro text-ink-graphite">
                  {invoice.paypalInvoiceId ?? '—'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-ink-muted">Hosted payment page</dt>
                <dd className="text-right">
                  {hostedUrl ? (
                    <a href={hostedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-label-sm text-ink-solid underline underline-offset-2">
                      Open
                      <Icon name="open_in_new" className="text-[13px]" />
                    </a>
                  ) : (
                    <span className="text-caption-micro text-ink-muted">Not available</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => act('reconcile')}
                disabled={!canReconcile || busy !== null}
                title={
                  !invoice.paypalInvoiceId
                    ? 'This invoice has no PayPal invoice ID. Send it through PayPal first.'
                    : !paypalConfigured
                      ? 'PayPal server credentials are not configured.'
                      : 'Fetch authoritative PayPal state'
                }
              >
                <Icon name="sync" className="text-[17px]" />
                {busy === 'reconcile' ? 'Reconciling' : 'Reconcile with PayPal'}
              </button>
              <p className="text-caption-micro leading-relaxed text-ink-muted">
                {!paypalConfigured
                  ? 'Reconciliation is disabled because PayPal server credentials are not configured.'
                  : !invoice.paypalInvoiceId
                    ? 'Reconciliation is disabled until this invoice exists as a PayPal invoice.'
                    : 'Reconciliation retrieves the authoritative paid amount, balance, and status from PayPal.'}
              </p>
              <Link to={`/pay/${invoice.publicToken}`} target="_blank" className="btn btn-ghost w-full">
                <Icon name="open_in_new" className="text-[16px]" />
                Open customer payment page
              </Link>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-label-md uppercase tracking-wider text-ink-solid">Audit reference</h2>
            <dl className="mt-3 space-y-2 text-caption-micro">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Local invoice ID</dt>
                <dd className="font-mono text-ink-graphite">{invoice.id}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Public token</dt>
                <dd className="truncate font-mono text-ink-graphite">{invoice.publicToken.slice(0, 12)}…</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Last updated</dt>
                <dd className="text-ink-graphite">{formatDateTime(invoice.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
