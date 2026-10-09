// PWA-side copy for the public demo (see isDemoMode in src/shared/demo.ts).

/** Footer for features blocked in the public demo (ntfy, Google Calendar). */
export const DEMO_UNAVAILABLE = "Indisponível na demonstração";

const RESET_INTERVAL_MS = 5 * 60_000;

/**
 * Next demo wipe: the server's `demoResetAt` when known, otherwise the next
 * 5-minute boundary of the clock (the reset cadence).
 */
export function getNextDemoReset(now: Date, demoResetAt?: string | null) {
  if (demoResetAt) {
    const fromServer = new Date(demoResetAt);
    if (fromServer.getTime() > now.getTime()) return fromServer;
  }
  return new Date(Math.ceil((now.getTime() + 1) / RESET_INTERVAL_MS) * RESET_INTERVAL_MS);
}

/** "daqui a 3 min", "daqui a menos de 1 min". */
export function formatDemoResetIn(next: Date, now: Date) {
  const minutes = Math.ceil((next.getTime() - now.getTime()) / 60_000);
  return minutes <= 1 ? "daqui a menos de 1 min" : `daqui a ${minutes} min`;
}
