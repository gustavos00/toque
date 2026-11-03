import { useRouter } from "expo-router";
import { fetchTasks } from "../../src/api";
import { Button, Empty, LoadState, Row, Screen, Section } from "../../src/components/ui";
import { formatMinutes, formatWeekdays, KIND_LABELS } from "../../src/format";
import { useApi } from "../../src/useApi";
import type { TaskDto } from "../../../src/shared/api";

function summarize(task: TaskDto): string {
  const kind = KIND_LABELS[task.kind];
  if (task.kind === "timer") return `${kind} · ${formatMinutes(task.config.durationMinutes)}`;
  if (task.kind === "until_ack")
    return `${kind} · ${formatWeekdays(task.config.weekdays)} · ${task.config.reminderTimes.join(", ")}`;
  return task.config.mode === "weekdays"
    ? `${kind} · ${formatWeekdays(task.config.weekdays)}`
    : `${kind} · de ${task.config.everyDays} em ${task.config.everyDays} dias`;
}

export default function TasksScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(fetchTasks);
  return (
    <Screen title="Tarefas">
      <LoadState loading={loading} error={error} hasData={!!data} onRetry={reload} />
      {data ? (
        <>
          <Section>
            {data.length === 0 ? (
              <Empty title="Sem tarefas" description="Cria a primeira tarefa." />
            ) : (
              data.map((task) => (
                <Row
                  key={task.id}
                  title={task.name}
                  subtitle={`${summarize(task)}${task.enabled ? "" : " · desligada"}`}
                  onPress={() => router.push(`/tarefa/${task.id}`)}
                />
              ))
            )}
          </Section>
          <Button title="Nova tarefa" onPress={() => router.push("/tarefa/nova")} />
        </>
      ) : null}
    </Screen>
  );
}
