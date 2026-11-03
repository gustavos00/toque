import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { createTask, deleteTask, fetchTask, updateTask } from "../../src/api";
import {
  Button,
  colors,
  Field,
  Input,
  LoadState,
  Message,
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
  WEEKDAY_NAMES,
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
  const isNew = id === "new";
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
      setMessage(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete task?", "Its tags are kept, with no task.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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
      <Stack.Screen options={{ title: isNew ? "New task" : "Task" }} />
      <LoadState loading={loading && !isNew} error={error} hasData={isNew || !!data} onRetry={reload} />
      {isNew || data ? (
        <>
          <Section>
            <Field label="Name">
              <Input
                value={form.name}
                onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                placeholder={KIND_PLACEHOLDERS[form.def.kind]}
                maxLength={80}
              />
            </Field>
            <Field label="On">
              <Toggle value={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
            </Field>
          </Section>

          <Section title="Kind" footer={KIND_DESCRIPTIONS[form.def.kind]}>
            <Segmented
              value={form.def.kind}
              options={(Object.keys(KIND_LABELS) as Kind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
              onChange={(kind) => kind !== form.def.kind && setForm((f) => ({ ...f, def: createDefault(kind) }))}
            />
          </Section>

          <KindFields def={form.def} setConfig={setConfig} />

          {data && data.tags.length > 0 ? (
            <Section title="Tags" footer="Tap a tag to write it to an NFC sticker.">
              {data.tags.map((tag) => (
                <Row
                  key={tag.id}
                  title={tag.label}
                  value={tag.action === "complete" ? "Completes" : "Starts"}
                  onPress={() => router.push(`/tag/${tag.id}/link`)}
                />
              ))}
            </Section>
          ) : null}

          <Message text={message} />
          <Button title={isNew ? "Create task" : "Save"} onPress={save} disabled={saving || !form.name.trim()} />
          {!isNew ? <Button title="Delete task" tone="danger" onPress={confirmDelete} /> : null}
        </>
      ) : null}
    </Screen>
  );
}

function parseList(text: string): string[] {
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
        <Section title="Duration">
          <Field label={formatMinutes(c.durationMinutes)}>
            <Stepper value={c.durationMinutes} min={1} max={1440} step={5} onChange={(durationMinutes) => setConfig({ durationMinutes })} />
          </Field>
        </Section>
        <Section title="Before it ends" footer="One reminder shortly before the countdown ends.">
          <Field label="Remind me">
            <Toggle value={c.almostDoneEnabled} onChange={(almostDoneEnabled) => setConfig({ almostDoneEnabled })} />
          </Field>
          {c.almostDoneEnabled ? (
            <Field label="Minutes before">
              <Stepper value={c.almostDoneMinutes} min={1} max={Math.max(1, c.durationMinutes - 1)} onChange={(almostDoneMinutes) => setConfig({ almostDoneMinutes })} />
            </Field>
          ) : null}
        </Section>
        <Section title="Left unattended" footer="Minutes after the end, separated by commas (e.g. 30, 60).">
          <Field label="Remind me">
            <Toggle value={c.forgottenRemindersEnabled} onChange={(forgottenRemindersEnabled) => setConfig({ forgottenRemindersEnabled })} />
          </Field>
          {c.forgottenRemindersEnabled ? (
            <Field label="After (min)">
              <Input
                value={forgottenText ?? c.forgottenReminderMinutes.join(", ")}
                onChangeText={(text) => {
                  setForgottenText(text);
                  const values = parseList(text).map(Number);
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
        <Section title="Days">
          <WeekdayPicker value={c.weekdays} onChange={(weekdays) => setConfig({ weekdays })} />
        </Section>
        <Section title="Reminders" footer="HH:MM, separated by commas, in order.">
          <Field label="At">
            <Input
              value={timesText ?? c.reminderTimes.join(", ")}
              onChangeText={(text) => {
                setTimesText(text);
                const times = parseList(text);
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
      <Section title="Repeat">
        <Segmented
          value={c.mode}
          options={[
            { value: "weekdays", label: "On weekdays" },
            { value: "interval", label: "Every N days" },
          ]}
          onChange={(mode) =>
            setConfig(mode === "weekdays" ? { mode, weekdays: [1], everyDays: undefined } : { mode, everyDays: 7, weekdays: undefined })
          }
        />
        {c.mode === "weekdays" ? (
          <WeekdayPicker value={c.weekdays} onChange={(weekdays) => setConfig({ weekdays })} />
        ) : (
          <Field label={`Every ${c.everyDays} day${c.everyDays === 1 ? "" : "s"}`}>
            <Stepper value={c.everyDays} min={1} max={365} onChange={(everyDays) => setConfig({ everyDays })} />
          </Field>
        )}
      </Section>
      <Section>
        <Field label="Reminder at">
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
    <View style={styles.weekdays}>
      {WEEKDAY_LETTERS.map((letter, index) => {
        const day = index + 1;
        const on = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityLabel={WEEKDAY_NAMES[index]}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on ? value.filter((d) => d !== day) : [...value, day].sort())}
            style={[styles.day, on && styles.dayOn]}
          >
            <Text style={{ color: on ? colors.bg : colors.soft, fontWeight: "500" }}>{letter}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  weekdays: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  dayOn: { backgroundColor: colors.text, borderColor: colors.text },
});
