import { BellRing, Repeat, Timer, type LucideIcon } from "lucide-react";
import type { TaskDto, TaskKind } from "@/shared";
import { formatEveryDays, formatMinutes, formatWeekdays } from "./format";
import { formatWeekdaySummary } from "./weekdays";

type TaskKindMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind background class for the icon tile. */
  tileClassName: string;
  textClassName: string;
};

export const TASK_KIND_META: Record<TaskKind, TaskKindMeta> = {
  timer: {
    label: "Temporizador",
    description: "Ler a tag inicia uma contagem. Avisa quando acaba e lembra se ficar esquecido.",
    icon: Timer,
    tileClassName: "bg-kind-timer",
    textClassName: "text-kind-timer",
  },
  until_ack: {
    label: "Até confirmar",
    description: "Nos dias marcados, avisa a horas certas até leres a tag nesse dia.",
    icon: BellRing,
    tileClassName: "bg-kind-until-ack",
    textClassName: "text-kind-until-ack",
  },
  recurring: {
    label: "Periódica",
    description: "Em dias da semana certos ou de N em N dias. Ler a tag marca como feita; fica em atraso depois do prazo.",
    icon: Repeat,
    tileClassName: "bg-kind-recurring",
    textClassName: "text-kind-recurring",
  },
};

/** One line describing the task's schedule, e.g. "1 h 35 min" or "seg, qua · 6 avisos". */
export function describeTaskSchedule(task: TaskDto) {
  switch (task.kind) {
    case "timer":
      return `Dura ${formatMinutes(task.config.durationMinutes)}`;
    case "until_ack": {
      const days = task.config.weekdays.length > 0 ? formatWeekdays(task.config.weekdays) : "datas avulsas";
      const count = task.config.reminderTimes.length;
      return `${days[0].toUpperCase()}${days.slice(1)} · ${count} ${count === 1 ? "aviso" : "avisos"}`;
    }
    case "recurring": {
      const when =
        task.config.mode === "weekdays" ? formatWeekdaySummary(task.config.weekdays) : formatEveryDays(task.config.everyDays);
      return `${when[0].toUpperCase()}${when.slice(1)} · às ${task.config.reminderTime}`;
    }
  }
}
