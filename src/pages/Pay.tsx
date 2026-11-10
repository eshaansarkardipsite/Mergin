import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { InvoiceLineItem, InvoiceStatus } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { dueLabel, formatDate, formatMoney, formatQuantity, invoiceStatusLabel } from '../lib/format';
import { InlineAlert } from '../context/AppContext';
import { Icon, Logo, Spinner, StatusBadge } from '../components/ui';

interface PublicInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: 'USD';
  customerName: string;
  items: InvoiceLineItem[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  notes: string;
  paymentTerms: string;
  paypalStatus: string | null;
  paypalApprovalUrl: string | null;
}

interface PublicPaymentView {
  workspaceName: string;
  demoEnvironment: boolean;
  invoice: PublicInvoice;
  paypalConfigured: boolean;
  canDemoPay: boolean;
  paymentMode: 'paypal' | 'demo' | 'sample';
  paymentRef: string | null;
  simulated: boolean;
  message?: string;
}

export default function Pay() {
  const { publicToken = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<PublicPaymentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'demo' | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<PublicPaymentView>(`/pay/${encodeURIComponent(publicToken)}`);
      setView(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [publicToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const invoice = view?.invoice;
  const settled = invoice ? ['paid', 'refunded', 'cancelled'].includes(invoice.status) || invoice.dueMinor <= 0 : false;

  // Returning from PayPal: never confirm locally. Poll the authoritative server state.
  useEffect(() => {
    if (searchParams.get('paypal') !== 'return' || !view || settled) return;
    let attempts = 0;
    let cancelled = false;
    setChecking(true);
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const data = await api.post<PublicPaymentView>(`/pay/${encodeURIComponent(publicToken)}/refresh`);
        if (cancelled) return;
        setView(data);
        if (['paid', 'refunded'].includes(data.invoice.status) || data.invoice.dueMinor <= 0) {
          setChecking(false);
          return;
        }
      } catch {
        // Keep showing "processing"; the customer can retry the check manually.
      }
      if (attempts >= 6) {
        setChecking(false);
        return;
      }
      window.setTimeout(tick, 4000);
    };
    void tick();
    return () => {
      cancelled = true;
      setChecking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, publicToken, settled]);

  const refresh = async () => {
    setBusy('refresh');
    setError(null);
    try {
      const data = await api.post<PublicPaymentView>(`/pay/${encodeURIComponent(publicToken)}/refresh`);
      setView(data);
      const next = new URLSearchParams(searchParams);
      next.delete('paypal');
      setSearchParams(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      setChecking(false);
    }
  };

  const demoPay = async () => {
    setBusy('demo');
    setError(null);
    try {
      const data = await api.post<PublicPaymentView>(`/pay/${encodeURIComponent(publicToken)}/demo-pay`);
      setView(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const taxRateLabel = useMemo(() => {
    if (!invoice || invoice.subtotalMinor === 0) return '0.0%';
    const afterDiscount = invoice.subtotalMinor - invoice.discountMinor;
    if (afterDiscount <= 0) return '0.0%';
    return `${((invoice.taxMinor / afterDiscount) * 100).toFixed(1)}%`;
  }, [invoice]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
        <div className="flex items-center gap-3 text-body-md text-ink-slate">
          <Spinner />
          Loading payment page
        </div>
      </div>
    );
  }

  if (!view || !invoice) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-canvas">
        <PublicHeader workspaceName="MERGIN" />
        <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-12">
          <div className="card w-full p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container">
              <Icon name="link_off" className="text-[24px]" />
            </div>
            <h1 className="mt-4 text-headline-md text-ink-solid">Payment link unavailable</h1>
            <p className="mt-2 text-body-md text-ink-slate">
              {error ?? 'This payment link does not match an invoice in this workspace.'}
            </p>
            <button type="button" className="btn btn-secondary mt-5" onClick={() => void load()}>
              <Icon name="refresh" className="text-[17px]" />
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const hostedUrl = invoice.paypalApprovalUrl?.startsWith('http') ? invoice.paypalApprovalUrl : null;
  const paypalReady = view.paymentMode === 'paypal' && hostedUrl;

  return (
    <div className="flex min-h-screen flex-col bg-surface-canvas">
      <PublicHeader workspaceName={view.workspaceName} demo={view.demoEnvironment} />

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption-micro uppercase tracking-wider text-ink-muted">
            Secure payment page · invoice {invoice.number}
          </span>
          <span className="chip-outline">{view.simulated ? 'Demo checkout' : 'PayPal checkout'}</span>
        </div>

        {view.simulated ? (
          <div className="mb-5">
            <InlineAlert title="Demo checkout">
              {paypalReady
                ? 'This page links to a PayPal-hosted invoice when configured. No payment is confirmed here until PayPal reports it.'
                : 'PayPal credentials or a hosted invoice link are not present in this local demo. Any payment recorded here is simulated and moves no real funds.'}
            </InlineAlert>
          </div>
        ) : null}

        {error ? (
          <div className="mb-5">
            <InlineAlert tone="error" title="Payment status could not be updated">
              {error}
            </InlineAlert>
          </div>
        ) : null}

        {settled ? (
          <div className="space-y-5">
            <section className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-solid text-on-primary">
                  <Icon name="check" className="text-[26px]" />
                </div>
                <div>
                  <p className="text-caption-micro uppercase tracking-wider text-ink-muted">
                    {invoice.status === 'refunded' ? 'Refund recorded' : 'Payment recorded'}
                  </p>
                  <h1 className="mt-1 text-headline-md text-ink-solid">
                    {invoice.status === 'refunded' ? 'Invoice refunded' : 'Invoice settled'}
                  </h1>
                  <p className="mt-1 text-body-md text-ink-slate">
                    {invoice.number} · {view.workspaceName}. {view.paymentRef ? `Reference ${view.paymentRef}.` : ''}
                  </p>
                </div>
              </div>
              <div className="text-left md:text-right">
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Amount recorded</span>
                <p className="text-headline-md tabular-nums text-ink-solid">{formatMoney(invoice.paidMinor)}</p>
              </div>
            </section>

            <InvoiceSummary invoice={invoice} taxRateLabel={taxRateLabel} />

            <section className="card p-6">
              <h2 className="text-headline-sm text-ink-solid">Payment details</h2>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-label-md sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={invoice.status} label={invoiceStatusLabel(invoice.status)} />
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Payment reference</dt>
                  <dd className="mt-1 font-mono text-ink-graphite">{view.paymentRef ?? 'Not recorded'}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Total</dt>
                  <dd className="mt-1 tabular-nums text-ink-solid">{formatMoney(invoice.totalMinor)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Balance</dt>
                  <dd className="mt-1 tabular-nums text-ink-solid">{formatMoney(invoice.dueMinor)}</dd>
                </div>
              </dl>
              <button type="button" className="btn btn-secondary mt-5" onClick={() => void refresh()} disabled={busy !== null}>
                <Icon name="refresh" className="text-[17px]" />
                {busy === 'refresh' ? 'Checking' : 'Refresh status'}
              </button>
              <p className="mt-3 text-caption-micro leading-relaxed text-ink-muted">
                {view.simulated
                  ? 'This record is a local demo. No real funds moved and no receipt is filed with PayPal.'
                  : 'This status mirrors the last verified PayPal state for the invoice. Refresh to fetch the latest state.'}
              </p>
            </section>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <InvoiceSummary invoice={invoice} taxRateLabel={taxRateLabel} />
            </div>

            <div className="flex flex-col gap-4 lg:col-span-5">
              <section className="card p-5">
                <div className="flex items-center justify-between border-b border-stroke-line pb-3">
                  <h2 className="text-headline-sm text-ink-solid">
                    {paypalReady ? 'Pay with PayPal' : 'Demo checkout'}
                  </h2>
                  <span className="chip">{paypalReady ? 'PayPal' : 'Simulated'}</span>
                </div>

                <div className="mt-4 rounded-xl bg-surface-canvas p-4">
                  <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Balance due</span>
                  <p className="mt-1 text-[30px] font-semibold leading-9 tabular-nums tracking-tight text-ink-solid">
                    {formatMoney(invoice.dueMinor)}
                  </p>
                  <p className="mt-1 text-caption-micro text-ink-slate">
                    Due {formatDate(invoice.dueDate)} · {dueLabel(invoice.dueDate, invoice.status)}
                  </p>
                </div>

                {checking ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-stroke-line bg-surface-container-low p-3 text-label-sm text-ink-graphite">
                    <Spinner className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Waiting for confirmed payment data from the server. Returning from PayPal does not settle the invoice by
                      itself.
                    </span>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  {paypalReady ? (
                    <a href={hostedUrl} target="_blank" rel="noreferrer" className="btn btn-primary h-12 w-full">
                      <Icon name="open_in_new" className="text-[18px]" />
                      Continue to PayPal
                    </a>
                  ) : null}

                  {view.canDemoPay ? (
                    <button type="button" className="btn btn-primary h-12 w-full" onClick={() => void demoPay()} disabled={busy !== null}>
                      {busy === 'demo' ? <Spinner className="h-4 w-4" /> : <Icon name="science" className="text-[18px]" />}
                      {busy === 'demo' ? 'Recording demo payment' : `Simulate ${formatMoney(invoice.dueMinor)} payment`}
                    </button>
                  ) : null}

                  {!paypalReady && !view.canDemoPay ? (
                    <p className="rounded-xl border border-stroke-line bg-surface-container-low p-3 text-label-sm text-ink-slate">
                      This invoice cannot be paid from this page. Its balance or status does not allow payment, or live PayPal
                      checkout is not configured.
                    </p>
                  ) : null}

                  <button type="button" className="btn btn-secondary h-11 w-full" onClick={() => void refresh()} disabled={busy !== null}>
                    <Icon name="refresh" className="text-[17px]" />
                    {busy === 'refresh' ? 'Checking PayPal' : 'Check payment status'}
                  </button>
                </div>

                <p className="mt-3 text-caption-micro leading-relaxed text-ink-muted">
                  {paypalReady
                    ? 'Payment happens on PayPal’s hosted invoice page. This page never marks the invoice paid on return; the server confirms the captured amount before updating the ledger.'
                    : 'Simulated payments are recorded locally and labeled in the audit log. No card, bank, or PayPal credentials are collected here.'}
                </p>
              </section>

              <section className="card p-4">
                <div className="flex items-center gap-3">
                  <Icon name="lock" className="text-[18px] text-ink-slate" />
                  <div className="min-w-0">
                    <p className="text-label-md font-medium text-ink-solid">PayPal credentials stay server-side</p>
                    <p className="mt-0.5 text-caption-micro leading-relaxed text-ink-slate">
                      This page never receives the PayPal client secret or webhook key. Amounts are stored in integer cents.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto flex w-full max-w-[1240px] flex-col items-center justify-between gap-2 px-4 py-5 text-caption-micro text-ink-slate sm:flex-row md:px-8">
        <span>Powered by MERGIN · demonstration build</span>
        <span>Invoice amounts are calculated and stored as integer USD cents.</span>
      </footer>
    </div>
  );
}

function PublicHeader({ workspaceName, demo = false }: { workspaceName: string; demo?: boolean }) {
  return (
    <header className="border-b border-stroke-line bg-surface-raised">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Logo height={22} />
          <span className="hidden h-5 w-px bg-stroke-line sm:block" />
          <span className="truncate text-label-md text-ink-graphite">{workspaceName}</span>
        </div>
        <div className="flex items-center gap-2">
          {demo ? <span className="chip-outline">Demo checkout</span> : null}
          <span className="inline-flex items-center gap-1.5 text-caption-micro text-ink-slate">
            <Icon name="lock" className="text-[14px]" />
            Server-verified amounts
          </span>
        </div>
      </div>
    </header>
  );
}

function InvoiceSummary({ invoice, taxRateLabel }: { invoice: PublicInvoice; taxRateLabel: string }) {
  return (
    <section className="card flex flex-col gap-5 p-6">
      <div className="flex flex-col justify-between gap-3 border-b border-stroke-line pb-4 sm:flex-row sm:items-start">
        <div>
          <span className="chip">Payable invoice</span>
          <h1 className="mt-2 text-headline-md text-ink-solid">{invoice.customerName}</h1>
          <p className="mt-0.5 text-label-sm text-ink-slate">
            {invoice.number} · issued {formatDate(invoice.issueDate)}
          </p>
        </div>
        <div className="sm:text-right">
          <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Total balance due</span>
          <p className="text-headline-lg tabular-nums text-ink-solid">{formatMoney(invoice.dueMinor)}</p>
          <p className="mt-0.5 text-label-sm text-ink-slate">Due {formatDate(invoice.dueDate)}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-caption-micro uppercase tracking-wider text-ink-muted">Services</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-stroke-line">
                <th className="table-th pl-0">Item</th>
                <th className="table-th text-right">Qty</th>
                <th className="table-th text-right">Rate</th>
                <th className="table-th pr-0 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-line">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="table-td pl-0">
                    <p className="font-medium text-ink-solid">{item.description}</p>
                    {item.detail ? <p className="mt-0.5 text-caption-micro text-ink-slate">{item.detail}</p> : null}
                  </td>
                  <td className="table-td text-right tabular-nums text-ink-slate">{formatQuantity(item.quantityMilli)}</td>
                  <td className="table-td text-right tabular-nums">{formatMoney(item.unitPriceMinor)}</td>
                  <td className="table-td pr-0 text-right font-medium tabular-nums text-ink-solid">
                    {formatMoney(item.totalMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-surface-canvas p-4">
        <div className="space-y-2 text-body-md">
          <div className="flex justify-between text-ink-slate">
            <span>Subtotal</span>
            <span className="tabular-nums text-ink-solid">{formatMoney(invoice.subtotalMinor)}</span>
          </div>
          <div className="flex justify-between text-ink-slate">
            <span>Tax ({taxRateLabel})</span>
            <span className="tabular-nums text-ink-solid">{formatMoney(invoice.taxMinor)}</span>
          </div>
          <div className="flex justify-between text-ink-slate">
            <span>Discount</span>
            <span className="tabular-nums text-ink-solid">−{formatMoney(invoice.discountMinor)}</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-stroke-line pt-2">
            <span className="text-body-md font-semibold text-ink-solid">Total</span>
            <span className="text-headline-sm tabular-nums text-ink-solid">{formatMoney(invoice.totalMinor)}</span>
          </div>
          {invoice.paidMinor > 0 ? (
            <div className="flex justify-between text-caption-micro text-ink-muted">
              <span>Already recorded</span>
              <span className="tabular-nums">{formatMoney(invoice.paidMinor)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {invoice.notes ? (
        <div>
          <p className="text-caption-micro uppercase tracking-wider text-ink-muted">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-body-md leading-relaxed text-ink-slate">{invoice.notes}</p>
        </div>
      ) : null}

      {invoice.paymentTerms ? (
        <p className="border-t border-stroke-line pt-3 text-caption-micro text-ink-muted">
          Payment terms: <span className="text-ink-graphite">{invoice.paymentTerms}</span>
        </p>
      ) : null}
    </section>
  );
}
