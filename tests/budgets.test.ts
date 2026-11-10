import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../server/db/connection';
import { createBudget, createExpense, listBudgets } from '../server/db/repo';
import { seedDatabase, WORKSPACE_ID } from '../server/db/seed';
import { isoToday, monthKey } from '../shared/dates';

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  seedDatabase(db);
});

describe('budget utilisation', () => {
  it('computes spent, remaining, and threshold states from recorded expenses', () => {
    const period = monthKey(isoToday());
    const budget = createBudget(WORKSPACE_ID, { category: 'QA & Tooling', period, limitMinor: 10_000 });
    expect(budget).toMatchObject({ spentMinor: 0, remainingMinor: 10_000, utilisationBps: 0, state: 'under' });

    createExpense(WORKSPACE_ID, {
      date: isoToday(),
      merchant: 'Test Vendor',
      category: 'QA & Tooling',
      amountMinor: 8_500,
      source: 'Corporate card',
      notes: 'test spend',
    });
    const near = listBudgets(WORKSPACE_ID, period).find((item) => item.category === 'QA & Tooling')!;
    expect(near).toMatchObject({ spentMinor: 8_500, remainingMinor: 1_500, utilisationBps: 8_500, state: 'near' });

    createExpense(WORKSPACE_ID, {
      date: isoToday(),
      merchant: 'Test Vendor',
      category: 'QA & Tooling',
      amountMinor: 1_500,
      source: 'Corporate card',
      notes: 'test spend',
    });
    const over = listBudgets(WORKSPACE_ID, period).find((item) => item.category === 'QA & Tooling')!;
    expect(over).toMatchObject({ spentMinor: 10_000, remainingMinor: 0, utilisationBps: 10_000, state: 'over' });
  });

  it('does not count spending outside the budget month', () => {
    const period = monthKey(isoToday());
    createBudget(WORKSPACE_ID, { category: 'QA & Tooling', period, limitMinor: 5_000 });
    createExpense(WORKSPACE_ID, {
      date: '2020-01-15',
      merchant: 'Old Vendor',
      category: 'QA & Tooling',
      amountMinor: 2_500,
      source: 'Corporate card',
      notes: 'previous year',
    });
    const budget = listBudgets(WORKSPACE_ID, period).find((item) => item.category === 'QA & Tooling')!;
    expect(budget.spentMinor).toBe(0);
    expect(budget.state).toBe('under');
  });
});
