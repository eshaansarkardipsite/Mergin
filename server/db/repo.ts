import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './connection';
import { computeInvoiceTotals } from '../../shared/money';
import { isoToday, monthKey } from '../../shared/dates';
import { detectRecurringPatterns } from '../../shared/sentinel';
import type {
  AuditEvent,
  BudgetView,
  Customer,
  Expense,
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  Notification,
  RecurringPattern,
  SentinelReview,
  SentinelStatus,
  SessionUser,
  Transaction,
  WebhookEventRecord,
  Workspace,
} from '../../shared/types';

function db(): DatabaseSync {
  return getDb();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeInvoiceStatus(status: InvoiceStatus, dueDate: string): InvoiceStatus {
  if ((status === 'sent' || status === 'partial' || status === 'pending') && dueDate < isoToday()) {
    return status === 'partial' || status === 'pending' ? status : 'overdue';
  }
  return status;
}

// ---------- workspace & users ----------

export function getWorkspace(workspaceId: string): Workspace {
  const row = db().prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId) as any;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.created_at,
  };
}

export function findUserByEmail(email: string) {
  return db()
    .prepare('SELECT id, workspace_id, name, email, password_hash, demo FROM users WHERE lower(email) = lower(?)')
    .get(email) as any;
}

export function getUserById(userId: string) {
  return db().prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
}

