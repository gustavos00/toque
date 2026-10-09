type DueRow = {
  id: string;
  taskId: string | null;
  dueAt: Date;
  createdAt: Date;
};

/**
 * Catch-up rule for late or skipped ticks: of all rows already due for one task, send only
 * the latest (most escalated / most recent) and supersede the rest — no burst of stale alerts.
 * Rows without a task are independent.
 */
export function selectRowsToSend<R extends DueRow>(
  rows: R[],
): { send: R[]; supersede: R[] } {
  const latestByGroup = new Map<string, R>();
  for (const row of rows) {
    const group = row.taskId ?? `row:${row.id}`;
    const current = latestByGroup.get(group);
    const isLater =
      !current ||
      row.dueAt.getTime() > current.dueAt.getTime() ||
      (row.dueAt.getTime() === current.dueAt.getTime() &&
        row.createdAt.getTime() >= current.createdAt.getTime());
    if (isLater) latestByGroup.set(group, row);
  }
  const send = [...latestByGroup.values()];
  const chosen = new Set(send.map((row) => row.id));
  return { send, supersede: rows.filter((row) => !chosen.has(row.id)) };
}
