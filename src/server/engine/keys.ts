/**
 * Outbox dedupe keys: "<prefix>:<taskId>:<occurrence>[:<rest>…]". The third segment is always the
 * occurrence the row belongs to (local date for until_ack/recurring, cycle start ms for timers),
 * so the sender can bind notification buttons to it. Occurrences never contain ":".
 */
export function buildNotificationKey(prefix: string, taskId: string, occurrence: string, ...rest: (string | number)[]): string {
  return [prefix, taskId, occurrence, ...rest].join(":");
}

export function readOccurrenceFromKey(key: string | null): string | null {
  return key?.split(":")[2] || null;
}
