// Builders for engine unit tests (not a test file itself).
import { DEFAULT_SETTINGS, type Settings } from "@/shared/settings";
import { parseTaskDefinition, type Task } from "@/shared/tasks";
import { EMPTY_TASK_STATE, type EngineTaskState } from "./kinds/types";

export function createTestTask<K extends Task["kind"]>(
  kind: K,
  config: Record<string, unknown>,
  overrides: Partial<Pick<Task, "id" | "name" | "enabled" | "createdAt">> = {},
): Extract<Task, { kind: K }> {
  const definition = parseTaskDefinition({ kind, config });
  return {
    ...definition,
    id: overrides.id ?? "11111111-1111-4111-8111-111111111111",
    name: overrides.name ?? "Tarefa",
    enabled: overrides.enabled ?? true,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  } as Extract<Task, { kind: K }>;
}

export function createTestState(patch: Partial<EngineTaskState> = {}): EngineTaskState {
  return { ...EMPTY_TASK_STATE, ...patch };
}

export function createTestSettings(quietHours: Partial<Settings["quietHours"]> = {}): Settings {
  return { ...DEFAULT_SETTINGS, quietHours: { ...DEFAULT_SETTINGS.quietHours, ...quietHours } };
}
