import { describe, expect, it } from 'vitest';
import {
  computeInvoiceTotals,
  formatMoney,
  formatQuantity,
  lineTotalMinor,
  parseMoneyToMinor,
  parseQuantityToMilli,
} from '../shared/money';

describe('line and invoice totals', () => {
  it('computes line totals from thousandth quantities', () => {
    expect(lineTotalMinor(1000, 12_500)).toBe(12_500);
    expect(lineTotalMinor(2500, 8_000)).toBe(20_000);
    // 0.333 x $9.99 = $3.32667, rounded to the nearest cent.
    expect(lineTotalMinor(333, 999)).toBe(333);
  });

  it('applies discount before tax and returns integer cents', () => {
    const totals = computeInvoiceTotals(
      [
        { quantityMilli: 1500, unitPriceMinor: 12_000 },
        { quantityMilli: 2000, unitPriceMinor: 5_000 },
      ],
      825,
      2_000,
    );
    expect(totals.subtotalMinor).toBe(28_000);
    expect(totals.taxMinor).toBe(2_145);
    expect(totals.totalMinor).toBe(28_145);
    expect(totals.dueMinor).toBe(28_145);
    expect(Number.isInteger(totals.taxMinor)).toBe(true);
  });

  it('rounds half-cent tax results away from zero once', () => {
    // $3.33 at 7.5% = $0.24975 -> $0.25.
    expect(computeInvoiceTotals([{ quantityMilli: 1000, unitPriceMinor: 333 }], 750).taxMinor).toBe(25);
    // 2497.5 minor units must round to 2498, not 2497.
    expect(computeInvoiceTotals([{ quantityMilli: 1000, unitPriceMinor: 33_300 }], 750).taxMinor).toBe(2_498);
  });

  it('never returns a negative total or due amount', () => {
    const totals = computeInvoiceTotals([{ quantityMilli: 1000, unitPriceMinor: 1_000 }], 0, 5_000, 5_000);
    expect(totals.subtotalMinor).toBe(1_000);
    expect(totals.totalMinor).toBe(0);
    expect(totals.dueMinor).toBe(0);
  });

  it('subtracts recorded payments from the balance due', () => {
    const totals = computeInvoiceTotals([{ quantityMilli: 1000, unitPriceMinor: 10_000 }], 0, 0, 4_000);
    expect(totals.totalMinor).toBe(10_000);
    expect(totals.dueMinor).toBe(6_000);
  });
});

describe('money parsing and formatting', () => {
  it('parses user input into integer minor units', () => {
    expect(parseMoneyToMinor('1,234.56')).toBe(123_456);
    expect(parseMoneyToMinor('$0.05')).toBe(5);
    expect(parseMoneyToMinor('12.345')).toBe(1_235);
    expect(parseMoneyToMinor('not a number')).toBe(0);
  });

  it('formats minor units without floating-point drift', () => {
    expect(formatMoney(1_842_050)).toBe('$18,420.50');
    expect(formatMoney(-123)).toBe('-$1.23');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('round-trips quantities through thousandths', () => {
    expect(parseQuantityToMilli('2.5')).toBe(2_500);
    expect(formatQuantity(2_500)).toBe('2.5');
    expect(formatQuantity(3_000)).toBe('3');
    expect(parseQuantityToMilli('-2')).toBe(0);
  });
});
