import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { fetchDashboard, markTaskDone, snoozeTask } from "../../src/api";
import {
  Button,
  colors,
  Empty,
  LoadState,
  Row,
  Screen,
  Section,
} from "../../src/components/ui";
import {
  formatDayTime,
  formatEventSubject,
  formatEventType,
  formatLongToday,
  formatRemaining,
} from "../../src/format";
import { useApi } from "../../src/useApi";

export default function DashboardScreen() {
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

  const timers =
    data?.timers.filter((t) => {
      if (t.phase === "running" || t.phase === "ready") return true;
      return (
        t.phase === "handled" &&
        t.handledAt !== null &&
        new Date(t.handledAt).toDateString() === now.toDateString()
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
    <Screen title="Painel" eyebrow={formatLongToday(now)}>
      <LoadState loading={loading} error={error} hasData={!!data} onRetry={reload} />
      {isEmpty ? (
        <Section>
          <Empty
            title="Bem-vindo ao Toque"
            description="Cria uma tarefa, associa-lhe uma tag NFC e toca com o iPhone para registar."
          />
          <Button title="Criar tarefa" onPress={() => router.push("/tarefa/nova")} />
        </Section>
      ) : null}
      {data && !isEmpty ? (
        <>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
            <Pill value={running} label="a decorrer" color={colors.primary} />
            <Pill
              value={pending}
              label="por fazer hoje"
              color={pending > 0 ? colors.warning : colors.success}
            />
            <Pill
              value={overdue}
              label="em atraso"
              color={overdue > 0 ? colors.danger : colors.success}
            />
          </View>

          {timers.length > 0 ? (
            <Section title="Agora">
              {timers.map((t) => (
                <Row
                  key={t.task.id}
                  title={t.task.name}
                  onPress={() => router.push(`/tarefa/${t.task.id}`)}
                  subtitle={
                    t.phase === "running" && t.endsAt
                      ? `A decorrer · ${formatRemaining(t.endsAt, now)}`
                      : t.phase === "ready"
                        ? "Terminou — por tratar"
                        : "Tratado"
                  }
                  trailing={
                    t.phase === "ready" ? (
                      <Button
                        title="Já tratei"
                        onPress={() => act(markTaskDone, t.task.id)}
                        tone="plain"
                      />
                    ) : undefined
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section title="Hoje">
            {data.untilAckToday.length === 0 ? (
              <Empty title="Nada marcado para hoje" description="Dia livre de avisos." />
            ) : (
              data.untilAckToday.map(({ task, acked }) => (
                <Row
                  key={task.id}
                  title={task.name}
                  onPress={() => router.push(`/tarefa/${task.id}`)}
                  subtitle={acked ? "Feito hoje" : "Por fazer"}
                  trailing={
                    acked ? (
                      <Text style={{ color: colors.success }}>✓</Text>
                    ) : (
                      <View style={{ flexDirection: "row" }}>
                        <Button
                          title="Adiar"
                          onPress={() => act(snoozeTask, task.id)}
                          tone="plain"
                        />
                        <Button
                          title="Feito"
                          onPress={() => act(markTaskDone, task.id)}
                          tone="plain"
                        />
                      </View>
                    )
                  }
                />
              ))
            )}
          </Section>

          {data.recurring.length > 0 ? (
            <Section title="Periódicas">
              {data.recurring.map((r) => (
                <Row
                  key={r.task.id}
                  title={r.task.name}
                  onPress={() => router.push(`/tarefa/${r.task.id}`)}
                  subtitle={
                    r.overdue
                      ? "Em atraso"
                      : `Próxima: ${new Date(r.dueAt).toLocaleDateString("pt-PT", { weekday: "long" })}`
                  }
                  trailing={
                    <Button
                      title="Feito"
                      onPress={() => act(markTaskDone, r.task.id)}
                      tone="plain"
                    />
                  }
                />
              ))}
            </Section>
          ) : null}

          <Section
            title="Recente"
            action={
              <Text style={{ color: colors.primary }} onPress={() => router.push("/historico")}>
                Ver tudo
              </Text>
            }
          >
            {data.recentEvents.length === 0 ? (
              <Empty title="Ainda não há registos." />
            ) : (
              data.recentEvents.slice(0, 5).map((e) => (
                <Row
                  key={e.id}
                  title={formatEventSubject(e)}
                  subtitle={`${formatEventType(e)} · ${formatDayTime(e.at)}`}
                />
              ))
            )}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function Pill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color }}>{value}</Text>
      <Text style={{ fontSize: 13, color: colors.muted }}>{label}</Text>
    </View>
  );
}
