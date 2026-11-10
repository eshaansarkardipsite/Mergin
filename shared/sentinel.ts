import type { Transaction } from './types';

export interface DetectedPattern {
  merchant: string;
  normalizedMerchant: string;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  currency: Transaction['currency'];
  amountMinor: number;
  previousAmountMinor: number;
  priceChangeBps: number;
  occurrences: number;
  confidence: 'high' | 'medium' | 'low';
  nextExpectedDate: string;
  lastChargeDate: string;
  category: string;
  transactionIds: string[];
  evidenceNote: string;
}

const CADENCE_WINDOWS: { cadence: DetectedPattern['cadence']; min: number; max: number; target: number }[] = [
  { cadence: 'weekly', min: 5, max: 9, target: 7 },
  { cadence: 'monthly', min: 25, max: 35, target: 30 },
  { cadence: 'quarterly', min: 80, max: 100, target: 91 },
  { cadence: 'annual', min: 350, max: 380, target: 365 },
];

const NOISE_WORDS = /\b(inc|llc|ltd|co|corp|subscription|monthly|annual|plan|pro|enterprise|premium|payment|charge|invoice)\b/g;

export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(NOISE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Deterministic recurring-payment detection. Only settled/refunded outgoing
 * transactions are considered; a pattern needs at least `minObservations`
 * matching charges and a consistent interval.
 */
export function detectRecurringPatterns(
  transactions: Transaction[],
  minObservations = 3,
): DetectedPattern[] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.direction !== 'outgoing') continue;
    if (tx.status !== 'settled' && tx.status !== 'refunded') continue;
    const normalized = normalizeMerchant(tx.counterparty);
    if (!normalized) continue;
    const key = `${normalized}|${tx.currency}`;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const patterns: DetectedPattern[] = [];
  for (const list of groups.values()) {
    if (list.length < minObservations) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    const medianInterval = median(intervals);
    const window = CADENCE_WINDOWS.find((w) => medianInterval >= w.min && medianInterval <= w.max);
    if (!window) continue;

    const tolerance = Math.max(2, Math.round(window.target * 0.12));
    const matching = intervals.filter((d) => Math.abs(d - window.target) <= tolerance);
    const consistency = matching.length / intervals.length;
    if (consistency < 0.6) continue;

    const amounts = sorted.map((tx) => tx.amountMinor);
    const latest = amounts[amounts.length - 1];
    const baseline = median(amounts.slice(0, -1));
    const priceChangeBps = baseline > 0 ? Math.round(((latest - baseline) / baseline) * 10_000) : 0;
    const confidence: DetectedPattern['confidence'] =
      sorted.length >= 4 && consistency >= 0.8 ? 'high' : sorted.length >= 3 && consistency >= 0.7 ? 'medium' : 'low';

    patterns.push({
      merchant: sorted[sorted.length - 1].counterparty,
      normalizedMerchant: normalizeMerchant(sorted[sorted.length - 1].counterparty),
      cadence: window.cadence,
      currency: sorted[0].currency,
      amountMinor: latest,
      previousAmountMinor: baseline,
      priceChangeBps,
      occurrences: sorted.length,
      confidence,
      nextExpectedDate: addDays(sorted[sorted.length - 1].date, window.target),
      lastChargeDate: sorted[sorted.length - 1].date,
      category: sorted[sorted.length - 1].category,
      transactionIds: sorted.map((tx) => tx.id),
      evidenceNote: `${sorted.length} matching ${window.cadence} charges; median interval ${medianInterval} days, ${matching.length}/${intervals.length} intervals within tolerance.`,
    });
  }

  return patterns.sort((a, b) => b.occurrences - a.occurrences || a.merchant.localeCompare(b.merchant));
}

export function estimatedMonthlyMinor(pattern: DetectedPattern): number {
  switch (pattern.cadence) {
    case 'weekly':
      return Math.round((pattern.amountMinor * 52) / 12);
    case 'monthly':
      return pattern.amountMinor;
    case 'quarterly':
      return Math.round(pattern.amountMinor / 3);
    case 'annual':
      return Math.round(pattern.amountMinor / 12);
  }
}
