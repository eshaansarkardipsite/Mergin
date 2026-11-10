import type { CashFlowPoint, CashFlowSummary, RecurringPattern } from '../../shared/types';
import { addDays, formatDate, isoToday, monthKey } from '../../shared/dates';
import { getOpeningBalance, listPatterns, listTransactions, listInvoices } from '../db/repo';

const CADENCE_DAYS: Record<RecurringPattern['cadence'], number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

function occurrences(pattern: RecurringPattern, start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = pattern.nextExpectedDate;
  let guard = 0;
  while (cursor <= end && guard < 60) {
    if (cursor >= start) dates.push(cursor);
    cursor = addDays(cursor, CADENCE_DAYS[pattern.cadence]);
    guard += 1;
  }
  return dates;
}

export type CashFlowScenario = 'baseline' | 'conservative';

const CONSERVATIVE_BUFFER_BPS = 1000;

export function buildCashFlow(
  workspaceId: string,
  horizonDays: 7 | 30,
  scenario: CashFlowScenario = 'baseline',
): CashFlowSummary {
  const bufferBps = scenario === 'conservative' ? CONSERVATIVE_BUFFER_BPS : 0;
  const buffered = (amountMinor: number) => amountMinor + Math.round((amountMinor * bufferBps) / 10_000);
  const today = isoToday();
  const opening = getOpeningBalance(workspaceId);
  const transactions = listTransactions(workspaceId).filter((t) => t.status === 'settled');
  const patterns = listPatterns(workspaceId);
  const invoices = listInvoices(workspaceId);
  const month = monthKey(today);

  const balanceAt = (date: string) =>
    opening +
    transactions
      .filter((t) => t.date <= date)
      .reduce((sum, t) => sum + (t.direction === 'incoming' ? t.amountMinor : -t.amountMinor), 0);

  const points: CashFlowPoint[] = [];
  for (let weeksAgo = 6; weeksAgo >= 1; weeksAgo -= 1) {
    const date = addDays(today, -weeksAgo * 7);
    points.push({
      label: formatDate(date, { month: 'short', day: 'numeric' }),
      date,
      inflowMinor: 0,
      outflowMinor: 0,
      balanceMinor: balanceAt(date),
      estimated: false,
    });
  }
  const currentBalance = balanceAt(today);
  points.push({
    label: formatDate(today, { month: 'short', day: 'numeric' }),
    date: today,
    inflowMinor: 0,
    outflowMinor: 0,
    balanceMinor: currentBalance,
    estimated: false,
  });

  const end = addDays(today, horizonDays);
  const scheduled: { date: string; amountMinor: number; merchant: string }[] = [];
  for (const pattern of patterns) {
    for (const date of occurrences(pattern, addDays(today, 1), end)) {
      scheduled.push({ date, amountMinor: buffered(pattern.amountMinor), merchant: pattern.merchant });
    }
  }

  for (let day = 1; day <= horizonDays; day += 1) {
    const date = addDays(today, day);
    const dueToday = scheduled.filter((s) => s.date === date);
    const outflow = dueToday.reduce((sum, s) => sum + s.amountMinor, 0);
    const previous = points[points.length - 1];
    points.push({
      label: formatDate(date, { month: 'short', day: 'numeric' }),
      date,
      inflowMinor: 0,
      outflowMinor: outflow,
      balanceMinor: previous.balanceMinor - outflow,
      estimated: true,
    });
  }

  const confirmedReceiptsMinor = transactions
    .filter((t) => t.direction === 'incoming' && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amountMinor, 0);
  const outstandingMinor = invoices
    .filter((inv) => ['sent', 'overdue', 'partial', 'pending'].includes(inv.status))
    .reduce((sum, inv) => sum + inv.dueMinor, 0);

  return {
    recordedBalanceMinor: currentBalance,
    confirmedReceiptsMinor,
    outstandingMinor,
    scheduledOutflowsMinor: scheduled.reduce((sum, s) => sum + s.amountMinor, 0),
    points,
    assumptions: [
      `Forecast horizon: ${horizonDays} days from ${formatDate(today)}.`,
      'Unpaid invoices are excluded. They appear as outstanding receivables, never guaranteed income.',
      'Outflows use Sentinel-detected recurring charges (minimum 3 observations). One-off spend is not predicted.',
      scenario === 'conservative'
        ? `Conservative scenario adds a ${(bufferBps / 100).toFixed(0)}% buffer to every forecast outflow. It does not assume any receivable is collected.`
        : 'Baseline scenario uses detected recurring charge amounts without an additional buffer.',
      'The starting balance is the recorded demo ledger balance, not a live bank feed.',
      'All figures are USD. No cross-currency conversion is applied.',
    ],
    currency: 'USD',
    scenario,
    outflowBufferBps: bufferBps,
  };
}
