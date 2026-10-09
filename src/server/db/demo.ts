// Public demo: all data is wiped every DEMO_RESET_INTERVAL_MS. Lazy — the
// first request after the interval claims and runs the reset, so the demo
// needs no cron and no secret. A no-op outside demo mode.

import { and, eq, lte } from "drizzle-orm";
import { isDemoMode } from "@/shared/demo";
import type { Db } from "./index";
import {
  calendarEvents,
  demoState,
  events,
  notifications,
  settings,
  tags,
  tasks,
  taskState,
} from "./schema";

export const DEMO_RESET_INTERVAL_MS = 5 * 60 * 1000;

async function getLastDemoReset(db: Db, now: Date): Promise<Date> {
  const [row] = await db
    .select({ lastResetAt: demoState.lastResetAt })
    .from(demoState)
    .where(eq(demoState.id, 1));
  if (row) return row.lastResetAt;
  // First request on a fresh demo DB: start the clock, nothing to wipe.
  await db
    .insert(demoState)
    .values({ id: 1, lastResetAt: now })
    .onConflictDoNothing();
  return now;
}

/**
 * Wipes the demo data when the interval has passed. Only one concurrent
 * caller wins the conditional UPDATE; the deletes are idempotent (no
 * transactions on Neon HTTP). Returns true when this call wiped.
 * Cost when no reset is due: one SELECT.
 */
export async function maybeResetDemoData(db: Db, now: Date): Promise<boolean> {
  if (!isDemoMode()) return false;
  const lastResetAt = await getLastDemoReset(db, now);
  if (now.getTime() - lastResetAt.getTime() < DEMO_RESET_INTERVAL_MS) {
    return false;
  }
  const dueBefore = new Date(now.getTime() - DEMO_RESET_INTERVAL_MS);
  const claimed = await db
    .update(demoState)
    .set({ lastResetAt: now })
    .where(and(eq(demoState.id, 1), lte(demoState.lastResetAt, dueBefore)))
    .returning({ id: demoState.id });
  if (claimed.length === 0) return false;

  // Children first; every statement is safe to repeat.
  await db.delete(notifications);
  await db.delete(calendarEvents);
  await db.delete(events);
  await db.delete(taskState);
  await db.delete(tags);
  await db.delete(tasks);
  await db.delete(settings); // → defaults
  return true;
}

/** When the demo data will next be wiped; null outside demo mode. */
export async function getNextDemoResetAt(
  db: Db,
  now: Date,
): Promise<Date | null> {
  if (!isDemoMode()) return null;
  const lastResetAt = await getLastDemoReset(db, now);
  return new Date(lastResetAt.getTime() + DEMO_RESET_INTERVAL_MS);
}
