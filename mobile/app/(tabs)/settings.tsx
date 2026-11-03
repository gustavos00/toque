import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { fetchGoogleStatus, fetchSettings, logout, updateSettings } from "../../src/api";
import {
  colors,
  Field,
  Input,
  LoadState,
  Message,
  Row,
  Screen,
  Section,
  Stepper,
  Toggle,
} from "../../src/components/ui";
import { formatMinutes } from "../../src/format";
import { useApi } from "../../src/useApi";
import type { UpdateSettingsRequest } from "../../../src/shared/settings";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SettingsScreen() {
  const router = useRouter();
  const { data: settings, setData, error, loading, reload } = useApi(fetchSettings);
  const { data: google } = useApi(fetchGoogleStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function save(patch: UpdateSettingsRequest) {
    setMessage(null);
    try {
      setData(await updateSettings(patch));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
      await reload();
    }
  }

  const timeInput = (key: string, current: string, onValid: (v: string) => void) => (
    <Input
      value={drafts[key] ?? current}
      onChangeText={(text) => {
        setDrafts((d) => ({ ...d, [key]: text }));
        if (TIME.test(text)) onValid(text);
      }}
      keyboardType="numbers-and-punctuation"
      style={drafts[key] !== undefined && !TIME.test(drafts[key]) ? { color: colors.danger } : undefined}
    />
  );

  async function leave() {
    await logout();
    router.replace("/login");
  }

  return (
    <Screen title="Settings">
      <LoadState loading={loading} error={error} hasData={!!settings} onRetry={reload} />
      <Message text={message} />
      {settings ? (
        <>
          <Section
            title="Quiet hours"
            footer="No reminders arrive during these hours. Any that fall inside are sent when they end."
          >
            <Field label="Quiet hours">
              <Toggle value={settings.quietHours.enabled} onChange={(enabled) => save({ quietHours: { enabled } })} />
            </Field>
            {settings.quietHours.enabled ? (
              <>
                <Field label="From">{timeInput("qs", settings.quietHours.start, (start) => save({ quietHours: { start } }))}</Field>
                <Field label="Until">{timeInput("qe", settings.quietHours.end, (end) => save({ quietHours: { end } }))}</Field>
              </>
            ) : null}
          </Section>

          <Section
            title="Defaults for new tasks"
            footer="Suggested when you create a task. Existing tasks keep their own values."
          >
            <Field label="Until done, at">
              <Input
                value={drafts.ack ?? settings.defaults.untilAckReminderTimes.join(", ")}
                onChangeText={(text) => {
                  setDrafts((d) => ({ ...d, ack: text }));
                  const times = text.split(/[\s,;]+/).filter(Boolean);
                  if (times.length > 0 && times.every((t) => TIME.test(t)))
                    save({ defaults: { untilAckReminderTimes: times } });
                }}
                keyboardType="numbers-and-punctuation"
              />
            </Field>
            <Field label="Left unattended (min)">
              <Input
                value={drafts.forgotten ?? settings.defaults.timerForgottenReminderMinutes.join(", ")}
                onChangeText={(text) => {
                  setDrafts((d) => ({ ...d, forgotten: text }));
                  const values = text.split(/[\s,;]+/).filter(Boolean).map(Number);
                  if (values.every((v) => Number.isInteger(v) && v >= 1 && v <= 1440))
                    save({ defaults: { timerForgottenReminderMinutes: values } });
                }}
                keyboardType="numbers-and-punctuation"
              />
            </Field>
            <Field label="Recurring, at">
              {timeInput("rec", settings.defaults.recurringReminderTime, (recurringReminderTime) =>
                save({ defaults: { recurringReminderTime } }),
              )}
            </Field>
          </Section>

          <Section
            title="Snooze"
            footer="How far “Snooze” pushes the next reminder."
          >
            <Field label={formatMinutes(settings.defaults.snoozeMinutes)}>
              <Stepper
                value={settings.defaults.snoozeMinutes}
                min={5}
                max={240}
                step={5}
                onChange={(snoozeMinutes) => save({ defaults: { snoozeMinutes } })}
              />
            </Field>
          </Section>

          {google ? (
            <Section title="Google Calendar" footer={google.lastError ?? undefined}>
              <Row
                title={
                  google.connected
                    ? "Connected"
                    : google.configured
                      ? "Not connected"
                      : "Not set up on the server"
                }
                subtitle={google.email ?? undefined}
              />
            </Section>
          ) : null}

          <Section>
            <Row title="Sign out" tone="danger" onPress={leave} />
          </Section>
          <Text style={{ color: colors.faint, fontSize: 13 }}>Toque 0.1</Text>
        </>
      ) : null}
    </Screen>
  );
}
