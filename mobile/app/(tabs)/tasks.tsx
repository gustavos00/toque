import { useRouter } from "expo-router";
import { fetchTasks } from "../../src/api";
import { Button, Empty, LoadState, Row, Screen, Section } from "../../src/components/ui";
import {
  formatMinutes,
  formatTagCount,
  formatWeekdays,
  KIND_PLURALS,
} from "../../src/format";
import { useApi } from "../../src/useApi";
import type { TaskDto } from "../../../src/shared/api";

const KIND_ORDER = ["timer", "until_ack", "recurring"] as const;

function summarize(task: TaskDto): string {
  if (task.kind === "timer") return formatMinutes(task.config.durationMinutes);
  if (task.kind === "until_ack")
    return `${formatWeekdays(task.config.weekdays)} · from ${task.config.reminderTimes[0] ?? "—"}`;
  return task.config.mode === "weekdays"
    ? `${formatWeekdays(task.config.weekdays)} · ${task.config.reminderTime}`
    : `Every ${task.config.everyDays} days · ${task.config.reminderTime}`;
}

export default function TasksScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(fetchTasks);
  return (
    <Screen title="Tasks">
      <LoadState loading={loading} error={error} hasData={!!data} onRetry={reload} />
      {data ? (
        <>
          {data.length === 0 ? (
            <Section>
              <Empty title="No tasks yet" description="Create the first one." />
            </Section>
          ) : (
            KIND_ORDER.map((kind) => {
              const tasks = data.filter((task) => task.kind === kind);
              if (tasks.length === 0) return null;
              return (
                <Section key={kind} title={KIND_PLURALS[kind]}>
                  {tasks.map((task) => (
                    <Row
                      key={task.id}
                      title={task.name}
                      subtitle={`${summarize(task)}${task.enabled ? "" : " · Off"}`}
                      value={formatTagCount(task.tags.length)}
                      onPress={() => router.push(`/task/${task.id}`)}
                    />
                  ))}
                </Section>
              );
            })
          )}
          <Button title="New task" onPress={() => router.push("/task/new")} />
        </>
      ) : null}
    </Screen>
  );
}