export function getSessionUser(userId: string): SessionUser | null {
  const row = db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.workspace_id, u.demo, w.name AS workspace_name
       FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = ?`,
    )
    .get(userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    demo: Boolean(row.demo),
  };
}

export function updateProfile(userId: string, name: string): void {
  db().prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
}

// ---------- customers ----------

export function listCustomers(workspaceId: string): Customer[] {
  const rows = db().prepare('SELECT * FROM customers WHERE workspace_id = ? ORDER BY name').all(workspaceId) as any[];
  return rows.map((r) => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, email: r.email, company: r.company }));
}

export function upsertCustomer(workspaceId: string, name: string, email: string): Customer {
  const existing = db()
    .prepare('SELECT * FROM customers WHERE workspace_id = ? AND lower(email) = lower(?)')
    .get(workspaceId, email) as any;
  if (existing) {
    db().prepare('UPDATE customers SET name = ?, email = ? WHERE id = ?').run(name, email, existing.id);
    return { id: existing.id, workspaceId, name, email, company: existing.company };
  }
  const customerId = id('cus');
  db()
    .prepare('INSERT INTO customers (id, workspace_id, name, email, company) VALUES (?, ?, ?, ?, ?)')
    .run(customerId, workspaceId, name, email, name);
  return { id: customerId, workspaceId, name, email, company: name };
}

// ---------- invoices ----------

function mapItem(row: any): InvoiceLineItem {
  return {
    id: row.id,
    description: row.description,
    detail: row.detail,
    quantityMilli: row.quantity_milli,
    unitPriceMinor: row.unit_price_minor,
    totalMinor: row.total_minor,
  };
}

function loadInvoice(row: any): Invoice {
  const items = db()
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position')
    .all(row.id) as any[];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    number: row.number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: normalizeInvoiceStatus(row.status, row.due_date),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currency: row.currency,
    items: items.map(mapItem),
    subtotalMinor: row.subtotal_minor,
    taxRateBps: row.tax_rate_bps,
    taxMinor: row.tax_minor,
    discountMinor: row.discount_minor,
    totalMinor: row.total_minor,
    paidMinor: row.paid_minor,
    dueMinor: Math.max(0, row.total_minor - row.paid_minor),
    notes: row.notes,
    paymentTerms: row.payment_terms,
    publicToken: row.public_token,
    paypalInvoiceId: row.paypal_invoice_id,
    paypalStatus: row.paypal_status,
    paypalApprovalUrl: row.paypal_approval_url,
    paidAt: row.paid_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const INVOICE_SELECT = `SELECT i.*, c.name AS customer_name, c.email AS customer_email
  FROM invoices i JOIN customers c ON c.id = i.customer_id`;

export function listInvoices(
  workspaceId: string,
  filters: { status?: string; search?: string } = {},
): Invoice[] {
  const rows = db()
    .prepare(`${INVOICE_SELECT} WHERE i.workspace_id = ? ORDER BY i.issue_date DESC, i.number DESC`)
    .all(workspaceId) as any[];
  let invoices = rows.map(loadInvoice);
  if (filters.status && filters.status !== 'all') {
    invoices = invoices.filter((inv) => inv.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    invoices = invoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.customerEmail.toLowerCase().includes(q),
    );
  }
  return invoices;
}

export function getInvoice(workspaceId: string, invoiceId: string): Invoice | null {
  const row = db().prepare(`${INVOICE_SELECT} WHERE i.workspace_id = ? AND i.id = ?`).get(workspaceId, invoiceId) as any;
  return row ? loadInvoice(row) : null;
}

export function getInvoiceByToken(token: string): Invoice | null {
  const row = db().prepare(`${INVOICE_SELECT} WHERE i.public_token = ?`).get(token) as any;
  return row ? loadInvoice(row) : null;
}

export function getInvoiceByPaypalId(paypalInvoiceId: string): Invoice | null {
  const row = db().prepare(`${INVOICE_SELECT} WHERE i.paypal_invoice_id = ?`).get(paypalInvoiceId) as any;
  return row ? loadInvoice(row) : null;
}

export function nextInvoiceNumber(workspaceId: string): string {
  const rows = db()
    .prepare(`SELECT number FROM invoices WHERE workspace_id = ? AND number LIKE 'INV-%'`)
    .all(workspaceId) as any[];
  const max = rows.reduce((m, row) => {
    const value = Number(String(row.number).replace(/[^0-9]/g, ''));
    return Number.isFinite(value) ? Math.max(m, value) : m;
  }, 1058);
  return `INV-${max + 1}`;
}

export interface InvoiceInput {
  customerName: string;
  customerEmail: string;
  number?: string;
  issueDate: string;
  dueDate: string;
  taxRateBps: number;
  discountMinor: number;
  notes: string;
  paymentTerms: string;
  items: { description: string; detail?: string; quantityMilli: number; unitPriceMinor: number }[];
}

export function createInvoice(workspaceId: string, input: InvoiceInput): Invoice {
  const customer = upsertCustomer(workspaceId, input.customerName, input.customerEmail);
  const totals = computeInvoiceTotals(input.items, input.taxRateBps, input.discountMinor, 0);
  const invoiceId = id('inv');
  const number = input.number?.trim() || nextInvoiceNumber(workspaceId);
  const token = crypto.randomBytes(18).toString('base64url');
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO invoices (id, workspace_id, number, customer_id, status, issue_date, due_date, currency,
        subtotal_minor, tax_rate_bps, tax_minor, discount_minor, total_minor, paid_minor, notes, payment_terms,
        public_token, paypal_invoice_id, paypal_status, paypal_approval_url, paid_at, sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, 'USD', ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    )
    .run(
      invoiceId,
      workspaceId,
      number,
      customer.id,
      input.issueDate,
      input.dueDate,
      totals.subtotalMinor,
      input.taxRateBps,
      totals.taxMinor,
      input.discountMinor,
      totals.totalMinor,
      input.notes,
      input.paymentTerms,
      token,
      now,
      now,
    );
  const insertItem = db().prepare(
    `INSERT INTO invoice_items (id, invoice_id, description, detail, quantity_milli, unit_price_minor, total_minor, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  input.items.forEach((item, index) => {
    insertItem.run(
      id('itm'),
      invoiceId,
      item.description,
      item.detail ?? '',
      item.quantityMilli,
      item.unitPriceMinor,
      Math.round((item.quantityMilli * item.unitPriceMinor) / 1000),
      index,
    );
  });
  return getInvoice(workspaceId, invoiceId)!;
}

export function updateDraftInvoice(workspaceId: string, invoiceId: string, input: InvoiceInput): Invoice {
  const existing = getInvoice(workspaceId, invoiceId);
  if (!existing) throw new Error('Invoice not found');
  if (existing.status !== 'draft') throw new Error('Only draft invoices can be edited');
  const customer = upsertCustomer(workspaceId, input.customerName, input.customerEmail);
  const totals = computeInvoiceTotals(input.items, input.taxRateBps, input.discountMinor, 0);
  db()
    .prepare(
      `UPDATE invoices SET customer_id = ?, number = ?, issue_date = ?, due_date = ?, subtotal_minor = ?,
        tax_rate_bps = ?, tax_minor = ?, discount_minor = ?, total_minor = ?, notes = ?, payment_terms = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      customer.id,
      input.number?.trim() || existing.number,
      input.issueDate,
      input.dueDate,
      totals.subtotalMinor,
      input.taxRateBps,
      totals.taxMinor,
      input.discountMinor,
      totals.totalMinor,
      input.notes,
      input.paymentTerms,
      nowIso(),
      invoiceId,
      workspaceId,
    );
  db().prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(invoiceId);
  const insertItem = db().prepare(
    `INSERT INTO invoice_items (id, invoice_id, description, detail, quantity_milli, unit_price_minor, total_minor, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  input.items.forEach((item, index) => {
    insertItem.run(
      id('itm'),
      invoiceId,
      item.description,
      item.detail ?? '',
      item.quantityMilli,
      item.unitPriceMinor,
      Math.round((item.quantityMilli * item.unitPriceMinor) / 1000),
      index,
    );
  });
  return getInvoice(workspaceId, invoiceId)!;
}

export function deleteDraftInvoice(workspaceId: string, invoiceId: string): boolean {
  const existing = getInvoice(workspaceId, invoiceId);
  if (!existing || existing.status !== 'draft') return false;
  db().prepare('DELETE FROM invoices WHERE id = ? AND workspace_id = ?').run(invoiceId, workspaceId);
  return true;
}

export function setInvoicePaypal(
  invoiceId: string,
  patch: {
    paypalInvoiceId?: string | null;
    paypalStatus?: string | null;
    paypalApprovalUrl?: string | null;
    status?: InvoiceStatus;
    sentAt?: string | null;
  },
): void {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  if (patch.paypalInvoiceId !== undefined) {
    fields.push('paypal_invoice_id = ?');
    values.push(patch.paypalInvoiceId);
  }
  if (patch.paypalStatus !== undefined) {
    fields.push('paypal_status = ?');
    values.push(patch.paypalStatus);
  }
  if (patch.paypalApprovalUrl !== undefined) {
    fields.push('paypal_approval_url = ?');
    values.push(patch.paypalApprovalUrl);
  }
  if (patch.status !== undefined) {
    fields.push('status = ?');
    values.push(patch.status);
  }
  if (patch.sentAt !== undefined) {
    fields.push('sent_at = ?');
    values.push(patch.sentAt);
  }
  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(invoiceId);
  db().prepare(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function reconcileInvoice(
  invoiceId: string,
  state: {
    paypalStatus: string | null;
    paidMinor: number;
    dueMinor: number;
    totalMinor: number;
    paidAt: string | null;
    approvalUrl?: string | null;
  },
): InvoiceStatus {
  const pp = state.paypalStatus ?? '';
  let status: InvoiceStatus;
  if (['CANCELLED', 'AUTO_CANCELLED'].includes(pp)) status = 'cancelled';
  else if (['REFUNDED', 'MARKED_AS_REFUNDED', 'REFUNDED_EXTERNAL', 'PARTIALLY_REFUNDED'].includes(pp)) status = 'refunded';
  else if (state.paidMinor >= state.totalMinor && state.totalMinor > 0) status = 'paid';
  else if (['PAYMENT_PENDING'].includes(pp)) status = 'pending';
  else if (state.paidMinor > 0 && state.dueMinor > 0) status = 'partial';
  else if (['SENT', 'UNPAID', 'SHARED', 'SCHEDULED', 'PARTIALLY_PAID'].includes(pp)) status = 'sent';
  else if (pp === 'DRAFT') status = 'draft';
  else status = 'sent';

  db()
    .prepare(
      `UPDATE invoices SET status = ?, paypal_status = ?, paid_minor = ?, paid_at = ?, paypal_approval_url = COALESCE(?, paypal_approval_url), updated_at = ? WHERE id = ?`,
    )
    .run(status, state.paypalStatus, state.paidMinor, state.paidAt, state.approvalUrl ?? null, nowIso(), invoiceId);
  return status;
}

export function recordDemoPayment(
  invoiceId: string,
  amountMinor: number,
  method: 'demo' | 'paypal' = 'demo',
): void {
  const invoice = db().prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!invoice) throw new Error('Invoice not found');
  const paymentId = id('pay');
  const receivedAt = nowIso();
  db()
    .prepare(
      `INSERT INTO payments (id, workspace_id, invoice_id, paypal_payment_id, amount_minor, currency, status, method, received_at)
       VALUES (?, ?, ?, NULL, ?, ?, 'completed', ?, ?)`,
    )
    .run(paymentId, invoice.workspace_id, invoiceId, amountMinor, invoice.currency, method, receivedAt);
  const paid = (db().prepare(`SELECT COALESCE(SUM(amount_minor),0) AS total FROM payments WHERE invoice_id = ? AND status = 'completed'`).get(invoiceId) as any).total;
  const status: InvoiceStatus = paid >= invoice.total_minor ? 'paid' : paid > 0 ? 'partial' : invoice.status;
  db()
    .prepare('UPDATE invoices SET paid_minor = ?, status = ?, paid_at = ?, updated_at = ? WHERE id = ?')
    .run(paid, status, status === 'paid' ? receivedAt : null, receivedAt, invoiceId);
}

export function listPayments(invoiceId: string) {
  return db().prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY received_at').all(invoiceId) as any[];
}

// ---------- transactions ----------

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    date: row.date,
    externalId: row.external_id,
    counterparty: row.counterparty,
    description: row.description,
    category: row.category,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number ?? null,
    source: row.source,
    direction: row.direction,
    status: row.status,
    amountMinor: row.amount_minor,
    currency: row.currency,
    createdAt: row.created_at,
  };
}

export function listTransactions(
  workspaceId: string,
  filters: { search?: string; direction?: string; status?: string } = {},
): Transaction[] {
  const rows = db()
    .prepare(
      `SELECT t.*, i.number AS invoice_number FROM transactions t
       LEFT JOIN invoices i ON i.id = t.invoice_id
       WHERE t.workspace_id = ? ORDER BY t.date DESC, t.created_at DESC`,
    )
    .all(workspaceId) as any[];
  let mapped = rows.map(mapTransaction);
  if (filters.direction && filters.direction !== 'all') {
    mapped = mapped.filter((t) => t.direction === filters.direction);
  }
  if (filters.status && filters.status !== 'all') {
    mapped = mapped.filter((t) => t.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    mapped = mapped.filter(
      (t) =>
        t.counterparty.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.externalId.toLowerCase().includes(q) ||
        (t.invoiceNumber ?? '').toLowerCase().includes(q),
    );
  }
  return mapped;
}

export function getTransaction(workspaceId: string, transactionId: string): Transaction | null {
  const row = db()
    .prepare(
      `SELECT t.*, i.number AS invoice_number FROM transactions t
       LEFT JOIN invoices i ON i.id = t.invoice_id WHERE t.workspace_id = ? AND t.id = ?`,
    )
    .get(workspaceId, transactionId) as any;
  return row ? mapTransaction(row) : null;
}

export function transactionExists(workspaceId: string, externalId: string): boolean {
  return Boolean(
    db().prepare('SELECT id FROM transactions WHERE workspace_id = ? AND external_id = ?').get(workspaceId, externalId),
  );
}

export function getTransactionByExternalId(workspaceId: string, externalId: string): Transaction | null {
  const row = db()
    .prepare(
      `SELECT t.*, i.number AS invoice_number FROM transactions t
       LEFT JOIN invoices i ON i.id = t.invoice_id WHERE t.workspace_id = ? AND t.external_id = ?`,
    )
    .get(workspaceId, externalId) as any;
  return row ? mapTransaction(row) : null;
}

export function createTransaction(
  workspaceId: string,
  input: {
    date: string;
    externalId: string;
    counterparty: string;
    description: string;
    category: string;
    invoiceId: string | null;
    source: string;
    direction: 'incoming' | 'outgoing';
    status: 'settled' | 'pending' | 'refunded' | 'failed';
    amountMinor: number;
  },
): Transaction {
  const existing = getTransactionByExternalId(workspaceId, input.externalId);
  if (existing) return existing;
  const txId = id('txn');
  db()
    .prepare(
      `INSERT INTO transactions (id, workspace_id, date, external_id, counterparty, description, category, invoice_id,
        source, direction, status, amount_minor, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)`,
    )
    .run(
      txId,
      workspaceId,
      input.date,
      input.externalId,
      input.counterparty,
      input.description,
      input.category,
      input.invoiceId,
      input.source,
      input.direction,
      input.status,
      input.amountMinor,
      nowIso(),
    );
  return getTransaction(workspaceId, txId)!;
}

// ---------- expenses ----------

function mapExpense(row: any): Expense {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    date: row.date,
    merchant: row.merchant,
    category: row.category,
    amountMinor: row.amount_minor,
    currency: row.currency,
    source: row.source,
    notes: row.notes,
    receiptName: row.receipt_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listExpenses(workspaceId: string): Expense[] {
  return (db().prepare('SELECT * FROM expenses WHERE workspace_id = ? ORDER BY date DESC').all(workspaceId) as any[]).map(mapExpense);
}

export function createExpense(
  workspaceId: string,
  input: { date: string; merchant: string; category: string; amountMinor: number; source: string; notes: string; receiptName?: string | null },
): Expense {
  const expenseId = id('exp');
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO expenses (id, workspace_id, date, merchant, category, amount_minor, currency, source, notes, receipt_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?)`,
    )
    .run(expenseId, workspaceId, input.date, input.merchant, input.category, input.amountMinor, input.source, input.notes, input.receiptName ?? null, now, now);
  return mapExpense(db().prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId));
}

export function updateExpense(
  workspaceId: string,
  expenseId: string,
  input: { date: string; merchant: string; category: string; amountMinor: number; source: string; notes: string; receiptName?: string | null },
): Expense | null {
  const existing = db().prepare('SELECT id FROM expenses WHERE id = ? AND workspace_id = ?').get(expenseId, workspaceId);
  if (!existing) return null;
  db()
    .prepare(
      `UPDATE expenses SET date = ?, merchant = ?, category = ?, amount_minor = ?, source = ?, notes = ?, receipt_name = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(input.date, input.merchant, input.category, input.amountMinor, input.source, input.notes, input.receiptName ?? null, nowIso(), expenseId, workspaceId);
  return mapExpense(db().prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId));
}

export function deleteExpense(workspaceId: string, expenseId: string): boolean {
  const result = db().prepare('DELETE FROM expenses WHERE id = ? AND workspace_id = ?').run(expenseId, workspaceId);
  return result.changes > 0;
}

// ---------- budgets ----------

export function listBudgets(workspaceId: string, period = monthKey(isoToday())): BudgetView[] {
  const rows = db()
    .prepare('SELECT * FROM budgets WHERE workspace_id = ? AND period = ? ORDER BY limit_minor DESC')
    .all(workspaceId, period) as any[];
  const spendRows = db()
    .prepare(`SELECT category, SUM(amount_minor) AS spent FROM expenses WHERE workspace_id = ? AND date LIKE ? GROUP BY category`)
    .all(workspaceId, `${period}%`) as any[];
  const spendByCategory = new Map(spendRows.map((r) => [r.category, r.spent as number]));
  return rows.map((row) => {
    const spentMinor = spendByCategory.get(row.category) ?? 0;
    const utilisationBps = row.limit_minor > 0 ? Math.round((spentMinor / row.limit_minor) * 10_000) : 0;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      category: row.category,
      period: row.period,
      limitMinor: row.limit_minor,
      currency: row.currency,
      createdAt: row.created_at,
      spentMinor,
      remainingMinor: row.limit_minor - spentMinor,
      utilisationBps,
      state: utilisationBps >= 10_000 ? 'over' : utilisationBps >= 8_000 ? 'near' : 'under',
    };
  });
}

export function createBudget(workspaceId: string, input: { category: string; period: string; limitMinor: number }): BudgetView {
  const budgetId = id('bud');
  db()
    .prepare(
      `INSERT INTO budgets (id, workspace_id, category, period, limit_minor, currency, created_at)
       VALUES (?, ?, ?, ?, ?, 'USD', ?)
       ON CONFLICT(workspace_id, category, period) DO UPDATE SET limit_minor = excluded.limit_minor`,
    )
    .run(budgetId, workspaceId, input.category, input.period, input.limitMinor, nowIso());
  return listBudgets(workspaceId, input.period).find((b) => b.category === input.category)!;
}

export function updateBudget(workspaceId: string, budgetId: string, input: { category: string; period: string; limitMinor: number }): BudgetView | null {
  const result = db()
    .prepare('UPDATE budgets SET category = ?, period = ?, limit_minor = ? WHERE id = ? AND workspace_id = ?')
    .run(input.category, input.period, input.limitMinor, budgetId, workspaceId);
  if (!result.changes) return null;
  return listBudgets(workspaceId, input.period).find((b) => b.category === input.category) ?? null;
}

export function deleteBudget(workspaceId: string, budgetId: string): boolean {
  return db().prepare('DELETE FROM budgets WHERE id = ? AND workspace_id = ?').run(budgetId, workspaceId).changes > 0;
}

// ---------- sentinel ----------

function mapPattern(row: any): RecurringPattern {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    merchant: row.merchant,
    normalizedMerchant: row.normalized_merchant,
    cadence: row.cadence,
    currency: row.currency,
    amountMinor: row.amount_minor,
    previousAmountMinor: row.previous_amount_minor,
    priceChangeBps: row.price_change_bps,
    occurrences: row.occurrences,
    confidence: row.confidence,
    nextExpectedDate: row.next_expected_date,
    lastChargeDate: row.last_charge_date,
    category: row.category,
    transactionIds: JSON.parse(row.transaction_ids_json),
    evidenceNote: row.evidence_note,
  };
}

export function listPatterns(workspaceId: string): RecurringPattern[] {
  return (db().prepare('SELECT * FROM recurring_patterns WHERE workspace_id = ? ORDER BY amount_minor DESC').all(workspaceId) as any[]).map(mapPattern);
}

export function getPattern(workspaceId: string, patternId: string): RecurringPattern | null {
  const row = db().prepare('SELECT * FROM recurring_patterns WHERE workspace_id = ? AND id = ?').get(workspaceId, patternId) as any;
  return row ? mapPattern(row) : null;
}

export function listSentinelReviews(workspaceId: string, status?: string): SentinelReview[] {
  const rows = db().prepare('SELECT * FROM sentinel_reviews WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
  return rows
    .map(mapReview)
    .filter((review) => !status || status === 'all' || review.status === status);
}

function mapReview(row: any): SentinelReview {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    patternId: row.pattern_id,
    merchant: row.merchant,
    title: row.title,
    summary: row.summary,
    reason: row.reason,
    status: row.status,
    severity: row.severity,
    amountMinor: row.amount_minor,
    previousAmountMinor: row.previous_amount_minor,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    usageDataConnected: Boolean(row.usage_data_connected),
  };
}

export function getSentinelReview(workspaceId: string, reviewId: string): SentinelReview | null {
  const row = db().prepare('SELECT * FROM sentinel_reviews WHERE workspace_id = ? AND id = ?').get(workspaceId, reviewId) as any;
  return row ? mapReview(row) : null;
}

export function decideSentinelReview(
  workspaceId: string,
  reviewId: string,
  status: SentinelStatus,
  note: string,
  actor: string,
): SentinelReview | null {
  const existing = getSentinelReview(workspaceId, reviewId);
  if (!existing) return null;
  db()
    .prepare('UPDATE sentinel_reviews SET status = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?')
    .run(status, note, nowIso(), nowIso(), reviewId, workspaceId);
  addAuditEvent(workspaceId, `sentinel.${status}`, actor, `${existing.merchant} · ${existing.title}`);
  return getSentinelReview(workspaceId, reviewId);
}

export function refreshSentinelPatterns(workspaceId: string): number {
  const transactions = listTransactions(workspaceId);
  const detected = detectRecurringPatterns(transactions, 3);
  const existing = listPatterns(workspaceId);
  const byMerchant = new Map(existing.map((p) => [p.normalizedMerchant, p]));
  let added = 0;
  for (const pattern of detected) {
    const current = byMerchant.get(pattern.normalizedMerchant);
    if (current) {
      db()
        .prepare(
          `UPDATE recurring_patterns SET amount_minor = ?, previous_amount_minor = ?, price_change_bps = ?, occurrences = ?,
            confidence = ?, next_expected_date = ?, last_charge_date = ?, category = ?, transaction_ids_json = ?, evidence_note = ?
           WHERE id = ?`,
        )
        .run(
          pattern.amountMinor,
          pattern.previousAmountMinor,
          pattern.priceChangeBps,
          pattern.occurrences,
          pattern.confidence,
          pattern.nextExpectedDate,
          pattern.lastChargeDate,
          pattern.category,
          JSON.stringify(pattern.transactionIds),
          pattern.evidenceNote,
          current.id,
        );
      if (pattern.priceChangeBps >= 500) {
        const existingReview = db()
          .prepare(`SELECT id FROM sentinel_reviews WHERE pattern_id = ? AND reason = 'price-change'`)
          .get(current.id);
        if (!existingReview) {
          insertReview({
            workspaceId,
            patternId: current.id,
            merchant: pattern.merchant,
            title: `Price increased ${(pattern.priceChangeBps / 100).toFixed(1)}% at renewal`,
            summary: `${pattern.occurrences} matching ${pattern.cadence} charges detected. Latest charge is ${pattern.amountMinor} minor units versus a ${pattern.previousAmountMinor} baseline. Usage data is not connected.`,
            reason: 'price-change',
            severity: 'attention',
            amountMinor: pattern.amountMinor,
            previousAmountMinor: pattern.previousAmountMinor,
          });
          added += 1;
        }
      }
      continue;
    }
    const patternId = id('pat');
    db()
      .prepare(
        `INSERT INTO recurring_patterns (id, workspace_id, merchant, normalized_merchant, cadence, currency, amount_minor,
          previous_amount_minor, price_change_bps, occurrences, confidence, next_expected_date, last_charge_date, category,
          transaction_ids_json, evidence_note)
         VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        patternId,
        workspaceId,
        pattern.merchant,
        pattern.normalizedMerchant,
        pattern.cadence,
        pattern.amountMinor,
        pattern.previousAmountMinor,
        pattern.priceChangeBps,
        pattern.occurrences,
        pattern.confidence,
        pattern.nextExpectedDate,
        pattern.lastChargeDate,
        pattern.category,
        JSON.stringify(pattern.transactionIds),
        pattern.evidenceNote,
      );
    insertReview({
      workspaceId,
      patternId,
      merchant: pattern.merchant,
      title: 'New recurring charge pattern found',
      summary: `${pattern.occurrences} matching ${pattern.cadence} charges detected with ${pattern.confidence} confidence. ${pattern.evidenceNote}`,
      reason: 'new-pattern',
      severity: 'info',
      amountMinor: pattern.amountMinor,
      previousAmountMinor: pattern.previousAmountMinor,
    });
    added += 1;
  }
  return added;
}

function insertReview(input: {
  workspaceId: string;
  patternId: string;
  merchant: string;
  title: string;
  summary: string;
  reason: string;
  severity: string;
  amountMinor: number;
  previousAmountMinor: number;
}): void {
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO sentinel_reviews (id, workspace_id, pattern_id, merchant, title, summary, reason, status, severity,
        amount_minor, previous_amount_minor, currency, created_at, updated_at, decided_at, decision_note, usage_data_connected)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 'USD', ?, ?, NULL, NULL, 0)`,
    )
    .run(
      id('rev'),
      input.workspaceId,
      input.patternId,
      input.merchant,
      input.title,
      input.summary,
      input.reason,
      input.severity,
      input.amountMinor,
      input.previousAmountMinor,
      now,
      now,
    );
}

// ---------- notifications & audit ----------

export function listNotifications(workspaceId: string): Notification[] {
  const rows = db().prepare('SELECT * FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as any[];
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    href: r.href,
    read: Boolean(r.read),
    createdAt: r.created_at,
  }));
}

