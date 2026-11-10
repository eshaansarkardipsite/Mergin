import { GoogleGenAI } from '@google/genai';
import { config, geminiConfigured } from '../config';
import {
  getOpeningBalance,
  listBudgets,
  listExpenses,
  listInvoices,
  listPatterns,
  listSentinelReviews,
  listTransactions,
} from '../db/repo';
import { addDays, formatDate, isoToday, monthKey } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import { estimatedMonthlyMinor } from '../../shared/sentinel';
import type { CopilotAnswer, CopilotEvidence } from '../../shared/types';

const SYSTEM_INSTRUCTION = `You are MERGIN Copilot, a finance explanation assistant for a small creative studio.
You receive calculated facts produced by deterministic TypeScript code. Explain only those facts.
Rules:
- Never invent invoices, transactions, balances, budgets, subscriptions, usage data, or dates.
- Never perform or recompute monetary arithmetic. Use the formatted amounts exactly as provided.
- If the facts are insufficient, say so plainly.
- Unpaid invoices are receivables, never guaranteed income.
- Never claim a subscription is used or unused; usage data is not connected.
- Mention assumptions and missing data briefly.
- Return JSON only: {"directAnswer": string, "explanation": string, "nextStep": string}.
- Be concise, calm, and specific. No markdown tables.`;

interface Facts {
  [key: string]: unknown;
}

export interface CopilotFacts {
  intent: string;
  period: string;
  amountMinor: number | null;
  directAnswer: string;
  explanation: string;
  evidence: CopilotEvidence[];
  assumptions: string[];
  nextStep: string;
  facts: Facts;
}

function previousMonth(month: string): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function quarterPeriod(today: string): { label: string; start: string } {
  const [year, month] = today.split('-').map(Number);
  const q = Math.floor((month - 1) / 3) + 1;
  const startMonth = (q - 1) * 3 + 1;
  return {
    label: `Q${q} ${year}`,
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
  };
}

function money(minor: number): string {
  return formatMoney(minor, 'USD');
}

const BASE_ASSUMPTIONS = [
  'Figures cover only the Northstar Creative demo workspace.',
  'Unpaid invoices are receivables, not guaranteed income.',
  'Usage data for recurring services is not connected.',
];

