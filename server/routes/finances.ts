import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../auth';
import {
  addAuditEvent,
  createBudget,
  createExpense,
  deleteBudget,
  deleteExpense,
  getTransaction,
  listBudgets,
  listExpenses,
  listNotifications,
  listTransactions,
  markAllNotificationsRead,
  markNotificationRead,
  updateBudget,
  updateExpense,
} from '../db/repo';
import { csvEscape, notFound, parseBody } from '../http';
import { buildDashboard } from '../services/dashboard';
import { buildCashFlow } from '../services/cashflow';
import { monthKey, isoToday } from '../../shared/dates';

export const financesRouter = Router();

financesRouter.get('/dashboard', (req, res) => {
  const user = currentUser(req);
  res.json({ summary: buildDashboard(user.workspaceId) });
});

financesRouter.get('/transactions/export.csv', (req, res) => {
  const user = currentUser(req);
  const transactions = listTransactions(user.workspaceId, {
    search: typeof req.query.search === 'string' ? req.query.search : '',
    direction: typeof req.query.direction === 'string' ? req.query.direction : 'all',
    status: typeof req.query.status === 'string' ? req.query.status : 'all',
  });
  const header = ['Date', 'Transaction ID', 'Counterparty', 'Description', 'Category', 'Invoice', 'Source', 'Direction', 'Status', 'Amount', 'Currency'];
  const rows = transactions.map((t) => [
    t.date,
    t.externalId,
    t.counterparty,
    t.description,
    t.category,
    t.invoiceNumber ?? '',
    t.source,
    t.direction,
    t.status,
    (t.amountMinor / 100).toFixed(2),
    t.currency,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mergin-transactions-${isoToday()}.csv"`);
  res.send(csv);
});

financesRouter.get('/transactions/:id', (req, res) => {
  const user = currentUser(req);
  const transaction = getTransaction(user.workspaceId, String(req.params.id));
  if (!transaction) return notFound(res, 'Transaction');
  res.json({ transaction });
});

financesRouter.get('/transactions', (req, res) => {
  const user = currentUser(req);
  res.json({
    transactions: listTransactions(user.workspaceId, {
      search: typeof req.query.search === 'string' ? req.query.search : '',
      direction: typeof req.query.direction === 'string' ? req.query.direction : 'all',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
    }),
  });
});

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  merchant: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80),
  amountMinor: z.number().int().positive(),
  source: z.string().trim().min(1).max(120),
  notes: z.string().max(2000).optional().default(''),
  receiptName: z.string().max(200).optional().nullable(),
});

financesRouter.get('/expenses', (req, res) => {
  const user = currentUser(req);
  res.json({ expenses: listExpenses(user.workspaceId) });
});

financesRouter.post('/expenses', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(expenseSchema, req, res);
  if (!input) return;
  const expense = createExpense(user.workspaceId, input);
  addAuditEvent(user.workspaceId, 'expense.created', user.name, `${expense.merchant} · ${expense.category}`);
  res.status(201).json({ expense });
});

financesRouter.put('/expenses/:id', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(expenseSchema, req, res);
  if (!input) return;
  const expense = updateExpense(user.workspaceId, String(req.params.id), input);
  if (!expense) return notFound(res, 'Expense');
  addAuditEvent(user.workspaceId, 'expense.updated', user.name, `${expense.merchant} · ${expense.category}`);
  res.json({ expense });
});

const confirmSchema = z.object({ confirm: z.literal(true) });

financesRouter.delete('/expenses/:id', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(confirmSchema, req, res);
  if (!input) return;
  if (!deleteExpense(user.workspaceId, String(req.params.id))) return notFound(res, 'Expense');
  addAuditEvent(user.workspaceId, 'expense.deleted', user.name, `Deleted expense ${String(req.params.id)}`);
  res.json({ ok: true });
});

const budgetSchema = z.object({
  category: z.string().trim().min(1).max(80),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  limitMinor: z.number().int().positive(),
});

financesRouter.get('/budgets', (req, res) => {
  const user = currentUser(req);
  const period = typeof req.query.period === 'string' ? req.query.period : monthKey(isoToday());
  res.json({ budgets: listBudgets(user.workspaceId, period), period });
});

financesRouter.post('/budgets', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(budgetSchema, req, res);
  if (!input) return;
  const budget = createBudget(user.workspaceId, input);
  addAuditEvent(user.workspaceId, 'budget.created', user.name, `${budget.category} · limit updated`);
  res.status(201).json({ budget });
});

financesRouter.put('/budgets/:id', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(budgetSchema, req, res);
  if (!input) return;
  const budget = updateBudget(user.workspaceId, String(req.params.id), input);
  if (!budget) return notFound(res, 'Budget');
  addAuditEvent(user.workspaceId, 'budget.updated', user.name, `${budget.category} · limit updated`);
  res.json({ budget });
});

financesRouter.delete('/budgets/:id', (req, res) => {
  const user = currentUser(req);
  const input = parseBody(confirmSchema, req, res);
  if (!input) return;
  if (!deleteBudget(user.workspaceId, String(req.params.id))) return notFound(res, 'Budget');
  addAuditEvent(user.workspaceId, 'budget.deleted', user.name, `Deleted budget ${String(req.params.id)}`);
  res.json({ ok: true });
});

financesRouter.get('/cash-flow', (req, res) => {
  const user = currentUser(req);
  const horizon = req.query.horizon === '7' ? 7 : 30;
  const scenario = req.query.scenario === 'conservative' ? 'conservative' : 'baseline';
  res.json({ cashFlow: buildCashFlow(user.workspaceId, horizon, scenario) });
});

financesRouter.get('/notifications', (req, res) => {
  const user = currentUser(req);
  res.json({ notifications: listNotifications(user.workspaceId) });
});

financesRouter.post('/notifications/read-all', (req, res) => {
  const user = currentUser(req);
  markAllNotificationsRead(user.workspaceId);
  res.json({ ok: true });
});

financesRouter.post('/notifications/:id/read', (req, res) => {
  const user = currentUser(req);
  if (!markNotificationRead(user.workspaceId, String(req.params.id))) return notFound(res, 'Notification');
  res.json({ ok: true });
});
