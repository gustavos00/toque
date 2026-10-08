"use client";

import { ExternalLink, LogOut, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { mergeSettings, type SettingsDto, type UpdateSettingsRequest } from "@/shared";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage, logout, updateSettings } from "@/lib/api";
import { formatMinutes } from "@/lib/format";
import { useSettings } from "@/lib/queries";
import { getStoredTheme, saveTheme, type Theme } from "@/lib/theme";
import { CopyButton } from "./copy-button";
import { ListField, ListInput, ListRow, ListSection } from "./grouped-list";
import { MinutesListEditor, PICKER_CLASS_NAME, TimeListEditor } from "./list-editors";
import { PageHeader } from "./page-header";
import { SegmentedControl } from "./segmented-control";
import { ListSkeleton, LoadError } from "./status";
import { Stepper } from "./stepper";

const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function SettingsView() {
  const { data: settings, error, isLoading, mutate } = useSettings();

  /** Saves immediately, like iOS Settings; rolls back on failure. */
  async function saveSettings(patch: UpdateSettingsRequest) {
    if (!settings) return;
    try {
      await mutate(() => updateSettings(patch), {
        optimisticData: mergeSettings(settings, patch),
        rollbackOnError: true,
        revalidate: false,
      });
    } catch (saveError) {
      toast.error(getErrorMessage(saveError));
    }
  }

  return (
    <>
      <PageHeader title="Definições" />
      <AppearanceSection />
      {isLoading && !settings && <ListSkeleton sections={3} rows={2} />}
      {error && !settings && <LoadError error={error} onRetry={() => mutate()} />}
      {settings && <SettingsContent settings={settings} onSave={saveSettings} />}
    </>
  );
}

const THEME_OPTIONS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
] as const satisfies readonly { value: Theme; label: string }[];

/** Device-only appearance preference (not a server setting). */
function AppearanceSection() {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === "undefined" ? "light" : getStoredTheme()));

  function changeTheme(next: Theme) {
    setTheme(next);
    saveTheme(next);
  }

  return (
    <ListSection title="Aparência" footer="Guardado só neste aparelho. Automático segue o modo claro/escuro do sistema.">
      <div className="p-2">
        <SegmentedControl label="Aparência" value={theme} options={THEME_OPTIONS} onChange={changeTheme} />
      </div>
    </ListSection>
  );
}

function SettingsContent({ settings, onSave }: { settings: SettingsDto; onSave: (patch: UpdateSettingsRequest) => void }) {
  const { quietHours, ntfy, defaults } = settings;

  return (
    <>
      <ListSection
        title="Horas de silêncio"
        footer="Nestas horas não chega nenhum aviso. Os que caírem aqui são enviados no fim."
      >
        <ListField label="Silenciar" htmlFor="quiet-enabled">
          <Switch
            id="quiet-enabled"
            checked={quietHours.enabled}
            onCheckedChange={(enabled) => onSave({ quietHours: { enabled } })}
          />
        </ListField>
        {quietHours.enabled && (
          <>
            <ListField label="Das" htmlFor="quiet-start">
              <input
                id="quiet-start"
                type="time"
                value={quietHours.start}
                onChange={(event) => event.target.value && onSave({ quietHours: { start: event.target.value } })}
                className={PICKER_CLASS_NAME}
              />
            </ListField>
            <ListField label="Até às" htmlFor="quiet-end">
              <input
                id="quiet-end"
                type="time"
                value={quietHours.end}
                onChange={(event) => event.target.value && onSave({ quietHours: { end: event.target.value } })}
                className={PICKER_CLASS_NAME}
              />
            </ListField>
          </>
        )}
      </ListSection>

      <NtfySection server={ntfy.server} topic={ntfy.topic} onSave={(patch) => onSave({ ntfy: patch })} />

      <ListSection title="Avisos por omissão" footer="Valores sugeridos ao criar tarefas novas. Não mudam as tarefas existentes.">
        <ListRow title="Até confirmar" subtitle="Horas dos avisos, por ordem" />
        <TimeListEditor
          values={defaults.untilAckReminderTimes}
          onChange={(untilAckReminderTimes) =>
            untilAckReminderTimes.every(Boolean) && onSave({ defaults: { untilAckReminderTimes } })
          }
        />
      </ListSection>

      <ListSection footer="Lembretes depois de um temporizador acabar, se ficar esquecido.">
        <ListRow title="Temporizador esquecido" />
        <MinutesListEditor
          values={defaults.timerForgottenReminderMinutes}
          onChange={(timerForgottenReminderMinutes) =>
            timerForgottenReminderMinutes.every((value) => Number.isFinite(value) && value >= 1) &&
            onSave({ defaults: { timerForgottenReminderMinutes } })
          }
          describe={(minutes) => (Number.isFinite(minutes) ? `${formatMinutes(minutes)} depois` : "Minutos depois")}
        />
      </ListSection>

      <ListSection footer="Quanto tempo o botão “Adiar” empurra o próximo aviso.">
        <ListField label="Periódicas às" htmlFor="recurring-default">
          <input
            id="recurring-default"
            type="time"
            value={defaults.recurringReminderTime}
            onChange={(event) =>
              event.target.value && onSave({ defaults: { recurringReminderTime: event.target.value } })
            }
            className={PICKER_CLASS_NAME}
          />
        </ListField>
        <ListField label={`Adiar ${formatMinutes(defaults.snoozeMinutes)}`}>
          <Stepper
            label="tempo de adiar"
            value={defaults.snoozeMinutes}
            min={5}
            max={240}
            step={5}
            onChange={(snoozeMinutes) => onSave({ defaults: { snoozeMinutes } })}
          />
        </ListField>
      </ListSection>

      <LogoutSection />

      <p className="pb-4 text-center text-[13px] text-muted-foreground">Toque · bom, bonito e barato</p>
    </>
  );
}