export function buildCopilotFacts(workspaceId: string, rawQuestion: string): CopilotFacts {
  const question = rawQuestion.toLowerCase();
  const today = isoToday();
  const month = monthKey(today);
  const opening = getOpeningBalance(workspaceId);
  const transactions = listTransactions(workspaceId);
  const invoices = listInvoices(workspaceId);
  const expenses = listExpenses(workspaceId);
  const budgets = listBudgets(workspaceId, month);
  const patterns = listPatterns(workspaceId);
  const reviews = listSentinelReviews(workspaceId, 'open');

  const settled = transactions.filter((t) => t.status === 'settled');
  const balance =
    opening + settled.reduce((sum, t) => sum + (t.direction === 'incoming' ? t.amountMinor : -t.amountMinor), 0);
  const currentExpenses = expenses.filter((e) => e.date.startsWith(month));
  const previousExpenses = expenses.filter((e) => e.date.startsWith(previousMonth(month)));
  const currentExpenseTotal = currentExpenses.reduce((sum, e) => sum + e.amountMinor, 0);
  const previousExpenseTotal = previousExpenses.reduce((sum, e) => sum + e.amountMinor, 0);
  const overdue = invoices.filter((inv) => inv.status === 'overdue');
  const outstanding = invoices.filter((inv) => ['sent', 'overdue', 'partial', 'pending'].includes(inv.status));
  const outstandingTotal = outstanding.reduce((sum, inv) => sum + inv.dueMinor, 0);
  const monthlyRecurring = patterns.reduce((sum, p) => sum + estimatedMonthlyMinor(p), 0);
  const quarter = quarterPeriod(today);

  const asksAffordability = /afford|can we (?:spend|pay)|additional .*expense/.test(question);
  if (asksAffordability) {
    const dollarMatch = question.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);
    const plainMatch = question.match(/additional\s+\$?([\d,]+(?:\.\d{1,2})?)/);
    const requested = Math.round(Number((dollarMatch?.[1] ?? plainMatch?.[1] ?? '800').replace(/,/g, '')) * 100);
    const headroom = balance - requested;
    const evidence: CopilotEvidence[] = [
      {
        label: 'Recorded balance',
        detail: 'Demo ledger, all settled transactions',
        href: '/app/transactions',
        amountMinor: balance,
      },
      {
        label: 'Outstanding invoices',
        detail: `${outstanding.length} invoices, excluded from cash`,
        href: '/app/invoices',
        amountMinor: outstandingTotal,
      },
      {
        label: 'Detected monthly recurring spend',
        detail: `${patterns.length} patterns from transaction evidence`,
        href: '/app/sentinel',
        amountMinor: monthlyRecurring,
      },
    ];
    return {
      intent: 'affordability',
      period: `As of ${formatDate(today)}`,
      amountMinor: requested,
      directAnswer:
        headroom >= 0
          ? `On recorded cash alone, ${money(requested)} fits with ${money(headroom)} left before outstanding invoices and recurring charges.`
          : `Recorded cash is ${money(Math.abs(headroom))} short of ${money(requested)}.`,
      explanation: `The recorded balance is ${money(balance)}. This check does not count ${money(outstandingTotal)} of outstanding invoices as income. Detected recurring charges total about ${money(monthlyRecurring)} per month. One-off payroll, tax, and future spending outside detected patterns are not modelled.`,
      evidence,
      assumptions: [...BASE_ASSUMPTIONS, 'Affordability is a cash-coverage check, not financial advice.'],
      nextStep: 'Review Cash Flow for the 30-day view before committing the spend.',
      facts: {
        requestedExpense: money(requested),
        recordedBalance: money(balance),
        headroomAfterExpense: money(headroom),
        outstandingInvoices: money(outstandingTotal),
        recurringMonthlyEstimate: money(monthlyRecurring),
        outstandingInvoiceCount: outstanding.length,
      },
    };
  }

  if (/revenue|income|earned/.test(question) && !/expense/.test(question)) {
    const quarterTransactions = settled.filter(
      (t) => t.direction === 'incoming' && t.date >= quarter.start && t.date <= today,
    );
    const revenue = quarterTransactions.reduce((sum, t) => sum + t.amountMinor, 0);
    const byMonth = new Map<string, number>();
    for (const tx of quarterTransactions) {
      const key = tx.date.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amountMinor);
    }
    const evidence = [...byMonth.entries()].map(([key, value]) => ({
      label: `${formatDate(`${key}-01`, { month: 'long' })} receipts`,
      detail: 'Settled incoming transactions',
      href: '/app/transactions',
      amountMinor: value,
    }));
    return {
      intent: 'revenue-quarter',
      period: quarter.label,
      amountMinor: revenue,
      directAnswer: `Settled revenue for ${quarter.label} is ${money(revenue)}.`,
      explanation: `This counts only settled incoming ledger transactions between ${formatDate(quarter.start)} and ${formatDate(today)}. Outstanding invoice balances of ${money(outstandingTotal)} are not included.`,
      evidence,
      assumptions: BASE_ASSUMPTIONS,
      nextStep: 'Open Transactions to inspect each settled receipt.',
      facts: {
        quarter: quarter.label,
        settledRevenue: money(revenue),
        outstandingExcluded: money(outstandingTotal),
        monthlyBreakdown: evidence.map((e) => ({ month: e.label, amount: money(e.amountMinor ?? 0) })),
      },
    };
  }

  if (/overdue|late|past due/.test(question)) {
    const total = overdue.reduce((sum, inv) => sum + inv.dueMinor, 0);
    const evidence = overdue.slice(0, 4).map((inv) => ({
      label: `${inv.number} · ${inv.customerName}`,
      detail: `Due ${formatDate(inv.dueDate)}`,
      href: `/app/invoices/${inv.id}`,
      amountMinor: inv.dueMinor,
    }));
    return {
      intent: 'overdue-invoices',
      period: `As of ${formatDate(today)}`,
      amountMinor: total,
      directAnswer:
        overdue.length === 0
          ? 'No invoices are overdue right now.'
          : `${overdue.length} invoice${overdue.length === 1 ? ' is' : 's are'} overdue, totalling ${money(total)}.`,
      explanation: `Overdue means the due date has passed and the invoice is not fully paid. ${overdue.length === 0 ? 'Nothing requires collection follow-up.' : 'These balances are outstanding, not guaranteed income.'}`,
      evidence,
      assumptions: BASE_ASSUMPTIONS,
      nextStep: overdue.length ? 'Open the oldest invoice and send a reminder.' : 'No collection action needed.',
      facts: {
        overdueCount: overdue.length,
        overdueTotal: money(total),
        invoices: overdue.map((inv) => ({ number: inv.number, customer: inv.customerName, due: formatDate(inv.dueDate), amount: money(inv.dueMinor) })),
      },
    };
  }

  if (/recurring|subscription|sentinel|review/.test(question)) {
    const evidence = reviews.slice(0, 4).map((review) => ({
      label: review.title,
      detail: `${review.merchant} · ${review.reason.replace('-', ' ')}`,
      href: `/app/sentinel/${review.id}`,
      amountMinor: review.amountMinor,
    }));
    return {
      intent: 'recurring-review',
      period: `As of ${formatDate(today)}`,
      amountMinor: monthlyRecurring,
      directAnswer: `${patterns.length} recurring patterns are detected. Estimated monthly recurring spend is ${money(monthlyRecurring)}.`,
      explanation: `Patterns require at least three matching charges with a consistent interval. ${reviews.length} review${reviews.length === 1 ? ' is' : 's are'} open. Usage data is not connected, so MERGIN cannot say whether a service is used.`,
      evidence,
      assumptions: [...BASE_ASSUMPTIONS, 'Renewal dates are estimates derived from detected intervals.'],
      nextStep: 'Open Sentinel to review the evidence and record a decision.',
      facts: {
        detectedPatterns: patterns.length,
        estimatedMonthly: money(monthlyRecurring),
        openReviews: reviews.length,
        patterns: patterns.map((p) => ({ merchant: p.merchant, cadence: p.cadence, amount: money(p.amountMinor), confidence: p.confidence })),
        usageDataConnected: false,
      },
    };
  }

  if (/next week|expected.*payment|payment.*expected|cash.*next/.test(question)) {
    const weekEnd = addDays(today, 7);
    const upNext = patterns
      .filter((p) => p.nextExpectedDate >= today && p.nextExpectedDate <= weekEnd)
      .map((p) => ({
        label: `${p.merchant} renewal`,
        detail: `Estimated ${formatDate(p.nextExpectedDate)} · ${p.cadence}`,
        href: '/app/sentinel',
        amountMinor: p.amountMinor,
      }));
    const confirmed = settled.filter((t) => t.date > today && t.date <= weekEnd);
    return {
      intent: 'next-week',
      period: `${formatDate(today)} – ${formatDate(weekEnd)}`,
      amountMinor: confirmed.reduce((sum, t) => sum + t.amountMinor, 0),
      directAnswer: `No guaranteed customer receipts are scheduled for the next 7 days. ${outstanding.length} invoices totalling ${money(outstandingTotal)} remain outstanding.`,
      explanation: `The ledger contains no future-dated confirmed receipts. MERGIN does not count unpaid invoices as expected cash. ${upNext.length} recurring charge${upNext.length === 1 ? ' is' : 's are'} estimated in this window.`,
      evidence: [
        ...upNext,
        ...outstanding.slice(0, 3).map((inv) => ({
          label: `${inv.number} · ${inv.customerName}`,
          detail: `Outstanding · due ${formatDate(inv.dueDate)}`,
          href: `/app/invoices/${inv.id}`,
          amountMinor: inv.dueMinor,
        })),
      ],
      assumptions: [...BASE_ASSUMPTIONS, 'Only confirmed ledger entries count as scheduled inflows.'],
      nextStep: 'Review the overdue and due-soon invoices, then check Cash Flow assumptions.',
      facts: {
        confirmedReceiptsNext7Days: money(confirmed.reduce((sum, t) => sum + t.amountMinor, 0)),
        outstandingTotal: money(outstandingTotal),
        recurringChargesNext7Days: upNext.length,
      },
    };
  }

  if (/budget|limit|overspend/.test(question)) {
    const risky = budgets.filter((b) => b.state !== 'under');
    const overage = risky.reduce((sum, b) => sum + Math.max(0, b.spentMinor - b.limitMinor), 0);
    const evidence = budgets.map((b) => ({
      label: `${b.category} budget`,
      detail: `${money(b.spentMinor)} of ${money(b.limitMinor)} · ${(b.utilisationBps / 100).toFixed(0)}%`,
      href: '/app/budgets',
      amountMinor: b.limitMinor - b.spentMinor,
    }));
    return {
      intent: 'budgets',
      period: formatDate(`${month}-01`, { month: 'long', year: 'numeric' }),
      amountMinor: overage > 0 ? overage : null,
      directAnswer:
        risky.length === 0
          ? 'All budgets are below the 80% warning threshold.'
          : `${risky.map((b) => b.category).join(', ')} ${risky.length === 1 ? 'is' : 'are'} at or near the monthly limit.`,
      explanation: `Budget spend is derived from the same expense records used across MERGIN. ${risky.length ? risky.map((b) => `${b.category} is at ${(b.utilisationBps / 100).toFixed(0)}%`).join('; ') + '.' : 'No category has crossed 80% utilisation.'}`,
      evidence,
      assumptions: [...BASE_ASSUMPTIONS, 'Budget utilisation includes expenses dated in the current calendar month.'],
      nextStep: 'Open Budgets to adjust a limit or review the underlying expenses.',
      facts: {
        month: formatDate(`${month}-01`, { month: 'long', year: 'numeric' }),
        atRiskBudgets: risky.map((b) => ({ category: b.category, utilisation: `${(b.utilisationBps / 100).toFixed(0)}%`, spent: money(b.spentMinor), limit: money(b.limitMinor) })),
      },
    };
  }

  if (/expense|spend|cost|increase/.test(question)) {
    const delta = currentExpenseTotal - previousExpenseTotal;
    const byCategory = new Map<string, number>();
    for (const expense of currentExpenses) {
      byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amountMinor);
    }
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const evidence = top.map(([category, amount]) => ({
      label: `${category} spend`,
      detail: 'Current month expenses',
      href: '/app/expenses',
      amountMinor: amount,
    }));
    return {
      intent: 'expenses',
      period: `${formatDate(`${previousMonth(month)}-01`, { month: 'long' })} vs ${formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}`,
      amountMinor: delta,
      directAnswer:
        delta === 0
          ? `Expenses are flat month over month at ${money(currentExpenseTotal)}.`
          : `Expenses ${delta > 0 ? 'increased' : 'decreased'} by ${money(Math.abs(delta))} versus last month.`,
      explanation: `Current month expenses total ${money(currentExpenseTotal)}; last month totalled ${money(previousExpenseTotal)}. ${top.length ? `Largest category: ${top[0][0]} at ${money(top[0][1])}.` : 'No expenses have been recorded this month.'}`,
      evidence,
      assumptions: [...BASE_ASSUMPTIONS, 'Expenses are grouped by the category entered on each record.'],
      nextStep: 'Open Expenses to inspect or edit the underlying records.',
      facts: {
        currentMonthTotal: money(currentExpenseTotal),
        previousMonthTotal: money(previousExpenseTotal),
        change: money(delta),
        topCategories: top.map(([category, amount]) => ({ category, amount: money(amount) })),
      },
    };
  }

  const evidence: CopilotEvidence[] = [
    { label: 'Recorded balance', detail: 'Demo ledger', href: '/app/transactions', amountMinor: balance },
    { label: 'Outstanding invoices', detail: `${outstanding.length} open`, href: '/app/invoices', amountMinor: outstandingTotal },
    { label: 'Expenses this month', detail: `${currentExpenses.length} records`, href: '/app/expenses', amountMinor: currentExpenseTotal },
  ];
  return {
    intent: 'overview',
    period: `As of ${formatDate(today)}`,
    amountMinor: balance,
    directAnswer: `Recorded balance is ${money(balance)}. ${outstanding.length} invoices totalling ${money(outstandingTotal)} are outstanding.`,
    explanation: `This month has ${money(currentExpenseTotal)} of expenses against ${money(previousExpenseTotal)} last month. Detected recurring spend is about ${money(monthlyRecurring)} per month. Ask about overdue invoices, budgets, revenue, or recurring charges for a focused answer.`,
    evidence,
    assumptions: BASE_ASSUMPTIONS,
    nextStep: 'Ask a specific question, or open Cash Flow for the forward view.',
    facts: {
      recordedBalance: money(balance),
      outstandingInvoices: money(outstandingTotal),
      openInvoiceCount: outstanding.length,
      expensesThisMonth: money(currentExpenseTotal),
      expensesPreviousMonth: money(previousExpenseTotal),
      detectedMonthlyRecurring: money(monthlyRecurring),
      currency: 'USD',
      totalLedgerRecords: transactions.length,
    },
  };
}

