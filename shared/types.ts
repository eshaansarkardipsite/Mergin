/**
 * Shared domain types. Money is always an integer number of minor units
 * (cents for USD) and always paired with a currency code.
 */

export type Currency = 'USD';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  timezone: string;
  createdAt: string;
}

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'cancelled'
  | 'overdue';

export interface InvoiceLineItem {
  id: string;
  description: string;
  detail?: string;
  quantityMilli: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  number: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: Currency;
  items: InvoiceLineItem[];
  subtotalMinor: number;
  taxRateBps: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  notes: string;
  paymentTerms: string;
  publicToken: string;
  paypalInvoiceId: string | null;
  paypalStatus: string | null;
  paypalApprovalUrl: string | null;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TransactionDirection = 'incoming' | 'outgoing';
export type TransactionStatus = 'settled' | 'pending' | 'refunded' | 'failed';

export interface Transaction {
  id: string;
  workspaceId: string;
  date: string;
  externalId: string;
  counterparty: string;
  description: string;
  category: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  source: string;
  direction: TransactionDirection;
  status: TransactionStatus;
  amountMinor: number;
  currency: Currency;
  createdAt: string;
}

export interface Expense {
  id: string;
  workspaceId: string;
  date: string;
  merchant: string;
  category: string;
  amountMinor: number;
  currency: Currency;
  source: string;
  notes: string;
  receiptName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  workspaceId: string;
  category: string;
  period: string; // YYYY-MM
  limitMinor: number;
  currency: Currency;
  createdAt: string;
}

export interface BudgetView extends Budget {
  spentMinor: number;
  remainingMinor: number;
  utilisationBps: number;
  state: 'under' | 'near' | 'over';
}

export interface RecurringPattern {
  id: string;
  workspaceId: string;
  merchant: string;
  normalizedMerchant: string;
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  currency: Currency;
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

export type SentinelStatus = 'open' | 'kept' | 'remind' | 'follow-up' | 'dismissed';

export interface SentinelReview {
  id: string;
  workspaceId: string;
  patternId: string;
  merchant: string;
  title: string;
  summary: string;
  reason: 'price-change' | 'possible-duplicate' | 'renewal-soon' | 'new-pattern';
  status: SentinelStatus;
  severity: 'attention' | 'info';
  amountMinor: number;
  previousAmountMinor: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  usageDataConnected: boolean;
}

export interface Notification {
  id: string;
  workspaceId: string;
  kind: 'invoice' | 'sentinel' | 'budget' | 'system';
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
}

export type WebhookProcessingState = 'processed' | 'ignored' | 'failed';

export interface WebhookEventRecord {
  id: string;
  workspaceId: string | null;
  providerEventId: string;
  eventType: string;
  paypalInvoiceId: string | null;
  processingState: WebhookProcessingState;
  note: string;
  receivedAt: string;
  processedAt: string | null;
}

export interface Payment {
  id: string;
  workspaceId: string;
  invoiceId: string;
  paypalPaymentId: string | null;
  amountMinor: number;
  currency: Currency;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  method: 'paypal' | 'demo';
  receivedAt: string;
}

export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  company: string;
}

export interface DashboardSummary {
  recordedBalanceMinor: number;
  incomingThisMonthMinor: number;
  outstandingMinor: number;
  expensesThisMonthMinor: number;
  overdueCount: number;
  streakLabel: string;
  currency: Currency;
  invoicesByStatus: Record<string, number>;
  revenueSeries: { label: string; valueMinor: number }[];
  expenseSeries: { label: string; valueMinor: number }[];
  recentTransactions: Transaction[];
  attention: {
    id: string;
    kind: 'invoice' | 'sentinel' | 'budget' | 'bill';
    title: string;
    detail: string;
    href: string;
    amountMinor: number | null;
  }[];
}

export interface CashFlowPoint {
  label: string;
  date: string;
  inflowMinor: number;
  outflowMinor: number;
  balanceMinor: number;
  estimated: boolean;
}

export type CashFlowScenario = 'baseline' | 'conservative';

export interface CashFlowSummary {
  recordedBalanceMinor: number;
  confirmedReceiptsMinor: number;
  outstandingMinor: number;
  scheduledOutflowsMinor: number;
  points: CashFlowPoint[];
  assumptions: string[];
  currency: Currency;
  scenario: 'baseline' | 'conservative';
  outflowBufferBps: number;
}

export interface CopilotEvidence {
  label: string;
  detail: string;
  href: string;
  amountMinor: number | null;
}

export interface CopilotAnswer {
  directAnswer: string;
  explanation: string;
  evidence: CopilotEvidence[];
  assumptions: string[];
  nextStep: string;
  amountMinor: number | null;
  currency: Currency;
  period: string;
  source: 'gemini' | 'deterministic';
  model: string | null;
}

export interface SettingsState {
  workspace: Workspace;
  profile: { name: string; email: string };
  paypal: {
    environment: string;
    configured: boolean;
    connected: boolean;
    webhookConfigured: boolean;
    statusLabel: string;
    detail: string;
    clientIdHint: string;
  };
  gemini: { configured: boolean; model: string | null; mode: 'live' | 'deterministic' };
  sentinel: { minimumObservations: number; priceChangeThresholdBps: number; renewalLeadDays: number };
  demoMode: boolean;
  demoSession: boolean;
  appBaseUrl: string;
  webhookUrl: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  demo: boolean;
}
