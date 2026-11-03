// Applies drizzle/ migrations to the configured DB:
// Neon when DATABASE_URL is set, otherwise PGlite in TOQUE_PGLITE_DIR
// (default .data/pglite; "memory://" = in memory, only useful as a check).
//   npm run db:migrate
import { mkdir } from "node:fs/promises";
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const databaseUrl = process.env.DATABASE_URL;

// On Vercel the build runs this before `next build` (see vercel.json). Production
// must have Neon. A preview without a database runs on an in-memory PGlite that
// migrates itself on first use (src/server/db/index.ts), so there is nothing to do.
if (process.env.VERCEL && !databaseUrl) {
  if (process.env.VERCEL_ENV === "production") {
    console.error("DATABASE_URL is missing: connect the Neon database to the project (prefix DATABASE).");
    process.exit(1);
  }
  console.log("No DATABASE_URL on this preview: it runs on an in-memory PGlite.");
  process.exit(0);
}

if (databaseUrl) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(databaseUrl)), { migrationsFolder });
  console.log("Migrations applied (Neon).");
} else {
  const configuredDir =
    process.env.TOQUE_PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
  const dataDir = configuredDir === "memory://" ? undefined : configuredDir;
  if (dataDir) await mkdir(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
  console.log(`Migrations applied (PGlite at ${dataDir ?? "memory"}).`);
}
