// Test helper: a fresh in-memory PGlite DB with migrations applied, installed
// as the process-wide DB so code calling getDb() uses it.
//
//   let db: Db;
//   beforeEach(async () => { db = await createTestDb(); });

import { createPgliteDb, setDb, type Db } from "./index";

export async function createTestDb(): Promise<Db> {
  const db = await createPgliteDb();
  setDb(db);
  return db;
}
