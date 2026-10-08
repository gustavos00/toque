// DB client. With DATABASE_URL → Neon over HTTP (production). Without it →
// PGlite stored in .data/pglite, migrated automatically on first use, so local
// dev needs zero setup. TOQUE_PGLITE_DIR overrides the folder; "memory://"
// keeps it in memory (used by e2e runs next to `npm run dev`).
//
// Usage:  const db = await getDb();
//
// Caveat for the engine: the Neon HTTP driver has no interactive transactions
// (`db.transaction` throws). Keep writes safe without them: single statements,
// upserts, `onConflictDoNothing` on notifications.dedupe_key, and conditional
// updates (`... where sent_at is null`).

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export { schema };

/**
 * Drizzle database typed with our schema. Both drivers expose the same query
 * builder (select/insert/update/delete/query); typed as PGlite's for simplicity.
 */
export type Db = PgliteDatabase<typeof schema>;

const DEFAULT_PGLITE_DIR = path.join(process.cwd(), ".data", "pglite");
const PGLITE_MEMORY = "memory://";
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

// Survives Next dev hot reloads (one PGlite instance per process).
const globalForDb = globalThis as typeof globalThis & { toqueDb?: Promise<Db> };

/** The process-wide DB (created lazily on first call). */
export function getDb(): Promise<Db> {
  globalForDb.toqueDb ??= createConfiguredDb();
  return globalForDb.toqueDb;
}

/** Replaces the process-wide DB (tests). */
export function setDb(db: Db) {
  globalForDb.toqueDb = Promise.resolve(db);
}

function createConfiguredDb(): Promise<Db> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return Promise.resolve(createNeonDb(databaseUrl));
  const dataDir = process.env.TOQUE_PGLITE_DIR || DEFAULT_PGLITE_DIR;
  return createPgliteDb(dataDir === PGLITE_MEMORY ? undefined : dataDir);
}

function createNeonDb(databaseUrl: string): Db {
  return drizzleNeon(neon(databaseUrl), { schema }) as unknown as Db;
}

/**
 * PGlite DB with all migrations applied. Without `dataDir` it lives in memory
 * (used by tests).
 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}