function NtfySection({
  server,
  topic,
  onSave,
}: {
  server: string;
  topic: string | null;
  onSave: (patch: { topic?: string | null; server?: string }) => void;
}) {
  const [draft, setDraft] = useState(topic ?? "");
  const isValid = draft === "" || NTFY_TOPIC_PATTERN.test(draft);
  const subscribeUrl = topic ? `${server.replace(/\/$/, "")}/${topic}` : null;

  function commitTopic() {
    const next = draft.trim() || null;
    if (!isValid || next === topic) return;
    onSave({ topic: next });
    toast.success(next ? "Tópico guardado" : "Avisos desligados");
  }

  return (
    <ListSection
      title="Notificações (ntfy)"
      footer={
        !isValid
          ? "Só letras, números, _ e -."
          : "Quem souber o tópico recebe os teus avisos: usa um nome difícil de adivinhar."
      }
    >
      <ListField label="Tópico" htmlFor="ntfy-topic">
        <ListInput
          id="ntfy-topic"
          value={draft}
          placeholder="ex.: toque-k29qz7"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={!isValid || undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitTopic}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="text-right text-muted-foreground aria-invalid:text-destructive"
        />
      </ListField>
      {topic && (
        <div className="flex items-center justify-between gap-3 border-b border-separator py-2 pr-2 pl-4">
          <p className="min-w-0 truncate font-mono text-[15px]">{topic}</p>
          <CopyButton value={topic} label="Copiar" />
        </div>
      )}
      <div className="px-4 py-3">
        <p className="mb-2 text-[15px] font-semibold">Como receber os avisos no iPhone</p>
        <ol className="list-decimal space-y-1 pl-5 text-[15px] text-muted-foreground">
          <li>Instala a app <span className="text-foreground">ntfy</span> da App Store.</li>
          <li>Abre-a e toca em <span className="text-foreground">+</span> para subscrever um tópico.</li>
          <li>Cola o tópico acima{server !== "https://ntfy.sh" ? ` e escolhe o servidor ${server}` : ""}.</li>
          <li>Permite as notificações quando o iOS perguntar.</li>
        </ol>
        {subscribeUrl && (
          <a
            href={subscribeUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] text-primary active:opacity-60"
          >
            Abrir o tópico no browser <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </ListSection>
  );
}

function LogoutSection() {
  const [isLeaving, setIsLeaving] = useState(false);

  async function leave() {
    setIsLeaving(true);
    try {
      await logout();
    } catch {
      // Even if the call fails, go to the login page.
    }
    window.location.replace("/login");
  }

  return (
    <ListSection>
      <button
        type="button"
        onClick={leave}
        disabled={isLeaving}
        className="pressable flex min-h-11 w-full items-center justify-center gap-2 py-2.5 text-[17px] text-destructive"
      >
        {isLeaving ? <Loader2 className="size-5 animate-spin" /> : <LogOut className="size-5" />}
        Terminar sessão
      </button>
    </ListSection>
  );
}
