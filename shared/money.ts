import type { Currency, InvoiceLineItem } from './types';

const CURRENCY_SYMBOLS: Record<Currency, string> = { USD: '$' };

export function formatMoney(amountMinor: number, currency: Currency = 'USD'): string {
  const whole = Math.trunc(amountMinor / 100);
  const cents = Math.abs(amountMinor % 100).toString().padStart(2, '0');
  const intl = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(whole));
  return `${amountMinor < 0 ? '-' : ''}${CURRENCY_SYMBOLS[currency] ?? ''}${intl}.${cents}`;
}

export function formatMoneyCompact(amountMinor: number, currency: Currency = 'USD'): string {
  const major = amountMinor / 100;
  const abs = Math.abs(major);
  const sign = major < 0 ? '-' : '';
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

export function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export function lineTotalMinor(quantityMilli: number, unitPriceMinor: number): number {
  // Both inputs are integers; quantity is thousandths, so this stays exact for safe values.
  return Math.round((quantityMilli * unitPriceMinor) / 1000);
}

export interface InvoiceTotals {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  dueMinor: number;
}

export function computeInvoiceTotals(
  items: Pick<InvoiceLineItem, 'quantityMilli' | 'unitPriceMinor'>[],
  taxRateBps = 0,
  discountMinor = 0,
  paidMinor = 0,
): InvoiceTotals {
  const subtotalMinor = items.reduce(
    (sum, item) => sum + lineTotalMinor(item.quantityMilli, item.unitPriceMinor),
    0,
  );
  const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
  const taxMinor = Math.round((taxableMinor * taxRateBps) / 10_000);
  const totalMinor = Math.max(0, taxableMinor + taxMinor);
  return {
    subtotalMinor,
    taxMinor,
    totalMinor,
    dueMinor: Math.max(0, totalMinor - paidMinor),
  };
}

export function formatQuantity(quantityMilli: number): string {
  const value = quantityMilli / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function parseQuantityToMilli(input: string): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1000);
}

export function parseMoneyToMinor(input: string): number {
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function minorToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
