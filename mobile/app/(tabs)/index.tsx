import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchDashboard, markTaskDone, snoozeTask } from "../../src/api";
import {
  Button,
  colors,
  Empty,
  LoadState,
  Row,
  Screen,
  Section,
  TextAction,
} from "../../src/components/ui";
import {
  formatDayKey,
  formatDayTime,
  formatEventSubject,
  formatEventType,
  formatLongToday,
  formatRemaining,
  formatTime,
  formatWeekday,
} from "../../src/format";
import { useApi } from "../../src/useApi";

function summarize(running: number, pending: number, overdue: number): string {
  const parts = [
    running > 0 ? `${running} running` : null,
    pending > 0 ? `${pending} due today` : null,
    overdue > 0 ? `${overdue} overdue` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nothing waiting on you.";
}

export default function TodayScreen() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi(fetchDashboard);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function act(fn: (id: string) => Promise<unknown>, id: string) {
    await fn(id).catch(() => undefined);
    await reload();
  }

  const today = formatDayKey(now);
  const timers =
    data?.timers.filter((t) => {
      if (t.phase === "running" || t.phase === "ready") return true;
      return (
        t.phase === "handled" &&
        t.handledAt !== null &&
        formatDayKey(new Date(t.handledAt)) === today
      );
    }) ?? [];
  const running = timers.filter((t) => t.phase === "running").length;
  const pending = data?.untilAckToday.filter((i) => !i.acked).length ?? 0;
  const overdue = data?.recurring.filter((i) => i.overdue).length ?? 0;
  const isEmpty =
    data &&
    data.timers.length + data.untilAckToday.length + data.recurring.length === 0 &&
    data.recentEvents.length === 0;

  return (
    <Screen
      title="Today"
      eyebrow={formatLongToday(now)}
      summary={data && !isEmpty ? summarize(running, pending, overdue) : undefined}
    >
      <LoadState loading={loading} error={error} hasData={!!data} onRetry={reload} />
      {isEmpty ? (
        <>
          <Section>
            <Empty
              title="No tasks yet"
              description="Create a task, give it an NFC tag, and tap the tag with your iPhone to log it."
            />
          </Section>
          <Button title="New task" onPress={() => router.push("/task/new")} />
        </>
      ) : null}
      {data && !isEmpty ? (
        <>
          {timers.length > 0 ? (
            <Section title="Running">
              {timers.map((t) => (
                <Row
                  key={t.task.id}
                  title={t.task.name}
                  onPress={() => router.push(`/task/${t.task.id}`)}
                  subtitle={
                    t.phase === "running" && t.endsAt
                      ? `Ends ${formatTime(t.endsAt)}`
                      : t.phase === "ready"
                        ? "Finished, waiting for you"
                        : t.handledAt
                          ? `Handled ${formatTime(t.handledAt)}`
                          : "Handled"
                  }
                  trailing={
                    t.phase === "running" && t.endsAt ? (
                      <Text style={styles.clock}>{formatRemaining(t.endsAt, now)}</Text>
                    ) : t.phase === "ready" ? (
                      <TextAction title="Handled" onPress={() => act(markTaskDone, t.task.id)} />
                    ) : undefined
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section title="Due today">
            {data.untilAckToday.length === 0 ? (
              <Empty title="Nothing due today" />
            ) : (
              data.untilAckToday.map(({ task, acked }) => (
                <Row
                  key={task.id}
                  title={task.name}
                  onPress={() => router.push(`/task/${task.id}`)}
                  subtitle={acked ? "Done today" : "Not done yet"}
                  trailing={
                    acked ? undefined : (
                      <View style={styles.actions}>
                        <TextAction
                          title="Snooze"
                          tone="muted"
                          onPress={() => act(snoozeTask, task.id)}
                        />
                        <TextAction title="Done" onPress={() => act(markTaskDone, task.id)} />
                      </View>
                    )
                  }
                />
              ))
            )}
          </Section>

          {data.recurring.length > 0 ? (
            <Section title="Recurring">
              {data.recurring.map((r) => (
                <Row
                  key={r.task.id}
                  title={r.task.name}
                  onPress={() => router.push(`/task/${r.task.id}`)}
                  subtitle={
                    r.overdue ? (
                      <Text style={{ color: colors.danger }}>Overdue</Text>
                    ) : (
                      `Next ${formatWeekday(r.dueAt)}`
                    )
                  }
                  trailing={
                    <TextAction title="Done" onPress={() => act(markTaskDone, r.task.id)} />
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section
            title="Recent"
            action={
              <TextAction title="See all" tone="muted" onPress={() => router.push("/history")} />
            }
          >
            {data.recentEvents.length === 0 ? (
              <Empty title="Nothing logged yet" />
            ) : (
              data.recentEvents.slice(0, 5).map((e) => (
                <Row
                  key={e.id}
                  title={formatEventSubject(e)}
                  subtitle={formatEventType(e)}
                  value={formatDayTime(e.at, now)}
                />
              ))
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  clock: {
    fontSize: 22,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    fontWeight: "300",
  },
  actions: { flexDirection: "row", gap: 12 },
});
