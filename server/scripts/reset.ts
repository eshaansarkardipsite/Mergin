import { resetDemoData } from '../db/reset';
import { closeDb, getDb } from '../db/connection';

getDb();
resetDemoData();
console.log('Demo database reset and reseeded.');
closeDb();
