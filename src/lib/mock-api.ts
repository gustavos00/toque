// In-memory stand-in for /api/* routes, used only in development when
// NEXT_PUBLIC_TOQUE_MOCKS is set: "1" mocks every route, or a comma list of
// resources (e.g. "dashboard,events") mocks just the routes not built yet.
// Tag URLs here are fake; the UI always shows TagDto.url as the server sends it.

import {
  DEFAULT_SETTINGS,
  getLocalDate,
  getNextRecurringOccurrence,
  getRecurringDueAt,
  getTimerPhase,
  isUntilAckDay,
  mergeSettings,
  parseTaskDefinition,
  type DashboardDto,
  type EventDto,
  type SettingsDto,
  type TagDto,
  type TaskDto,
  type UpdateSettingsRequest,
} from "@/shared";

export function isMockedPath(path: string) {
  const flag = process.env.NEXT_PUBLIC_TOQUE_MOCKS;
  if (!flag) return false;
  if (flag === "1") return true;
  const resource = path.split("?")[0].split("/")[2];
  return flag.split(",").map((value) => value.trim()).includes(resource);
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function createIso(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function createMockTask(partial: Omit<TaskDto, "createdAt" | "updatedAt" | "enabled" | "state"> & Partial<TaskDto>): TaskDto {
  return {
    enabled: true,
    createdAt: createIso(-30 * DAY),
    updatedAt: createIso(-2 * DAY),
    state: null,
    ...partial,
  } as TaskDto;
}

const store = {
  tasks: [
    createMockTask({
      id: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a01",
      name: "Máquina de lavar",
      kind: "timer",
      config: { durationMinutes: 95, almostDoneEnabled: true, almostDoneMinutes: 10, forgottenRemindersEnabled: true, forgottenReminderMinutes: [30, 60] },
      state: {
        timerStartedAt: createIso(-53 * MINUTE),
        timerEndsAt: createIso(42 * MINUTE),
        lastDoneAt: createIso(-3 * DAY),
        lastAckDate: null,
        snoozedUntil: null,
      },
    }),
    createMockTask({
      id: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a02",
      name: "Lixo",
      kind: "until_ack",
      config: {
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        dates: [],
        exceptDates: ["2026-12-25"],
        reminderTimes: ["08:00", "13:00", "17:00", "19:00", "20:30", "21:30"],
      },
    }),
    createMockTask({
      id: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a03",
      name: "Regar as plantas",
      kind: "recurring",
      config: { mode: "interval", everyDays: 3, reminderTime: "09:00" },
      state: { timerStartedAt: null, timerEndsAt: null, lastDoneAt: createIso(-4 * DAY), lastAckDate: null, snoozedUntil: null },
    }),
    createMockTask({
      id: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a04",
      name: "Mudar os lençóis",
      kind: "recurring",
      config: { mode: "weekdays", weekdays: [1, 4], reminderTime: "10:00" },
      state: { timerStartedAt: null, timerEndsAt: null, lastDoneAt: createIso(-9 * DAY), lastAckDate: null, snoozedUntil: null },
    }),
    createMockTask({
      id: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a05",
      name: "Máquina de secar",
      kind: "timer",
      enabled: false,
      config: { durationMinutes: 120, almostDoneEnabled: false, almostDoneMinutes: 10, forgottenRemindersEnabled: false, forgottenReminderMinutes: [30] },
    }),
  ] as TaskDto[],
  tags: [
    {
      id: "a1",
      token: "k3J9xQ2m",
      label: "Tag da máquina",
      taskId: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a01",
      action: "start",
      url: "https://toque.example.com/t/k3J9xQ2m",
      createdAt: createIso(-20 * DAY),
      lastScannedAt: createIso(-53 * MINUTE),
    },
    {
      id: "a2",
      token: "Zp81LwQe",
      label: "Porta da cozinha",
      taskId: "6f1b8a52-0b8e-4a8e-9a43-1c0d6b2f0a02",
      action: "start",
      url: "https://toque.example.com/t/Zp81LwQe",
      createdAt: createIso(-20 * DAY),
      lastScannedAt: createIso(-1 * DAY),
    },
    {
      id: "a3",
      token: "u7Yt3RcA",
      label: "Tag sobresselente",
      taskId: null,
      action: "start",
      url: "https://toque.example.com/t/u7Yt3RcA",
      createdAt: createIso(-2 * DAY),
      lastScannedAt: null,
    },
  ] as TagDto[],
  settings: { ...DEFAULT_SETTINGS, ntfy: { server: "https://ntfy.sh", topic: "toque-7f3k29qz" } } as SettingsDto,
  events: [
    { type: "timer_started", taskIndex: 0, offset: -53 * MINUTE },
    { type: "acked", taskIndex: 1, offset: -21 * 60 * MINUTE },
    { type: "notification_sent", taskIndex: 1, offset: -22 * 60 * MINUTE },
    { type: "done", taskIndex: 0, offset: -3 * DAY },
    { type: "done", taskIndex: 2, offset: -4 * DAY },
  ].map((event, index) => ({
    id: `e${index}`,
    at: createIso(event.offset),
    type: event.type,
    taskId: null,
    taskName: null,
    tagId: null,
    data: {},
    taskIndex: event.taskIndex,
  })) as (EventDto & { taskIndex: number })[],
};

function buildEvents(): EventDto[] {
  return store.events.map(({ taskIndex, ...event }) => ({
    ...event,
    taskId: store.tasks[taskIndex]?.id ?? null,
    taskName: store.tasks[taskIndex]?.name ?? null,
  }));
}

function buildDashboard(): DashboardDto {
  const now = new Date();
  const today = getLocalDate(now);
  const enabled = store.tasks.filter((task) => task.enabled);
  return {
    now: now.toISOString(),
    today,
    timers: enabled.flatMap((task) => {
      if (task.kind !== "timer") return [];
      const endsAt = task.state?.timerEndsAt ?? null;
      const handledAt = task.state?.lastDoneAt ?? null;
      const phase = getTimerPhase(
        { timerEndsAt: endsAt ? new Date(endsAt) : null, lastDoneAt: handledAt ? new Date(handledAt) : null },
        now,
      );
      return [{ task, phase, startedAt: task.state?.timerStartedAt ?? null, endsAt, handledAt }];
    }),
    untilAckToday: enabled.flatMap((task) =>
      task.kind === "until_ack" && isUntilAckDay(task.config, today)
        ? [{ task, acked: task.state?.lastAckDate === today }]
        : [],
    ),
    recurring: enabled
      .flatMap((task) => {
        if (task.kind !== "recurring") return [];
        const lastDoneAt = task.state?.lastDoneAt ?? null;
        const history = { lastDoneAt: lastDoneAt ? new Date(lastDoneAt) : null, createdAt: new Date(task.createdAt) };
        const dueAt = getRecurringDueAt(task.config, history, now);
        const nextDueAt = getNextRecurringOccurrence(task.config, history, now);
        return [{ task, lastDoneAt, dueAt: dueAt.toISOString(), overdue: now >= dueAt, nextDueAt: nextDueAt.toISOString() }];
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    recentEvents: buildEvents().slice(0, 10),
  };
}

function readBody(init?: RequestInit): Record<string, unknown> {
  return typeof init?.body === "string" ? JSON.parse(init.body) : {};
}

function createRandomToken() {
  return Math.random().toString(36).slice(2, 10);
}

/** Answers like the real API would, after a short fake network delay. */
export async function getMockResponse<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const method = init?.method ?? "GET";
  const url = new URL(path, "http://mock");
  const [, , resource, id] = url.pathname.split("/");
  const body = readBody(init);

  if (resource === "auth") return null as T;
  if (resource === "dashboard") return buildDashboard() as T;
  if (resource === "events") return { events: buildEvents(), nextBeforeId: null } as T;

  if (resource === "settings") {
    if (method === "PATCH") store.settings = mergeSettings(store.settings, body as UpdateSettingsRequest);
    return store.settings as T;
  }

  if (resource === "tasks") {
    if (url.pathname.endsWith("/snooze")) return { title: "Adiado", message: "Volto a lembrar daqui a 30 min.", tone: "info" } as T;
    if (url.pathname.endsWith("/done")) return { title: "Feito", message: "Marcado como feito.", tone: "done" } as T;
    if (!id && method === "GET") return store.tasks as T;
    if (!id && method === "POST") {
      const definition = parseTaskDefinition(body);
      const task = createMockTask({
        id: crypto.randomUUID(),
        name: String(body.name),
        enabled: body.enabled !== false,
        ...definition,
      });
      store.tasks.push(task);
      return task as T;
    }
    const index = store.tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error("Tarefa não encontrada");
    if (method === "DELETE") {
      store.tasks.splice(index, 1);
      store.tags = store.tags.map((tag) => (tag.taskId === id ? { ...tag, taskId: null } : tag));
      return null as T;
    }
    if (method === "PATCH") {
      const current = store.tasks[index];
      const definition = body.config
        ? parseTaskDefinition({ kind: body.kind ?? current.kind, config: body.config })
        : {};
      store.tasks[index] = { ...current, ...body, ...definition, updatedAt: new Date().toISOString() } as TaskDto;
    }
    return store.tasks[index] as T;
  }

  if (resource === "tags") {
    if (!id && method === "GET") return store.tags as T;
    if (!id && method === "POST") {
      const token = createRandomToken();
      const tag: TagDto = {
        id: crypto.randomUUID(),
        token,
        label: String(body.label),
        taskId: (body.taskId as string | null) ?? null,
        action: body.action === "complete" ? "complete" : "start",
        url: `https://toque.example.com/t/${token}`,
        createdAt: new Date().toISOString(),
        lastScannedAt: null,
      };
      store.tags.push(tag);
      return tag as T;
    }
    const index = store.tags.findIndex((tag) => tag.id === id);
    if (method === "DELETE") {
      store.tags.splice(index, 1);
      return null as T;
    }
    store.tags[index] = { ...store.tags[index], ...body } as TagDto;
    return store.tags[index] as T;
  }

  throw new Error(`Mock sem rota: ${method} ${path}`);
}
