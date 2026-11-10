import type { DashboardSummary } from '../../shared/types';
import { addDays, formatDate, isoToday, monthKey, monthLabel } from '../../shared/dates';
import { listBudgets, listExpenses, listInvoices, listPatterns, listSentinelReviews, listTransactions, getOpeningBalance } from '../db/repo';

export function buildDashboard(workspaceId: string): DashboardSummary {
  const today = isoToday();
  const month = monthKey(today);
  const opening = getOpeningBalance(workspaceId);
  const transactions = listTransactions(workspaceId);
  const expenses = listExpenses(workspaceId);
  const invoices = listInvoices(workspaceId);
  const reviews = listSentinelReviews(workspaceId, 'open');
  const budgets = listBudgets(workspaceId, month);
  const patterns = listPatterns(workspaceId);

  const settled = transactions.filter((t) => t.status === 'settled');
  const net = settled.reduce((sum, t) => sum + (t.direction === 'incoming' ? t.amountMinor : -t.amountMinor), 0);
  const recordedBalanceMinor = opening + net;

  const incomingThisMonthMinor = settled
    .filter((t) => t.direction === 'incoming' && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amountMinor, 0);

  const expensesThisMonthMinor = expenses
    .filter((e) => e.date.startsWith(month))
    .reduce((sum, e) => sum + e.amountMinor, 0);

  const openStatuses = new Set(['sent', 'overdue', 'partial', 'pending']);
  const openInvoices = invoices.filter((inv) => openStatuses.has(inv.status));
  const outstandingMinor = openInvoices.reduce((sum, inv) => sum + inv.dueMinor, 0);
  const overdue = invoices.filter((inv) => inv.status === 'overdue');

  const invoicesByStatus: Record<string, number> = {};
  for (const inv of invoices) invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] ?? 0) + 1;

  const revenueSeries: { label: string; valueMinor: number }[] = [];
  const expenseSeries: { label: string; valueMinor: number }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - offset);
    const key = d.toISOString().slice(0, 7);
    revenueSeries.push({
      label: monthLabel(`${key}-01`),
      valueMinor: settled
        .filter((t) => t.direction === 'incoming' && t.date.startsWith(key))
        .reduce((sum, t) => sum + t.amountMinor, 0),
    });
    expenseSeries.push({
      label: monthLabel(`${key}-01`),
      valueMinor: expenses.filter((e) => e.date.startsWith(key)).reduce((sum, e) => sum + e.amountMinor, 0),
    });
  }

  const attention: DashboardSummary['attention'] = [];
  for (const inv of overdue.slice(0, 2)) {
    attention.push({
      id: inv.id,
      kind: 'invoice',
      title: `${inv.number} is overdue`,
      detail: `${inv.customerName} · was due ${formatDate(inv.dueDate)}`,
      href: `/app/invoices/${inv.id}`,
      amountMinor: inv.dueMinor,
    });
  }
  for (const review of reviews.slice(0, 2)) {
    attention.push({
      id: review.id,
      kind: 'sentinel',
      title: review.title,
      detail: `${review.merchant} · evidence available`,
      href: `/app/sentinel/${review.id}`,
      amountMinor: review.amountMinor,
    });
  }
  for (const budget of budgets.filter((b) => b.state !== 'under').slice(0, 1)) {
    attention.push({
      id: budget.id,
      kind: 'budget',
      title: `${budget.category} budget at ${(budget.utilisationBps / 100).toFixed(0)}%`,
      detail: 'Review spend before the period closes',
      href: '/app/budgets',
      amountMinor: budget.spentMinor,
    });
  }
  const upcoming = patterns
    .filter((p) => p.nextExpectedDate >= today && p.nextExpectedDate <= addDays(today, 7))
    .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));
  if (upcoming.length) {
    const pattern = upcoming[0];
    attention.push({
      id: pattern.id,
      kind: 'bill',
      title: `${pattern.merchant} renewal expected`,
      detail: `Estimated ${formatDate(pattern.nextExpectedDate)} · ${pattern.confidence} confidence`,
      href: '/app/sentinel',
      amountMinor: pattern.amountMinor,
    });
  }

  return {
    recordedBalanceMinor,
    incomingThisMonthMinor,
    outstandingMinor,
    expensesThisMonthMinor,
    overdueCount: overdue.length,
    streakLabel: `Demo workspace · ${transactions.length} ledger records`,
    currency: 'USD',
    invoicesByStatus,
    revenueSeries,
    expenseSeries,
    recentTransactions: transactions.slice(0, 6),
    attention: attention.slice(0, 5),
  };
}
