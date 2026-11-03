// What the engine returns from handleScan; rendered by GET /t/[token].

/**
 * - started: something began (timer started)
 * - done: the task was completed / acknowledged
 * - cancelled: a running thing was stopped
 * - info: nothing changed, just information
 */
export type ScanTone = "started" | "done" | "cancelled" | "info";

export type ScanResult = {
  /** Short heading, Portuguese, e.g. "Machine a lavar". */
  title: string;
  /** One line, e.g. "Ends at 15:40". */
  message: string;
  tone: ScanTone;
};
