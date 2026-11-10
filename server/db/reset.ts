import { getDb } from './connection';
import { SCHEMA_SQL } from './schema';
import { seedDatabase } from './seed';

const TABLES = [
  'webhook_events',
  'audit_events',
  'notifications',
  'sentinel_reviews',
  'recurring_patterns',
  'budgets',
  'expenses',
  'transactions',
  'payments',
  'invoice_items',
  'invoices',
  'customers',
  'workspace_settings',
  'users',
  'workspaces',
];

/** Destroys only local demo records and reseeds. Never calls PayPal. */
export function resetDemoData(): void {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = OFF');
  for (const table of TABLES) db.exec(`DROP TABLE IF EXISTS ${table}`);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  seedDatabase(db);
}
