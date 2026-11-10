import { DatabaseSync } from 'node:sqlite';
import { config } from '../config';
import { SCHEMA_SQL } from './schema';

let db: DatabaseSync | null = null;
let activePath = config.databasePath;

export function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(activePath);
    db.exec(SCHEMA_SQL);
  }
  return db;
}

/** Test helper: close and reopen the singleton against a fresh database. */
export function resetDbForTests(path = ':memory:'): DatabaseSync {
  if (db) db.close();
  activePath = path;
  db = new DatabaseSync(activePath);
  db.exec(SCHEMA_SQL);
  return db;
}

export function closeDb(): void {
  if (db) db.close();
  db = null;
}
