import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { addDays, isoToday, monthKey } from '../../shared/dates';
import { computeInvoiceTotals } from '../../shared/money';
import { detectRecurringPatterns } from '../../shared/sentinel';
import type { Transaction } from '../../shared/types';

export const DEMO_EMAIL = 'demo@mergin.example';
export const DEMO_PASSWORD = 'mergin-demo';
export const WORKSPACE_ID = 'ws_northstar';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function publicToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

interface SeedInvoice {
  id: string;
  number: string;
  customerId: string;
  status: 'draft' | 'sent' | 'paid';
  issueOffset: number;
  dueOffset: number;
  paidOffset?: number;
  paypalStatus?: string;
  items: { description: string; detail: string; qty: number; unit: number }[];
  notes: string;
}

export function seedDatabase(db: DatabaseSync): void {
  const existing = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(WORKSPACE_ID);
  if (existing) return;

  const now = new Date().toISOString();
  const today = isoToday();
  const ago = (days: number) => addDays(today, -days);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO workspaces (id, name, slug, currency, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(WORKSPACE_ID, 'Northstar Creative', 'northstar-creative', 'USD', 'America/New_York', now);

    db.prepare(
      `INSERT INTO users (id, workspace_id, name, email, password_hash, demo) VALUES (?, ?, ?, ?, ?, 1)`,
    ).run('usr_demo', WORKSPACE_ID, 'Maya Chen', DEMO_EMAIL, hashPassword(DEMO_PASSWORD));

    db.prepare(
      `INSERT INTO workspace_settings (workspace_id, sentinel_min_observations, price_change_threshold_bps, renewal_lead_days, opening_balance_minor)
       VALUES (?, 3, 500, 7, 1521550)`,
    ).run(WORKSPACE_ID);

    const customers = [
      ['cus_acme', 'Acme Studios', 'billing@acme.example', 'Acme Studios'],
      ['cus_cedar', 'Cedar & Co.', 'accounts@cedar.example', 'Cedar & Co.'],
      ['cus_baseline', 'Baseline Health', 'finance@baseline.example', 'Baseline Health'],
      ['cus_forma', 'Forma Labs', 'billing@forma.example', 'Forma Labs'],
      ['cus_helio', 'Helio Ventures', 'ap@helio.example', 'Helio Ventures'],
      ['cus_wren', 'Wren & Field', 'ops@wrenfield.example', 'Wren & Field'],
    ] as const;
    const insertCustomer = db.prepare(
      `INSERT INTO customers (id, workspace_id, name, email, company) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const c of customers) insertCustomer.run(c[0], WORKSPACE_ID, c[1], c[2], c[3]);

    const invoices: SeedInvoice[] = [
      {
        id: 'inv_1048',
        number: 'INV-1048',
        customerId: 'cus_acme',
        status: 'sent',
        issueOffset: 40,
        dueOffset: -10,
        paypalStatus: 'SENT',
        items: [
          { description: 'Q4 Brand Campaign', detail: 'Art direction and campaign system', qty: 1, unit: 180000 },
          { description: 'Motion Assets', detail: 'Six social cutdowns', qty: 1, unit: 60000 },
        ],
        notes: 'Campaign files delivered October 1. Net 30 terms.',
      },
      {
        id: 'inv_1051',
        number: 'INV-1051',
        customerId: 'cus_cedar',
        status: 'sent',
        issueOffset: 14,
        dueOffset: 16,
        paypalStatus: 'SENT',
        items: [{ description: 'Retainer — November', detail: 'Monthly design partnership', qty: 1, unit: 185000 }],
        notes: 'Monthly retainer, payable within 30 days.',
      },
      {
        id: 'inv_1055',
        number: 'INV-1055',
        customerId: 'cus_baseline',
        status: 'sent',
        issueOffset: 6,
        dueOffset: 24,
        paypalStatus: 'SENT',
        items: [{ description: 'Product Design Sprint', detail: 'Five-day research and prototype sprint', qty: 1, unit: 124000 }],
        notes: 'Sprint delivered. Payment due on receipt window above.',
      },
      {
        id: 'inv_1054',
        number: 'INV-1054',
        customerId: 'cus_forma',
        status: 'paid',
        issueOffset: 35,
        dueOffset: -5,
        paidOffset: 3,
        paypalStatus: 'PAID',
        items: [
          { description: 'Design System Document', detail: 'Component usage and accessibility rules', qty: 1, unit: 120000 },
          { description: 'Component Library Build', detail: 'Production React primitives', qty: 1, unit: 200000 },
        ],
        notes: 'Paid in full. Thank you.',
      },
      {
        id: 'inv_1050',
        number: 'INV-1050',
        customerId: 'cus_helio',
        status: 'paid',
        issueOffset: 36,
        dueOffset: -6,
        paidOffset: 6,
        paypalStatus: 'PAID',
        items: [{ description: 'Investor Deck & Narrative', detail: 'Series A story and data design', qty: 1, unit: 280000 }],
        notes: 'Paid in full.',
      },
      {
        id: 'inv_1052',
        number: 'INV-1052',
        customerId: 'cus_wren',
        status: 'paid',
        issueOffset: 45,
        dueOffset: -15,
        paidOffset: 8,
        paypalStatus: 'PAID',
        items: [{ description: 'Packaging Refresh', detail: 'Structural and surface exploration', qty: 1, unit: 125000 }],
        notes: 'Paid in full.',
      },
      {
        id: 'inv_1056',
        number: 'INV-1056',
        customerId: 'cus_wren',
        status: 'draft',
        issueOffset: 0,
        dueOffset: 30,
        items: [{ description: 'Landing Page Audit', detail: 'Conversion and accessibility review', qty: 1, unit: 105000 }],
        notes: 'Draft — scope confirm with client before sending.',
      },
      {
        id: 'inv_1058',
        number: 'INV-1058',
        customerId: 'cus_forma',
        status: 'draft',
        issueOffset: 0,
        dueOffset: 30,
        items: [
          { description: 'Brand Identity System', detail: 'Vector assets, tokens, typography rules', qty: 1, unit: 350000 },
          { description: 'Guidelines Document', detail: 'Usage guidance and launch checklist', qty: 1, unit: 100000 },
        ],
        notes: 'Draft — holds the unused capacity for December.',
      },
    ];

    const insertInvoice = db.prepare(
      `INSERT INTO invoices (id, workspace_id, number, customer_id, status, issue_date, due_date, currency,
        subtotal_minor, tax_rate_bps, tax_minor, discount_minor, total_minor, paid_minor, notes, payment_terms,
        public_token, paypal_invoice_id, paypal_status, paypal_approval_url, paid_at, sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO invoice_items (id, invoice_id, description, detail, quantity_milli, unit_price_minor, total_minor, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPayment = db.prepare(
      `INSERT INTO payments (id, workspace_id, invoice_id, paypal_payment_id, amount_minor, currency, status, method, received_at)
       VALUES (?, ?, ?, NULL, ?, 'USD', 'completed', 'demo', ?)`,
    );

    for (const inv of invoices) {
      const totals = computeInvoiceTotals(
        inv.items.map((item) => ({ quantityMilli: item.qty * 1000, unitPriceMinor: item.unit })),
        0,
        0,
        0,
      );
      const paid = inv.status === 'paid' ? totals.totalMinor : 0;
      const issueDate = ago(inv.issueOffset);
      const dueDate = addDays(today, inv.dueOffset);
      const paidAt = inv.paidOffset != null ? `${ago(inv.paidOffset)}T15:20:00.000Z` : null;
      insertInvoice.run(
        inv.id,
        WORKSPACE_ID,
        inv.number,
        inv.customerId,
        inv.status,
        issueDate,
        dueDate,
        totals.subtotalMinor,
        totals.totalMinor,
        paid,
        inv.notes,
        'Net 30 · PayPal invoice',
        publicToken(),
        inv.paypalStatus ?? null,
        paidAt,
        inv.status === 'draft' ? null : `${issueDate}T14:00:00.000Z`,
        `${issueDate}T14:00:00.000Z`,
        now,
      );
      inv.items.forEach((item, index) => {
        insertItem.run(
          `${inv.id}_item_${index + 1}`,
          inv.id,
          item.description,
          item.detail,
          item.qty * 1000,
          item.unit,
          item.qty * item.unit,
          index,
        );
      });
      if (inv.status === 'paid' && paidAt) {
        insertPayment.run(`pay_${inv.id}`, WORKSPACE_ID, inv.id, paid, paidAt);
      }
    }

    const insertTransaction = db.prepare(
      `INSERT INTO transactions (id, workspace_id, date, external_id, counterparty, description, category, invoice_id,
        source, direction, status, amount_minor, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)`,
    );
    const tx = (
      id: string,
      date: string,
      counterparty: string,
      description: string,
      category: string,
      invoiceId: string | null,
      direction: 'incoming' | 'outgoing',
      amountMinor: number,
    ) => {
      insertTransaction.run(
        id,
        WORKSPACE_ID,
        date,
        `DEMO-${id.toUpperCase()}`,
        counterparty,
        description,
        category,
        invoiceId,
        'Demo ledger',
        direction,
        'settled',
        amountMinor,
        `${date}T12:00:00.000Z`,
      );
    };

    tx('txn_1001', ago(3), 'Forma Labs', 'Payment received · INV-1054', 'Client payments', 'inv_1054', 'incoming', 320000);
    tx('txn_1002', ago(6), 'Helio Ventures', 'Payment received · INV-1050', 'Client payments', 'inv_1050', 'incoming', 280000);
    tx('txn_1003', ago(8), 'Wren & Field', 'Payment received · INV-1052', 'Client payments', 'inv_1052', 'incoming', 125000);
    tx('txn_1004', ago(18), 'Pixel & Co.', 'Brand consult · one-off', 'Client payments', null, 'incoming', 90000);

    tx('txn_2001', ago(7), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4900);
    tx('txn_2002', ago(37), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4900);
    tx('txn_2003', ago(67), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4500);
    tx('txn_2004', ago(97), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4500);
    tx('txn_2005', ago(127), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4500);

    tx('txn_2101', ago(9), 'Amazon Web Services', 'Cloud hosting · monthly', 'Software', null, 'outgoing', 34000);
    tx('txn_2102', ago(39), 'Amazon Web Services', 'Cloud hosting · monthly', 'Software', null, 'outgoing', 34000);
    tx('txn_2103', ago(69), 'Amazon Web Services', 'Cloud hosting · monthly', 'Software', null, 'outgoing', 34000);

    tx('txn_2201', ago(12), 'Figma', 'Team license · monthly', 'Software', null, 'outgoing', 7500);
    tx('txn_2202', ago(42), 'Figma', 'Team license · monthly', 'Software', null, 'outgoing', 7500);
    tx('txn_2203', ago(72), 'Figma', 'Team license · monthly', 'Software', null, 'outgoing', 7500);

    tx('txn_2301', ago(15), 'Global Metrics Hub', 'Analytics monitoring · monthly', 'Software', null, 'outgoing', 13900);
    tx('txn_2302', ago(45), 'Global Metrics Hub', 'Analytics monitoring · monthly', 'Software', null, 'outgoing', 13900);
    tx('txn_2303', ago(75), 'Global Metrics Hub', 'Analytics monitoring · monthly', 'Software', null, 'outgoing', 13900);

    tx('txn_2401', ago(11), 'WeWork', 'Studio membership · monthly', 'Rent & facilities', null, 'outgoing', 120000);
    tx('txn_2402', ago(25), 'Jules Ortega', 'Contractor payout · October', 'Contractors', null, 'outgoing', 185000);

    const expenseRows: [string, number, string, string, number, string][] = [
      ['Amazon Web Services', 8, 'Software', 'Cloud hosting · monthly', 34000, 'Corporate card •• 8921'],
      ['Webflow', 7, 'Software', 'Site hosting and CMS', 32000, 'Corporate card •• 8921'],
      ['Adobe Creative Cloud', 6, 'Software', 'Creative suite seats', 11920, 'Corporate card •• 8921'],
      ['CloudDesk Pro', 5, 'Software', 'Workspace subscription', 4900, 'Corporate card •• 8921'],
      ['Global Metrics Hub', 4, 'Software', 'Analytics monitoring', 13900, 'Corporate card •• 8921'],
      ['Figma', 3, 'Software', 'Team license', 7500, 'Corporate card •• 8921'],
      ['Agency tooling bundle', 2, 'Software', 'Misc. seats and add-ons', 17600, 'Corporate card •• 8921'],
      ['Meta Ads', 6, 'Marketing', 'Paid social · October flight', 79200, 'Corporate card •• 4410'],
      ['Jules Ortega', 2, 'Contractors', 'Design contractor · October', 185000, 'Bank transfer'],
      ['SFO client visit', 8, 'Travel & Ops', 'Flights and ground transport', 52000, 'Corporate card •• 4410'],
    ];
    const insertExpense = db.prepare(
      `INSERT INTO expenses (id, workspace_id, date, merchant, category, amount_minor, currency, source, notes, receipt_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, NULL, ?, ?)`,
    );
    expenseRows.forEach(([merchant, offset, category, notes, amount, source], index) => {
      insertExpense.run(`exp_${index + 101}`, WORKSPACE_ID, ago(offset), merchant, category, amount, source, notes, now, now);
    });

    const period = monthKey(today);
    const budgets: [string, number][] = [
      ['Software', 260000],
      ['Contractors', 250000],
      ['Marketing', 80000],
      ['Travel & Ops', 60000],
    ];
    const insertBudget = db.prepare(
      `INSERT INTO budgets (id, workspace_id, category, period, limit_minor, currency, created_at) VALUES (?, ?, ?, ?, ?, 'USD', ?)`,
    );
    budgets.forEach(([category, limit], index) => {
      insertBudget.run(`bud_${index + 1}`, WORKSPACE_ID, category, period, limit, now);
    });

    const txRows = db
      .prepare(`SELECT * FROM transactions WHERE workspace_id = ? AND direction = 'outgoing'`)
      .all(WORKSPACE_ID) as unknown as Transaction[];
    const mapped: Transaction[] = txRows.map((row: any) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      date: row.date,
      externalId: row.external_id,
      counterparty: row.counterparty,
      description: row.description,
      category: row.category,
      invoiceId: row.invoice_id,
      invoiceNumber: null,
      source: row.source,
      direction: row.direction,
      status: row.status,
      amountMinor: row.amount_minor,
      currency: row.currency,
      createdAt: row.created_at,
    }));
    const patterns = detectRecurringPatterns(mapped, 3);
    const insertPattern = db.prepare(
      `INSERT INTO recurring_patterns (id, workspace_id, merchant, normalized_merchant, cadence, currency, amount_minor,
        previous_amount_minor, price_change_bps, occurrences, confidence, next_expected_date, last_charge_date, category,
        transaction_ids_json, evidence_note)
       VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertReview = db.prepare(
      `INSERT INTO sentinel_reviews (id, workspace_id, pattern_id, merchant, title, summary, reason, status, severity,
        amount_minor, previous_amount_minor, currency, created_at, updated_at, decided_at, decision_note, usage_data_connected)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 'USD', ?, ?, NULL, NULL, 0)`,
    );

    const patternIds = new Map<string, string>();
    patterns.forEach((pattern, index) => {
      const id = `pat_${index + 1}`;
      patternIds.set(pattern.normalizedMerchant, id);
      insertPattern.run(
        id,
        WORKSPACE_ID,
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
    });

    const cloudDesk = patterns.find((p) => p.normalizedMerchant.includes('clouddesk'));
    const globalMetrics = patterns.find((p) => p.normalizedMerchant.includes('global metrics'));
    const aws = patterns.find((p) => p.normalizedMerchant.includes('amazon web'));
    const figma = patterns.find((p) => p.normalizedMerchant.includes('figma'));

    if (cloudDesk) {
      insertReview.run(
        'rev_2001',
        WORKSPACE_ID,
        patternIds.get(cloudDesk.normalizedMerchant)!,
        cloudDesk.merchant,
        'Price increased 8.9% at renewal',
        `Five monthly charges detected. The latest two charges were $49.00, up from a $45.00 baseline. No usage data is connected, so value cannot be verified.`,
        'price-change',
        'attention',
        cloudDesk.amountMinor,
        cloudDesk.previousAmountMinor,
        ago(6),
        ago(6),
      );
    }
    if (globalMetrics) {
      insertReview.run(
        'rev_2002',
        WORKSPACE_ID,
        patternIds.get(globalMetrics.normalizedMerchant)!,
        globalMetrics.merchant,
        'Possible overlapping monitoring spend',
        `Two monthly monitoring vendors are detected: Global Metrics Hub ($139.00) and Amazon Web Services ($340.00). Usage data is not connected, so redundancy is a hypothesis, not a finding.`,
        'possible-duplicate',
        'attention',
        globalMetrics.amountMinor,
        globalMetrics.previousAmountMinor,
        ago(5),
        ago(5),
      );
    }
    if (aws) {
      insertReview.run(
        'rev_2003',
        WORKSPACE_ID,
        patternIds.get(aws.normalizedMerchant)!,
        aws.merchant,
        'Renewal expected within 30 days',
        `Three matching monthly charges of $340.00. Next charge estimated for ${aws.nextExpectedDate} from the detected 30-day interval.`,
        'renewal-soon',
        'info',
        aws.amountMinor,
        aws.previousAmountMinor,
        ago(4),
        ago(4),
      );
    }
    if (figma) {
      insertReview.run(
        'rev_2004',
        WORKSPACE_ID,
        patternIds.get(figma.normalizedMerchant)!,
        figma.merchant,
        'New recurring charge pattern found',
        `Three matching monthly charges of $75.00 detected. Confidence is medium because only three observations are available. Usage data is not connected.`,
        'new-pattern',
        'info',
        figma.amountMinor,
        figma.previousAmountMinor,
        ago(3),
        ago(3),
      );
    }

    const insertNotification = db.prepare(
      `INSERT INTO notifications (id, workspace_id, kind, title, body, href, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertNotification.run(
      'ntf_1',
      WORKSPACE_ID,
      'invoice',
      'Invoice INV-1048 is overdue',
      'Acme Studios · $2,400.00 was due 10 days ago.',
      '/app/invoices/inv_1048',
      0,
      `${ago(1)}T09:12:00.000Z`,
    );
    insertNotification.run(
      'ntf_2',
      WORKSPACE_ID,
      'sentinel',
      'CloudDesk Pro price increased',
      'Latest charges are $49.00, up from $45.00. Review the evidence.',
      '/app/sentinel/rev_2001',
      0,
      `${ago(2)}T08:30:00.000Z`,
    );
    insertNotification.run(
      'ntf_3',
      WORKSPACE_ID,
      'budget',
      'Marketing budget at 99%',
      '$792.00 of the $800.00 monthly cap is used.',
      '/app/budgets',
      0,
      `${ago(2)}T07:45:00.000Z`,
    );
    insertNotification.run(
      'ntf_4',
      WORKSPACE_ID,
      'system',
      'PayPal Sandbox is not connected',
      'Invoices stay in demo mode until server-side credentials are configured.',
      '/app/settings',
      1,
      `${ago(3)}T16:05:00.000Z`,
    );

    const insertAudit = db.prepare(
      `INSERT INTO audit_events (id, workspace_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertAudit.run('aud_1', WORKSPACE_ID, 'invoice.draft_created', 'Maya Chen', 'Created draft INV-1058 · $4,500.00', `${ago(1)}T11:20:00.000Z`);
    insertAudit.run('aud_2', WORKSPACE_ID, 'invoice.sent', 'Maya Chen', 'Sent INV-1055 to Baseline Health · demo mode', `${ago(6)}T10:02:00.000Z`);
    insertAudit.run('aud_3', WORKSPACE_ID, 'sentinel.pattern_detected', 'Mergin Sentinel', 'Detected CloudDesk Pro monthly pattern across 5 charges', `${ago(6)}T08:00:00.000Z`);
    insertAudit.run('aud_4', WORKSPACE_ID, 'payment.recorded', 'Demo ledger', 'Recorded $3,200.00 payment for INV-1054', `${ago(3)}T15:20:00.000Z`);
    insertAudit.run('aud_5', WORKSPACE_ID, 'settings.reviewed', 'Maya Chen', 'Confirmed Sentinel minimum observations at 3', `${ago(4)}T09:40:00.000Z`);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** Seeds a newly created identity workspace (PayPal, Google, email/password SSO) with demo data
 * so the user sees a balance and transaction history on first login. */
export function seedIdentityWorkspace(
  db: DatabaseSync,
  workspaceId: string,
  _userId: string,
  _userName: string,
): void {
  const now = new Date().toISOString();
  const today = isoToday();
  const ago = (days: number) => addDays(today, -days);

  const customers = [
    ['cus_acme', 'Acme Studios', 'billing@acme.example', 'Acme Studios'],
    ['cus_cedar', 'Cedar & Co.', 'accounts@cedar.example', 'Cedar & Co.'],
    ['cus_helio', 'Helio Ventures', 'finance@helio.example', 'Helio Ventures'],
    ['cus_forma', 'Forma Labs', 'billing@forma.example', 'Forma Labs'],
  ];
  const insertCustomer = db.prepare(
    `INSERT INTO customers (id, workspace_id, name, email, company) VALUES (?, ?, ?, ?, ?)`,
  );
  for (const c of customers) insertCustomer.run(c[0], workspaceId, c[1], c[2], c[3]);

  const invoices: Array<{
    id: string;
    number: string;
    customerId: string;
    status: 'sent' | 'paid' | 'overdue' | 'draft';
    issueOffset: number;
    dueOffset: number;
    paidOffset?: number;
    notes?: string;
    items: { description: string; detail: string; qty: number; unit: number }[];
  }> = [
    {
      id: 'inv_id_1',
      number: 'INV-2001',
      customerId: 'cus_acme',
      status: 'paid',
      issueOffset: 40,
      dueOffset: -10,
      paidOffset: 3,
      items: [{ description: 'Q4 Brand Campaign', detail: 'Art direction and campaign system', qty: 1, unit: 240000 }],
    },
    {
      id: 'inv_id_2',
      number: 'INV-2002',
      customerId: 'cus_cedar',
      status: 'paid',
      issueOffset: 30,
      dueOffset: 0,
      paidOffset: 5,
      items: [{ description: 'Monthly retainer — November', detail: 'Ongoing design partnership', qty: 1, unit: 185000 }],
    },
    {
      id: 'inv_id_3',
      number: 'INV-2003',
      customerId: 'cus_helio',
      status: 'overdue',
      issueOffset: 50,
      dueOffset: -15,
      items: [{ description: 'Investor Deck & Narrative', detail: 'Series A story and data design', qty: 1, unit: 280000 }],
    },
    {
      id: 'inv_id_4',
      number: 'INV-2004',
      customerId: 'cus_forma',
      status: 'sent',
      issueOffset: 10,
      dueOffset: 20,
      items: [{ description: 'Product Design Sprint', detail: 'Five-day research and prototype sprint', qty: 1, unit: 124000 }],
    },
    {
      id: 'inv_id_5',
      number: 'INV-2005',
      customerId: 'cus_acme',
      status: 'draft',
      issueOffset: 0,
      dueOffset: 30,
      items: [{ description: 'Landing Page Audit', detail: 'Conversion and accessibility review', qty: 1, unit: 105000 }],
    },
  ];

  const insertInvoice = db.prepare(
    `INSERT INTO invoices (id, workspace_id, number, customer_id, status, issue_date, due_date, currency,
      subtotal_minor, tax_rate_bps, tax_minor, discount_minor, total_minor, paid_minor, notes, payment_terms,
      public_token, paypal_invoice_id, paypal_status, paypal_approval_url, paid_at, sent_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, 0, 0, 0, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
  );
  const insertItem = db.prepare(
    `INSERT INTO invoice_items (id, invoice_id, description, detail, quantity_milli, unit_price_minor, total_minor, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPayment = db.prepare(
    `INSERT INTO payments (id, workspace_id, invoice_id, paypal_payment_id, amount_minor, currency, status, method, received_at)
     VALUES (?, ?, ?, NULL, ?, 'USD', 'completed', 'demo', ?)`,
  );

  for (const inv of invoices) {
      const totals = computeInvoiceTotals(
        inv.items.map((item) => ({ quantityMilli: item.qty * 1000, unitPriceMinor: item.unit })),
        0, 0, 0,
      );
      const paid = inv.status === 'paid' ? totals.totalMinor : 0;
      const issueDate = ago(inv.issueOffset);
      const dueDate = addDays(today, inv.dueOffset);
      const paidAt = inv.paidOffset != null ? `${ago(inv.paidOffset)}T15:20:00.000Z` : null;
      insertInvoice.run(
        inv.id, workspaceId, inv.number, inv.customerId, inv.status,
        issueDate, dueDate, totals.subtotalMinor, totals.totalMinor, paid,
        inv.notes ?? '', 'Net 30 · demo', publicToken(), null,
        paidAt, inv.status === 'draft' ? null : `${issueDate}T14:00:00.000Z`, now, now,
      );
      inv.items.forEach((item, index) => {
        insertItem.run(`${inv.id}_item_${index + 1}`, inv.id, item.description, item.detail,
          item.qty * 1000, item.unit, item.qty * item.unit, index);
      });
      if (inv.status === 'paid' && paidAt) {
        insertPayment.run(`pay_${inv.id}`, workspaceId, inv.id, paid, paidAt);
      }
    }

    const insertTransaction = db.prepare(
      `INSERT INTO transactions (id, workspace_id, date, external_id, counterparty, description, category,
        invoice_id, source, direction, status, amount_minor, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Demo ledger', ?, 'settled', ?, 'USD', ?)`,
    );
    const tx = (
      id: string, date: string, counterparty: string, description: string, category: string,
      invoiceId: string | null, direction: 'incoming' | 'outgoing', amountMinor: number,
    ) => {
      insertTransaction.run(id, workspaceId, date, `DEMO-${id.toUpperCase()}`, counterparty, description,
        category, invoiceId, direction, amountMinor, `${date}T12:00:00.000Z`);
    };

    // Incoming payments matching paid invoices
    tx('txn_id_1', ago(3), 'Acme Studios', 'Payment received · INV-2001', 'Client payments', 'inv_id_1', 'incoming', 240000);
    tx('txn_id_2', ago(5), 'Helio Ventures', 'Payment received · INV-2002', 'Client payments', 'inv_id_2', 'incoming', 185000);
    tx('txn_id_3', ago(18), 'Pixel & Co.', 'Brand consult · one-off', 'Client payments', null, 'incoming', 90000);

    // Outgoing recurring and one-off
    tx('txn_id_10', ago(7), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4900);
    tx('txn_id_11', ago(37), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4900);
    tx('txn_id_12', ago(67), 'CloudDesk Pro', 'Workspace subscription', 'Software', null, 'outgoing', 4500);
    tx('txn_id_13', ago(9), 'Amazon Web Services', 'Cloud hosting · monthly', 'Software', null, 'outgoing', 34000);
    tx('txn_id_14', ago(39), 'Amazon Web Services', 'Cloud hosting · monthly', 'Software', null, 'outgoing', 34000);
    tx('txn_id_15', ago(12), 'Figma', 'Team license · monthly', 'Software', null, 'outgoing', 7500);
    tx('txn_id_16', ago(42), 'Figma', 'Team license · monthly', 'Software', null, 'outgoing', 7500);
    tx('txn_id_17', ago(11), 'WeWork', 'Studio membership · monthly', 'Rent & facilities', null, 'outgoing', 120000);

    const expenseRows: [string, number, string, string, number, string][] = [
      ['Amazon Web Services', 8, 'Software', 'Cloud hosting · monthly', 34000, 'Corporate card •• 8921'],
      ['Webflow', 7, 'Software', 'Site hosting and CMS', 32000, 'Corporate card •• 8921'],
      ['Adobe Creative Cloud', 6, 'Software', 'Creative suite seats', 11920, 'Corporate card •• 8921'],
      ['CloudDesk Pro', 5, 'Software', 'Workspace subscription', 4900, 'Corporate card •• 8921'],
      ['Figma', 3, 'Software', 'Team license', 7500, 'Corporate card •• 8921'],
      ['Meta Ads', 6, 'Marketing', 'Paid social · October flight', 79200, 'Corporate card •• 4410'],
    ];
    const insertExpense = db.prepare(
      `INSERT INTO expenses (id, workspace_id, date, merchant, category, amount_minor, currency, source, notes, receipt_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, NULL, ?, ?)`,
    );
    expenseRows.forEach(([merchant, offset, category, notes, amount, source], index) => {
      insertExpense.run(`exp_id_${index + 1}`, workspaceId, ago(offset), merchant, category, amount, source, notes, now, now);
    });

    const period = monthKey(today);
    const budgets: [string, number][] = [
      ['Software', 200000],
      ['Marketing', 100000],
      ['Rent & facilities', 150000],
    ];
    const insertBudget = db.prepare(
      `INSERT INTO budgets (id, workspace_id, category, period, limit_minor, currency, created_at) VALUES (?, ?, ?, ?, ?, 'USD', ?)`,
    );
    budgets.forEach(([category, limit], index) => {
      insertBudget.run(`bud_id_${index + 1}`, workspaceId, category, period, limit, now);
    });
}
