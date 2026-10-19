import { useRouter } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { fetchGoogleStatus, fetchSettings, logout, updateSettings } from "../../src/api";
import { Button, colors, Field, Input, LoadState, Row, Screen, Section, Stepper, Toggle } from "../../src/components/ui";
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
      setMessage(e instanceof Error ? e.message : "Falha ao guardar");
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
    <Screen title="Definições">
      <LoadState loading={loading} error={error} hasData={!!settings} onRetry={reload} />
      {message ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{message}</Text> : null}
      {settings ? (
        <>
          <Section
            title="Horas de silêncio"
            footer="Nestas horas não chega nenhum aviso. Os que caírem aqui são enviados no fim."
          >
            <Field label="Silenciar">
              <Toggle value={settings.quietHours.enabled} onChange={(enabled) => save({ quietHours: { enabled } })} />
            </Field>
            {settings.quietHours.enabled ? (
              <>
                <Field label="Das">{timeInput("qs", settings.quietHours.start, (start) => save({ quietHours: { start } }))}</Field>
                <Field label="Até às">{timeInput("qe", settings.quietHours.end, (end) => save({ quietHours: { end } }))}</Field>
              </>
            ) : null}
          </Section>

          {google ? (
            <Section title="Google Calendar" footer={google.lastError ?? undefined}>
              <Row
                title={google.connected ? "Ligado" : google.configured ? "Não ligado" : "Não configurado no servidor"}
                subtitle={google.email ?? undefined}
              />
            </Section>
          ) : null}

          <Section title="Avisos por omissão" footer="Valores sugeridos ao criar tarefas novas. Não mudam as tarefas existentes.">
            <Field label="Até confirmar (horas)">
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
            <Field label="Temporizador esquecido (min)">
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
          </Section>

          <Section footer="Quanto tempo o botão “Adiar” empurra o próximo aviso.">
            <Field label="Periódicas às">
              {timeInput("rec", settings.defaults.recurringReminderTime, (recurringReminderTime) =>
                save({ defaults: { recurringReminderTime } }),
              )}
            </Field>
            <Field label={`Adiar ${formatMinutes(settings.defaults.snoozeMinutes)}`}>
              <Stepper
                value={settings.defaults.snoozeMinutes}
                min={5}
                max={240}
                step={5}
                onChange={(snoozeMinutes) => save({ defaults: { snoozeMinutes } })}
              />
            </Field>
          </Section>

          <Section>
            <Row title="Terminar sessão" tone="danger" onPress={leave} />
          </Section>
          <Text style={{ textAlign: "center", color: colors.muted }}>Toque · bom, bonito e barato</Text>
        </>
      ) : null}
    </Screen>
  );
}
