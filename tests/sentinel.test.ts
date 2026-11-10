import { describe, expect, it } from 'vitest';
import { detectRecurringPatterns, estimatedMonthlyMinor, normalizeMerchant } from '../shared/sentinel';
import type { Transaction } from '../shared/types';

function charge(id: string, date: string, amountMinor: number, counterparty = 'CloudDesk Pro'): Transaction {
  return {
    id,
    workspaceId: 'ws_test',
    date,
    externalId: `EXT-${id}`,
    counterparty,
    description: 'Workspace subscription',
    category: 'Software',
    invoiceId: null,
    invoiceNumber: null,
    source: 'Corporate card',
    direction: 'outgoing',
    status: 'settled',
    amountMinor,
    currency: 'USD',
    createdAt: `${date}T12:00:00.000Z`,
  };
}

describe('recurring pattern detection', () => {
  it('requires at least three observations', () => {
    const two = [charge('t1', '2026-06-01', 4_900), charge('t2', '2026-07-01', 4_900)];
    expect(detectRecurringPatterns(two)).toEqual([]);

    const three = [...two, charge('t3', '2026-07-31', 4_900)];
    const patterns = detectRecurringPatterns(three);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].cadence).toBe('monthly');
    expect(patterns[0].occurrences).toBe(3);
  });

  it('detects a price increase against the previous median charge', () => {
    const patterns = detectRecurringPatterns([
      charge('t1', '2026-06-01', 4_500),
      charge('t2', '2026-07-01', 4_500),
      charge('t3', '2026-07-31', 4_900),
    ]);
    expect(patterns[0].previousAmountMinor).toBe(4_500);
    expect(patterns[0].amountMinor).toBe(4_900);
    expect(patterns[0].priceChangeBps).toBe(889);
    expect(patterns[0].nextExpectedDate).toBe('2026-08-30');
  });

  it('ignores irregular intervals and non-outgoing records', () => {
    const irregular = [
      charge('t1', '2026-01-01', 1_000),
      charge('t2', '2026-02-10', 1_000),
      charge('t3', '2026-03-22', 1_000),
    ];
    expect(detectRecurringPatterns(irregular)).toEqual([]);

    const incoming = [
      { ...charge('t1', '2026-06-01', 1_000), direction: 'incoming' as const },
      { ...charge('t2', '2026-07-01', 1_000), direction: 'incoming' as const },
      { ...charge('t3', '2026-07-31', 1_000), direction: 'incoming' as const },
    ];
    expect(detectRecurringPatterns(incoming)).toEqual([]);

    const pending = [
      charge('t1', '2026-06-01', 1_000),
      charge('t2', '2026-07-01', 1_000),
      { ...charge('t3', '2026-07-31', 1_000), status: 'pending' as const },
    ];
    expect(detectRecurringPatterns(pending)).toEqual([]);
  });

  it('groups merchants through normalized names', () => {
    expect(normalizeMerchant('CloudDesk Pro, Inc.')).toBe('clouddesk');
    expect(normalizeMerchant('ACME SUBSCRIPTION PLAN')).toBe('acme');
  });

  it('converts detected cadences to monthly estimates', () => {
    const base = detectRecurringPatterns([
      charge('t1', '2026-06-01', 4_900),
      charge('t2', '2026-07-01', 4_900),
      charge('t3', '2026-07-31', 4_900),
    ])[0];
    expect(estimatedMonthlyMinor(base)).toBe(4_900);
    expect(estimatedMonthlyMinor({ ...base, cadence: 'annual', amountMinor: 120_000 })).toBe(10_000);
    expect(estimatedMonthlyMinor({ ...base, cadence: 'quarterly', amountMinor: 3_000 })).toBe(1_000);
    expect(estimatedMonthlyMinor({ ...base, cadence: 'weekly', amountMinor: 1_000 })).toBe(4_333);
  });
});
