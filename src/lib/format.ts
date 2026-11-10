import { formatDate, daysBetween, isoToday } from '../../shared/dates';
import type { InvoiceStatus, SentinelStatus } from '../../shared/types';

export { formatMoney, formatMoneyCompact, formatPercent, formatQuantity } from '../../shared/money';
export { formatDate, formatDateTime, relativeTime, isoToday } from '../../shared/dates';

export function formatDateShort(date: string): string {
  return formatDate(date, { month: 'short', day: 'numeric' });
}

export function invoiceStatusLabel(status: InvoiceStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'sent':
      return 'Sent';
    case 'partial':
      return 'Partially paid';
    case 'pending':
      return 'Payment pending';
    case 'paid':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
      return 'Cancelled';
    case 'overdue':
      return 'Overdue';
  }
}

export function sentinelStatusLabel(status: SentinelStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'kept':
      return 'Kept';
    case 'remind':
      return 'Remind me';
    case 'follow-up':
      return 'Follow up';
    case 'dismissed':
      return 'Dismissed';
  }
}

export function sentinelReasonLabel(reason: string): string {
  switch (reason) {
    case 'price-change':
      return 'Price change';
    case 'possible-duplicate':
      return 'Possible overlap';
    case 'renewal-soon':
      return 'Renewal soon';
    case 'new-pattern':
      return 'New pattern';
    default:
      return reason;
  }
}

export function titleCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function dueLabel(dueDate: string, status: string): string {
  if (['paid', 'cancelled', 'refunded', 'draft'].includes(status)) return formatDateShort(dueDate);
  const delta = daysBetween(isoToday(), dueDate);
  if (delta < 0) return `${Math.abs(delta)}d past due`;
  if (delta === 0) return 'Due today';
  return `Due in ${delta}d`;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]): void {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
