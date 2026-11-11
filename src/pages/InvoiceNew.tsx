import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Invoice } from '../../shared/types';
import { addDays, isoToday } from '../../shared/dates';
import { computeInvoiceTotals, formatMoney, parseMoneyToMinor, parseQuantityToMilli } from '../../shared/money';
import { api, errorMessage } from '../lib/api';
import { useApp, InlineAlert } from '../context/AppContext';
import { BackLink, Icon, Logo, Spinner } from '../components/ui';

interface LineItemDraft {
  key: number;
  description: string;
  detail: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 2;

function blankItem(key: number): LineItemDraft {
  return { key, description: '', detail: '', quantity: '1', unitPrice: '' };
}

export default function InvoiceNew() {
  const { toast, user } = useApp();
  const navigate = useNavigate();
  const today = isoToday();

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [number, setNumber] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 30));
  const [paymentTerms, setPaymentTerms] = useState('Net 30 · PayPal invoice');
  const [notes, setNotes] = useState('');
  const [taxPercent, setTaxPercent] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [items, setItems] = useState<LineItemDraft[]>([blankItem(1)]);
  const [saving, setSaving] = useState<'draft' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const computed = computeInvoiceTotals(
      items.map((item) => ({
        quantityMilli: Math.max(0, parseQuantityToMilli(item.quantity)),
        unitPriceMinor: Math.max(0, parseMoneyToMinor(item.unitPrice)),
      })),
      Math.max(0, Math.round((Number.parseFloat(taxPercent) || 0) * 100)),
      Math.max(0, parseMoneyToMinor(discount)),
      0,
    );
    return computed;
  }, [items, taxPercent, discount]);

  const subtotal = items.reduce(
    (sum, item) => sum + Math.max(0, parseQuantityToMilli(item.quantity)) * Math.max(0, parseMoneyToMinor(item.unitPrice)) / 1000,
    0,
  );

  const updateItem = (key: number, patch: Partial<LineItemDraft>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const submit = async (mode: 'draft' | 'send') => {
    setError(null);
    if (!customerName.trim()) {
      setError('Enter a client name.');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setError('Enter a valid billing email.');
      return;
    }
    const validItems = items.filter(
      (item) => item.description.trim() && parseMoneyToMinor(item.unitPrice) > 0 && parseQuantityToMilli(item.quantity) > 0,
    );
    if (validItems.length === 0) {
      setError('Add at least one line item with a description, quantity, and positive rate.');
      return;
    }
    if (!issueDate || !dueDate) {
      setError('Set both the issue date and due date.');
      return;
    }
    if (dueDate < issueDate) {
      setError('The due date cannot be earlier than the issue date.');
      return;
    }
    const parsedTaxPercent = taxPercent.trim() === '' ? 0 : Number(taxPercent);
    if (!Number.isFinite(parsedTaxPercent) || parsedTaxPercent < 0 || parsedTaxPercent > 100) {
      setError('Tax rate must be a number between 0 and 100.');
      return;
    }
    const taxRateBps = Math.round(parsedTaxPercent * 100);

    setSaving(mode);
    try {
      const created = await api.post<{ invoice: Invoice }>('/invoices', {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        number: number.trim() || undefined,
        issueDate,
        dueDate,
        taxRateBps,
        discountMinor: Math.max(0, parseMoneyToMinor(discount)),
        notes: notes.trim(),
        paymentTerms: paymentTerms.trim(),
        items: validItems.map((item) => ({
          description: item.description.trim(),
          detail: item.detail.trim(),
          quantityMilli: parseQuantityToMilli(item.quantity),
          unitPriceMinor: parseMoneyToMinor(item.unitPrice),
        })),
      });

      if (mode === 'send') {
        try {
          const sent = await api.post<{ message?: string }>(`/invoices/${created.invoice.id}/send`);
          toast(sent.message ?? `Sent ${created.invoice.number}.`, 'success');
        } catch (err) {
          toast(`Draft ${created.invoice.number} saved, but sending failed: ${errorMessage(err)}`, 'error');
        }
      } else {
        toast(`Draft ${created.invoice.number} saved.`, 'success');
      }
      navigate(`/app/invoices/${created.invoice.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div className="flex flex-col gap-2">
        <BackLink to="/app/invoices" label="Invoices" />
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="text-headline-lg-mobile tracking-tight text-ink-solid md:text-headline-lg">Create invoice</h1>
            <p className="mt-1 max-w-xl text-body-md text-ink-slate">
              Configure client details and line items. Saving creates a draft in the local ledger; nothing is emailed until you
              send it.
            </p>
          </div>
          <span className="chip-outline self-start md:self-auto">Draft mode · USD</span>
        </div>
      </div>

      {error ? <InlineAlert tone="error" title="Invoice not saved">{error}</InlineAlert> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
                <Icon name="corporate_fare" className="text-[20px]" />
                Client details
              </h2>
              <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Required</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="client-name">Client name</label>
                <input
                  id="client-name"
                  className="input"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Acme Studios"
                  maxLength={120}
                  disabled={saving !== null}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="client-email">Billing email</label>
                <input
                  id="client-email"
                  type="email"
                  className="input"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  placeholder="billing@client.example"
                  maxLength={160}
                  disabled={saving !== null}
                />
              </div>
            </div>
            <p className="mt-3 text-caption-micro text-ink-muted">
              Saving upserts the client by email. No address book is shared beyond this workspace.
            </p>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
                <Icon name="tune" className="text-[20px]" />
                Invoice parameters
              </h2>
              <span className="text-label-sm text-ink-slate">USD standard ledger</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="invoice-number">Invoice reference</label>
                <input
                  id="invoice-number"
                  className="input"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  placeholder="Auto-assigned"
                  maxLength={40}
                  disabled={saving !== null}
                />
                <p className="field-hint">Leave blank to use the next sequential number.</p>
              </div>
              <div>
                <span className="field-label">Currency</span>
                <div className="flex h-11 items-center justify-between rounded-xl border border-stroke-line bg-surface-container-low px-3.5 text-body-md text-ink-slate">
                  USD ($)
                  <Icon name="lock" className="text-[16px]" />
                </div>
                <p className="field-hint">Single-currency ledger in this build.</p>
              </div>
              <div>
                <label className="field-label" htmlFor="issue-date">Issue date</label>
                <input
                  id="issue-date"
                  type="date"
                  className="input"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                  disabled={saving !== null}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="due-date">Due date</label>
                <input
                  id="due-date"
                  type="date"
                  className="input"
                  value={dueDate}
                  min={issueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={saving !== null}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="payment-terms">Payment terms</label>
                <input
                  id="payment-terms"
                  className="input"
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value)}
                  maxLength={2000}
                  disabled={saving !== null}
                />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between border-b border-stroke-line pb-3">
              <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
                <Icon name="format_list_bulleted" className="text-[20px]" />
                Line items
              </h2>
              <span className="text-caption-micro uppercase tracking-wider text-ink-muted">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-3 divide-y divide-stroke-line">
              {items.map((item, index) => (
                <div key={item.key} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-12 sm:items-start">
                  <div className="sm:col-span-6">
                    <label className="mb-1 block text-caption-micro uppercase tracking-wider text-ink-muted">
                      Description {index + 1}
                    </label>
                    <input
                      className="input h-10"
                      value={item.description}
                      onChange={(event) => updateItem(item.key, { description: event.target.value })}
                      placeholder="Brand identity system"
                      maxLength={200}
                      disabled={saving !== null}
                    />
                    <input
                      className="mt-1.5 w-full border-0 bg-transparent px-0.5 text-caption-micro text-ink-muted placeholder:text-ink-muted/70 focus:outline-none"
                      value={item.detail}
                      onChange={(event) => updateItem(item.key, { detail: event.target.value })}
                      placeholder="Optional detail shown on the invoice"
                      maxLength={1000}
                      disabled={saving !== null}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:col-span-6">
                    <div>
                      <label className="mb-1 block text-caption-micro uppercase tracking-wider text-ink-muted">Qty</label>
                      <input
                        className="input h-10 text-center"
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={item.quantity}
                        onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                        disabled={saving !== null}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-caption-micro uppercase tracking-wider text-ink-muted">Rate ($)</label>
                      <input
                        className="input h-10 text-right tabular-nums"
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })}
                        placeholder="0.00"
                        disabled={saving !== null}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-caption-micro uppercase tracking-wider text-ink-muted">Amount</label>
                      <div className="flex h-10 items-center justify-end rounded-xl bg-surface-container-low px-2 text-label-md font-medium tabular-nums text-ink-solid">
                        {formatMoney(
                          Math.round(
                            (Math.max(0, parseQuantityToMilli(item.quantity)) * Math.max(0, parseMoneyToMinor(item.unitPrice))) / 1000,
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end sm:col-span-12">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-caption-micro text-ink-muted transition-colors hover:text-ink-solid disabled:opacity-40"
                      onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                      disabled={items.length === 1 || saving !== null}
                      title={items.length === 1 ? 'An invoice needs at least one line item.' : 'Remove line item'}
                    >
                      <Icon name="delete" className="text-[15px]" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-col gap-4 border-t border-stroke-line pt-4 md:flex-row md:items-start md:justify-between">
              <button
                type="button"
                className="btn btn-secondary self-start"
                onClick={() => {
                  nextKey += 1;
                  setItems((current) => [...current, blankItem(nextKey)]);
                }}
                disabled={saving !== null}
              >
                <Icon name="add" className="text-[16px]" />
                Add item
              </button>

              <div className="w-full max-w-xs space-y-2 text-body-md">
                <div className="flex items-center justify-between text-ink-slate">
                  <span>Subtotal</span>
                  <span className="font-medium tabular-nums text-ink-solid">{formatMoney(Math.round(subtotal))}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-ink-slate">
                  <label htmlFor="tax-rate" className="flex items-center gap-1">
                    Tax
                    <input
                      id="tax-rate"
                      className="h-7 w-14 rounded-md border border-stroke-line bg-surface-raised px-1.5 text-right text-label-sm tabular-nums focus:border-ink-solid focus:outline-none"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      inputMode="decimal"
                      value={taxPercent}
                      onChange={(event) => setTaxPercent(event.target.value)}
                      aria-label="Tax rate percent"
                      disabled={saving !== null}
                    />
                    %
                  </label>
                  <span className="tabular-nums text-ink-solid">{formatMoney(totals.taxMinor)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-ink-slate">
                  <label htmlFor="discount" className="flex items-center gap-1">
                    Discount $
                    <input
                      id="discount"
                      className="h-7 w-20 rounded-md border border-stroke-line bg-surface-raised px-1.5 text-right text-label-sm tabular-nums focus:border-ink-solid focus:outline-none"
                      inputMode="decimal"
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                      aria-label="Discount amount"
                      disabled={saving !== null}
                    />
                  </label>
                  <span className="tabular-nums text-ink-solid">−{formatMoney(totals.totalMinor < totals.subtotalMinor ? totals.subtotalMinor + totals.taxMinor - totals.totalMinor : 0)}</span>
                </div>
                <div className="border-t border-stroke-line pt-2">
                  <div className="flex items-center justify-between text-headline-sm text-ink-solid">
                    <span>Total due</span>
                    <span className="tabular-nums">{formatMoney(totals.totalMinor)}</span>
                  </div>
                  <p className="mt-1 text-right text-caption-micro text-ink-muted">Tax applied after discount</p>
                </div>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-headline-sm text-ink-solid">
              <Icon name="notes" className="text-[20px]" />
              Notes
            </h2>
            <label className="field-label mt-4" htmlFor="invoice-notes">Notes to client</label>
            <textarea
              id="invoice-notes"
              className="textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Scope, delivery notes, or payment instructions."
              maxLength={4000}
              disabled={saving !== null}
            />
            <p className="field-hint">Stored locally. PayPal invoices include these notes when credentials are configured.</p>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/app/invoices" className="btn btn-ghost">
              Cancel
            </Link>
            <button type="button" className="btn btn-secondary" onClick={() => submit('draft')} disabled={saving !== null}>
              {saving === 'draft' ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[17px]" />}
              {saving === 'draft' ? 'Saving' : 'Save draft'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => submit('send')} disabled={saving !== null}>
              {saving === 'send' ? <Spinner className="h-4 w-4" /> : <Icon name="send" className="text-[17px]" />}
              {saving === 'send' ? 'Creating' : 'Save and send'}
            </button>
          </div>
          <p className="text-right text-caption-micro text-ink-muted">
            “Save and send” creates the draft first. With SMTP configured, the invoice is rendered to PDF and emailed to the
            billing address. With PayPal configured, a real PayPal invoice is created. Otherwise it is marked sent in demo
            mode with no email.
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:col-span-5">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-stroke-line px-4 py-3">
              <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Live preview</span>
              <span className="chip">Draft</span>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <Logo height={22} />
                  <p className="mt-1 text-caption-micro text-ink-muted">{user?.workspaceName ?? 'Your workspace'}</p>
                </div>
                <div className="text-right">
                  <p className="text-label-md font-semibold text-ink-solid">{number.trim() || 'INV-XXXX'}</p>
                  <p className="mt-0.5 text-caption-micro text-ink-muted">Issued {issueDate || '—'}</p>
                  <p className="text-caption-micro text-ink-muted">Due {dueDate || '—'}</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-caption-micro uppercase tracking-wider text-ink-muted">Bill to</p>
                <p className="mt-1 text-body-md font-medium text-ink-solid">{customerName || 'Client name'}</p>
                <p className="text-caption-micro text-ink-slate">{customerEmail || 'billing@client.example'}</p>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-stroke-line">
                <div className="grid grid-cols-12 gap-2 border-b border-stroke-line bg-surface-container-low px-3 py-2 text-caption-micro uppercase tracking-wider text-ink-muted">
                  <span className="col-span-7">Item</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-3 text-right">Amount</span>
                </div>
                {items.map((item) => (
                  <div key={item.key} className="grid grid-cols-12 items-start gap-2 border-b border-stroke-line px-3 py-2.5 last:border-0">
                    <div className="col-span-7 min-w-0">
                      <p className="truncate text-label-md font-medium text-ink-solid">{item.description || 'Line item'}</p>
                      {item.detail ? <p className="truncate text-caption-micro text-ink-muted">{item.detail}</p> : null}
                    </div>
                    <span className="col-span-2 text-center text-label-sm tabular-nums text-ink-slate">
                      {item.quantity || '0'}
                    </span>
                    <span className="col-span-3 text-right text-label-md font-medium tabular-nums text-ink-solid">
                      {formatMoney(
                        Math.round(
                          (Math.max(0, parseQuantityToMilli(item.quantity)) * Math.max(0, parseMoneyToMinor(item.unitPrice))) / 1000,
                        ),
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1.5 text-label-md">
                <div className="flex justify-between text-ink-slate">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMoney(Math.round(subtotal))}</span>
                </div>
                <div className="flex justify-between text-ink-slate">
                  <span>Tax</span>
                  <span className="tabular-nums">{formatMoney(totals.taxMinor)}</span>
                </div>
                <div className="flex justify-between border-t border-stroke-line pt-2 text-body-md font-semibold text-ink-solid">
                  <span>Total due</span>
                  <span className="tabular-nums">{formatMoney(totals.totalMinor)}</span>
                </div>
              </div>

              {notes ? <p className="mt-4 whitespace-pre-wrap text-caption-micro leading-relaxed text-ink-slate">{notes}</p> : null}

              <div className="mt-6 flex items-center justify-between border-t border-stroke-line pt-3">
                <span className="text-caption-micro text-ink-muted">Payable by PayPal invoice</span>
                <span className="text-caption-micro uppercase tracking-wider text-ink-muted">Powered by MERGIN</span>
              </div>
            </div>
          </div>
          <p className="mt-3 px-1 text-caption-micro leading-relaxed text-ink-muted">
            Preview uses the same integer-cent calculation as the API. The server recalculates totals on save; it never trusts
            client arithmetic.
          </p>
        </aside>
      </div>
    </div>
  );
}
