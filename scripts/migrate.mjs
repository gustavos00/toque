// Applies drizzle/ migrations to the configured DB:
// Neon when DATABASE_URL is set, otherwise PGlite in TOQUE_PGLITE_DIR
// (default .data/pglite; "memory://" = in memory, only useful as a check).
//   npm run db:migrate
import { mkdir } from "node:fs/promises";
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(databaseUrl)), { migrationsFolder });
  console.log("Migrações aplicadas (Neon).");
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
  console.log(`Migrações aplicadas (PGlite em ${dataDir ?? "memória"}).`);
}
