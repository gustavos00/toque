// Applies drizzle/ migrations to the configured DB:
// Neon when DATABASE_URL is set, otherwise PGlite in TOQUE_PGLITE_DIR
// (default .data/pglite; "memory://" = in memory, only useful as a check).
//   npm run db:migrate
import { mkdir } from "node:fs/promises";
import path from "node:path";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const databaseUrl = process.env.DATABASE_URL;

// On Vercel the build runs this before `next build` (see vercel.json); never
// fall back to a throwaway PGlite there.
if (process.env.VERCEL && !databaseUrl) {
  console.error("DATABASE_URL em falta: liga a base de dados Neon ao projeto (prefixo DATABASE).");
  process.exit(1);
}

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
