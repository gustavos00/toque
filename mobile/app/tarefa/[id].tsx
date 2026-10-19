import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { createTask, deleteTask, fetchTask, updateTask } from "../../src/api";
import {
  Button,
  colors,
  Field,
  Input,
  LoadState,
  Row,
  Screen,
  Section,
  Segmented,
  Stepper,
  Toggle,
} from "../../src/components/ui";
import {
  formatMinutes,
  KIND_DESCRIPTIONS,
  KIND_LABELS,
  KIND_PLACEHOLDERS,
  WEEKDAY_LETTERS,
} from "../../src/format";
import { syncReminderNotifications } from "../../src/notifications";
import { useApi } from "../../src/useApi";
import type { CreateTaskRequest, TaskDto } from "../../../src/shared/api";
import type { TaskDefinition } from "../../../src/shared/tasks";

type Kind = TaskDto["kind"];
type Form = { name: string; enabled: boolean; def: TaskDefinition };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function createDefault(kind: Kind): Form["def"] {
  if (kind === "timer")
    return {
      kind,
      config: {
        durationMinutes: 45,
        almostDoneEnabled: true,
        almostDoneMinutes: 10,
        forgottenRemindersEnabled: true,
        forgottenReminderMinutes: [30, 60],
      },
    };
  if (kind === "until_ack")
    return {
      kind,
      config: {
        weekdays: [1, 2, 3, 4, 5],
        dates: [],
        exceptDates: [],
        reminderTimes: ["08:00", "13:00", "17:00", "19:00", "20:30", "21:30"],
      },
    };
  return { kind, config: { mode: "weekdays", weekdays: [1], reminderTime: "09:00" } };
}

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "nova";
  const router = useRouter();
  const { data, error, loading, reload } = useApi(() =>
    isNew ? Promise.resolve(null) : fetchTask(id),
  );
  const [form, setForm] = useState<Form>({
    name: "",
    enabled: true,
    def: createDefault("timer"),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data)
      setForm({
        name: data.name,
        enabled: data.enabled,
        def: { kind: data.kind, config: data.config } as Form["def"],
      });
  }, [data]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      if (isNew)
        await createTask({ name: form.name, enabled: form.enabled, ...form.def } as CreateTaskRequest);
      else
        await updateTask(id, { name: form.name, enabled: form.enabled, ...form.def });
      void syncReminderNotifications();
      router.back();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao guardar");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Apagar tarefa?", "As tags ficam sem tarefa.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          await deleteTask(id).catch(() => undefined);
          void syncReminderNotifications();
          router.back();
        },
      },
    ]);
  }

  const setConfig = (patch: Record<string, unknown>) =>
    setForm((f) => ({ ...f, def: { ...f.def, config: { ...f.def.config, ...patch } } as Form["def"] }));

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? "Nova tarefa" : "Tarefa" }} />
      <LoadState loading={loading && !isNew} error={error} hasData={isNew || !!data} onRetry={reload} />
      {isNew || data ? (
        <>
          <Section>
            <Field label="Nome">
              <Input
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                placeholder={KIND_PLACEHOLDERS[form.def.kind]}
                maxLength={80}
              />
            </Field>
            <Field label="Ativa">
              <Toggle value={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
            </Field>
          </Section>

          <Section title="Tipo" footer={KIND_DESCRIPTIONS[form.def.kind]}>
            <Segmented
              value={form.def.kind}
              options={(Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
              onChange={(kind) => kind !== form.def.kind && setForm((f) => ({ ...f, def: createDefault(kind) }))}
            />
          </Section>

          <KindFields def={form.def} setConfig={setConfig} />

          {data && data.tags.length > 0 ? (
            <Section title="Tags" footer="Toca para gravar ou associar a etiqueta NFC.">
              {data.tags.map((tag) => (
                <Row key={tag.id} title={tag.label} onPress={() => router.push(`/tag/${tag.id}/associar`)} />
              ))}
            </Section>
          ) : null}

          {message ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{message}</Text> : null}
          <Button title={isNew ? "Criar" : "Guardar"} onPress={save} disabled={saving || !form.name.trim()} />
          {!isNew ? (
            <Section>
              <Row title="Apagar tarefa" tone="danger" onPress={confirmDelete} />
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function parseTimes(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean);
}

function KindFields({
  def,
  setConfig,
}: {
  def: Form["def"];
  setConfig: (patch: Record<string, unknown>) => void;
}) {
  const [timesText, setTimesText] = useState<string | null>(null);
  const [forgottenText, setForgottenText] = useState<string | null>(null);

  if (def.kind === "timer") {
    const c = def.config;
    return (
      <>
        <Section>
          <Field label={formatMinutes(c.durationMinutes)}>
            <Stepper value={c.durationMinutes} min={1} max={1440} step={5} onChange={(durationMinutes) => setConfig({ durationMinutes })} />
          </Field>
        </Section>
        <Section footer="Um aviso antes de a contagem acabar.">
          <Field label="Avisar antes de acabar">
            <Toggle value={c.almostDoneEnabled} onChange={(almostDoneEnabled) => setConfig({ almostDoneEnabled })} />
          </Field>
          {c.almostDoneEnabled ? (
            <Field label="Minutos antes">
              <Stepper value={c.almostDoneMinutes} min={1} max={Math.max(1, c.durationMinutes - 1)} onChange={(almostDoneMinutes) => setConfig({ almostDoneMinutes })} />
            </Field>
          ) : null}
        </Section>
        <Section footer="Minutos depois do fim, separados por vírgulas (ex.: 30, 60).">
          <Field label="Lembrar se ficar esquecida">
            <Toggle value={c.forgottenRemindersEnabled} onChange={(forgottenRemindersEnabled) => setConfig({ forgottenRemindersEnabled })} />
          </Field>
          {c.forgottenRemindersEnabled ? (
            <Field label="Depois de (min)">
              <Input
                value={forgottenText ?? c.forgottenReminderMinutes.join(", ")}
                onChangeText={(text) => {
                  setForgottenText(text);
                  const values = parseTimes(text).map(Number);
                  if (values.every((v) => Number.isInteger(v) && v >= 1 && v <= 1440))
                    setConfig({ forgottenReminderMinutes: values });
                }}
                keyboardType="numbers-and-punctuation"
              />
            </Field>
          ) : null}
        </Section>
      </>
    );
  }

  if (def.kind === "until_ack") {
    const c = def.config;
    return (
      <>
        <Section title="Dias">
          <WeekdayPicker value={c.weekdays} onChange={(weekdays) => setConfig({ weekdays })} />
        </Section>
        <Section title="Horas dos avisos" footer="HH:MM separadas por vírgulas, por ordem.">
          <Field label="Horas">
            <Input
              value={timesText ?? c.reminderTimes.join(", ")}
              onChangeText={(text) => {
                setTimesText(text);
                const times = parseTimes(text);
                if (times.length > 0 && times.every((t) => TIME.test(t))) setConfig({ reminderTimes: times });
              }}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />
          </Field>
        </Section>
      </>
    );
  }

  const c = def.config;
  return (
    <>
      <Section title="Repetir">
        <Segmented
          value={c.mode}
          options={[
            { value: "weekdays", label: "Dias da semana" },
            { value: "interval", label: "De N em N dias" },
          ]}
          onChange={(mode) =>
            setConfig(mode === "weekdays" ? { mode, weekdays: [1], everyDays: undefined } : { mode, everyDays: 7, weekdays: undefined })
          }
        />
        {c.mode === "weekdays" ? (
          <WeekdayPicker value={c.weekdays} onChange={(weekdays) => setConfig({ weekdays })} />
        ) : (
          <Field label={`A cada ${c.everyDays} dia${c.everyDays === 1 ? "" : "s"}`}>
            <Stepper value={c.everyDays} min={1} max={365} onChange={(everyDays) => setConfig({ everyDays })} />
          </Field>
        )}
      </Section>
      <Section>
        <Field label="Hora do aviso">
          <Input
            value={timesText ?? c.reminderTime}
            onChangeText={(text) => {
              setTimesText(text);
              if (TIME.test(text)) setConfig({ reminderTime: text });
            }}
            keyboardType="numbers-and-punctuation"
          />
        </Field>
      </Section>
    </>
  );
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 12 }}>
      {WEEKDAY_LETTERS.map((letter, index) => {
        const day = index + 1;
        const on = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityLabel={`dia ${day}`}
            onPress={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort())}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? colors.primary : "#e5e5ea",
            }}
          >
            <Text style={{ color: on ? "#fff" : colors.text }}>{letter}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
