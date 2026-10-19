import type { EventDto } from "../../src/shared/api";

const EVENT_LABELS: Record<string, string> = {
  scan: "Tag lida",
  task_created: "Tarefa criada",
  task_updated: "Tarefa alterada",
  task_deleted: "Tarefa apagada",
  timer_started: "Começou",
  timer_finished: "Terminou",
  timer_cancelled: "Cancelado",
  acked: "Feito",
  done: "Feito",
  snoozed: "Adiado",
  notification_sent: "Aviso enviado",
  notification_failed: "Aviso falhou",
};

export const KIND_LABELS = {
  timer: "Temporizador",
  until_ack: "Até confirmar",
  recurring: "Periódica",
} as const;

export const KIND_PLACEHOLDERS = {
  timer: "ex.: Máquina de lavar",
  until_ack: "ex.: Pôr o lixo na rua",
  recurring: "ex.: Regar as plantas",
} as const;

export const KIND_DESCRIPTIONS = {
  timer:
    "Ler a tag inicia uma contagem. Avisa quando acaba e lembra se ficar esquecido.",
  until_ack:
    "Nos dias marcados, avisa a horas certas até leres a tag nesse dia.",
  recurring:
    "Em dias da semana certos ou de N em N dias. Ler a tag marca como feita; fica em atraso depois do prazo.",
} as const;

const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 7) return "todos os dias";
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((d) => weekdays.includes(d)))
    return "dias úteis";
  if (weekdays.length === 2 && weekdays.includes(6) && weekdays.includes(7))
    return "fins de semana";
  return weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(", ");
}

export const WEEKDAY_LETTERS = ["S", "T", "Q", "Q", "S", "S", "D"];

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatEventType(event: EventDto): string {
  return EVENT_LABELS[event.type] ?? event.type;
}

export function formatEventSubject(event: EventDto): string {
  if (event.taskName) return event.taskName;
  if (event.type === "task_deleted" && typeof event.data.name === "string")
    return event.data.name;
  return event.type === "scan" ? "Tag sem tarefa" : "Toque";
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDayTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day}, ${formatTime(iso)}`;
}

export function formatLongToday(now: Date): string {
  return now.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "12:34" / "mm:ss" style remaining time for a running timer. */
export function formatRemaining(endsAt: string, now: Date): string {
  const total = Math.max(0, Math.round((new Date(endsAt).getTime() - now.getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