export function markNotificationRead(workspaceId: string, notificationId: string): boolean {
  return db().prepare('UPDATE notifications SET read = 1 WHERE id = ? AND workspace_id = ?').run(notificationId, workspaceId).changes > 0;
}

export function markAllNotificationsRead(workspaceId: string): void {
  db().prepare('UPDATE notifications SET read = 1 WHERE workspace_id = ?').run(workspaceId);
}

export function addAuditEvent(workspaceId: string, action: string, actor: string, detail: string): void {
  db()
    .prepare('INSERT INTO audit_events (id, workspace_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id('aud'), workspaceId, action, actor, detail, nowIso());
}

export function listAuditEvents(workspaceId: string, limit = 30): AuditEvent[] {
  const rows = db()
    .prepare('SELECT * FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(workspaceId, limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    action: r.action,
    actor: r.actor,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

// ---------- webhooks ----------

export function getWebhookEvent(providerEventId: string): WebhookEventRecord | null {
  const row = db().prepare('SELECT * FROM webhook_events WHERE provider_event_id = ?').get(providerEventId) as any;
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    providerEventId: row.provider_event_id,
    eventType: row.event_type,
    paypalInvoiceId: row.paypal_invoice_id,
    processingState: row.processing_state,
    note: row.note,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
  };
}

export function recordWebhookEvent(input: {
  workspaceId: string | null;
  providerEventId: string;
  eventType: string;
  paypalInvoiceId: string | null;
  processingState: 'processed' | 'ignored' | 'failed';
  note: string;
}): void {
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO webhook_events (id, workspace_id, provider_event_id, event_type, paypal_invoice_id, processing_state, note, received_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider_event_id) DO NOTHING`,
    )
    .run(id('wh'), input.workspaceId, input.providerEventId, input.eventType, input.paypalInvoiceId, input.processingState, input.note, now, now);
}

export function listWebhookEvents(workspaceId: string, limit = 10): WebhookEventRecord[] {
  const rows = db()
    .prepare('SELECT * FROM webhook_events WHERE workspace_id = ? ORDER BY received_at DESC LIMIT ?')
    .all(workspaceId, limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    providerEventId: r.provider_event_id,
    eventType: r.event_type,
    paypalInvoiceId: r.paypal_invoice_id,
    processingState: r.processing_state,
    note: r.note,
    receivedAt: r.received_at,
    processedAt: r.processed_at,
  }));
}

// ---------- settings ----------

export function getWorkspaceSettings(workspaceId: string) {
  const row = db().prepare('SELECT * FROM workspace_settings WHERE workspace_id = ?').get(workspaceId) as any;
  return {
    sentinelMinObservations: row?.sentinel_min_observations ?? 3,
    priceChangeThresholdBps: row?.price_change_threshold_bps ?? 500,
    renewalLeadDays: row?.renewal_lead_days ?? 7,
    openingBalanceMinor: row?.opening_balance_minor ?? 0,
  };
}

export function updateWorkspaceSettings(
  workspaceId: string,
  input: { sentinelMinObservations: number; priceChangeThresholdBps: number; renewalLeadDays: number },
): void {
  db()
    .prepare(
      `UPDATE workspace_settings SET sentinel_min_observations = ?, price_change_threshold_bps = ?, renewal_lead_days = ? WHERE workspace_id = ?`,
    )
    .run(input.sentinelMinObservations, input.priceChangeThresholdBps, input.renewalLeadDays, workspaceId);
}

export function renameWorkspace(workspaceId: string, name: string): void {
  db().prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, workspaceId);
}

export function getOpeningBalance(workspaceId: string): number {
  return getWorkspaceSettings(workspaceId).openingBalanceMinor;
}