function deterministicAnswer(facts: CopilotFacts, note?: string): CopilotAnswer {
  return {
    directAnswer: facts.directAnswer,
    explanation: facts.explanation,
    evidence: facts.evidence,
    assumptions: note ? [...facts.assumptions, note] : facts.assumptions,
    nextStep: facts.nextStep,
    amountMinor: facts.amountMinor,
    currency: 'USD',
    period: facts.period,
    source: 'deterministic',
    model: null,
  };
}

interface ModelExplanation {
  directAnswer?: string;
  explanation?: string;
  nextStep?: string;
}

export async function askCopilot(workspaceId: string, workspaceName: string, question: string): Promise<CopilotAnswer> {
  const facts = buildCopilotFacts(workspaceId, question);
  if (!geminiConfigured()) return deterministicAnswer(facts);

  const modelId = config.gemini.model || 'gemini-2.5-flash';
  try {
    const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    const prompt = `Workspace: ${workspaceName}
Question: ${question}
Calculated facts (money values are already formatted; do not recompute):
${JSON.stringify(facts.facts, null, 2)}

Explain these facts. Return JSON with directAnswer, explanation, nextStep.`;
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: {
          type: 'object',
          properties: {
            directAnswer: { type: 'string' },
            explanation: { type: 'string' },
            nextStep: { type: 'string' },
          },
          required: ['directAnswer', 'explanation', 'nextStep'],
        },
        temperature: 0.2,
        maxOutputTokens: 700,
      },
    });
    const text = response.text?.trim();
    if (!text) return deterministicAnswer(facts, 'The configured model returned no text; deterministic explanation shown.');
    const parsed = JSON.parse(text) as ModelExplanation;
    if (!parsed.directAnswer || !parsed.explanation) {
      return deterministicAnswer(facts, 'The model response was incomplete; deterministic explanation shown.');
    }
    return {
      directAnswer: parsed.directAnswer,
      explanation: parsed.explanation,
      evidence: facts.evidence,
      assumptions: facts.assumptions,
      nextStep: parsed.nextStep || facts.nextStep,
      amountMinor: facts.amountMinor,
      currency: 'USD',
      period: facts.period,
      source: 'gemini',
      model: modelId,
    };
  } catch {
    return deterministicAnswer(facts, 'The live model was unavailable; this answer uses deterministic calculations only.');
  }
}
