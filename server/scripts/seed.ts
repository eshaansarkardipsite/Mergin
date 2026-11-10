import { closeDb, getDb } from '../db/connection';
import { seedDatabase } from '../db/seed';

const db = getDb();
seedDatabase(db);
const counts = {
  invoices: (db.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number }).n,
  transactions: (db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number }).n,
  expenses: (db.prepare('SELECT COUNT(*) AS n FROM expenses').get() as { n: number }).n,
  reviews: (db.prepare('SELECT COUNT(*) AS n FROM sentinel_reviews').get() as { n: number }).n,
};
console.log('Seed complete:', counts);
closeDb();
