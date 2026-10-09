"use client";

import { useRouter } from "next/navigation";
import { AlarmClock, CircleCheck, Loader2, Nfc, Plus, Trash2 } from "lucide-react";
import { use, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import {
  createTaskRequestSchema,
  DEFAULT_SETTINGS,
  getLocalDate,
  TASK_KINDS,
  type CreateTaskRequest,
  type RecurringMode,
  type ScanResult,
  type Settings,
  type TagDto,
  type TaskDto,
  type TaskKind,
} from "@/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { API_PATHS, createTag, createTask, deleteTask, getErrorMessage, getTaskPath, markTaskDone, snoozeTask, updateTask } from "@/lib/api";
import { formatEveryDays, formatMinutes } from "@/lib/format";
import { useSettings, useTags, useTask, useTasks } from "@/lib/queries";
import { formatTagAction } from "@/lib/task-tags";
import { TASK_KIND_META } from "@/lib/task-kinds";
import { cn } from "@/lib/utils";
import { ListField, ListInput, ListRow, ListSection } from "./grouped-list";
import { DateListEditor, MinutesListEditor, PICKER_CLASS_NAME, TimeListEditor } from "./list-editors";
import { PageHeader } from "./page-header";
import { SegmentedControl } from "./segmented-control";
import { ListSkeleton, LoadError } from "./status";
import { Stepper } from "./stepper";
import { TagSheet } from "./tag-sheet";
import { TaskIcon } from "./task-icon";
import { WeekdayPicker } from "./weekday-picker";

type FormState = {
  name: string;
  enabled: boolean;
  kind: TaskKind;
  timer: {
    durationMinutes: number;
    almostDoneEnabled: boolean;
    almostDoneMinutes: number;
    forgottenRemindersEnabled: boolean;
    forgottenReminderMinutes: number[];
  };
  untilAck: { weekdays: number[]; dates: string[]; exceptDates: string[]; reminderTimes: string[] };
  recurring: { mode: RecurringMode; weekdays: number[]; everyDays: number; reminderTime: string };
};

const KIND_OPTIONS = TASK_KINDS.map((kind) => ({ value: kind, label: TASK_KIND_META[kind].label }));
const REPEAT_OPTIONS = [
  { value: "weekdays", label: "Dias da semana" },
  { value: "interval", label: "A cada N dias" },
] as const satisfies readonly { value: RecurringMode; label: string }[];


function createInitialState(task: TaskDto | null, settings: Settings): FormState {
  const defaults = settings.defaults;
  const state: FormState = {
    name: task?.name ?? "",
    enabled: task?.enabled ?? true,
    kind: task?.kind ?? "timer",
    timer: {
      durationMinutes: 90,
      almostDoneEnabled: true,
      almostDoneMinutes: 10,
      forgottenRemindersEnabled: true,
      forgottenReminderMinutes: defaults.timerForgottenReminderMinutes,
    },
    untilAck: { weekdays: [], dates: [], exceptDates: [], reminderTimes: defaults.untilAckReminderTimes },
    recurring: { mode: "weekdays", weekdays: [], everyDays: 7, reminderTime: defaults.recurringReminderTime },
  };
  if (task?.kind === "timer") {
    // Optional fields tolerate configs saved before they existed.
    const config = task.config as typeof task.config &
      Partial<{ forgottenRemindersEnabled: boolean; almostDoneEnabled: boolean; almostDoneMinutes: number }>;
    state.timer = {
      durationMinutes: config.durationMinutes,
      almostDoneEnabled: config.almostDoneEnabled ?? false,
      almostDoneMinutes: config.almostDoneMinutes ?? 10,
      forgottenRemindersEnabled: config.forgottenRemindersEnabled ?? false,
      forgottenReminderMinutes: config.forgottenReminderMinutes,
    };
  }
  if (task?.kind === "until_ack") state.untilAck = { ...task.config };
  if (task?.kind === "recurring") {
    // Keep the other mode's values around so switching modes is lossless.
    state.recurring =
      task.config.mode === "weekdays"
        ? { ...state.recurring, mode: "weekdays", weekdays: task.config.weekdays, reminderTime: task.config.reminderTime }
        : { ...state.recurring, mode: "interval", everyDays: task.config.everyDays, reminderTime: task.config.reminderTime };
  }
  return state;
}

function buildRequest(form: FormState): CreateTaskRequest {
  const base = { name: form.name.trim(), enabled: form.enabled };
  switch (form.kind) {
    case "timer": {
      const config = { ...form.timer };
      return { ...base, kind: "timer", config };
    }
    case "until_ack":
      return { ...base, kind: "until_ack", config: form.untilAck };
    case "recurring": {
      const { mode, weekdays, everyDays, reminderTime } = form.recurring;
      return {
        ...base,
        kind: "recurring",
        config: mode === "weekdays" ? { mode, weekdays, reminderTime } : { mode, everyDays, reminderTime },
      };
    }
  }
}

/** Plain-language check before sending; zod is the backstop. */
function findFormProblem(form: FormState): string | null {
  if (!form.name.trim()) return "Dá um nome à tarefa.";
  if (form.kind === "until_ack") {
    if (form.untilAck.weekdays.length === 0 && form.untilAck.dates.length === 0)
      return "Escolhe pelo menos um dia da semana ou uma data.";
    if (form.untilAck.reminderTimes.length === 0) return "Adiciona pelo menos uma hora de aviso.";
  }
  if (form.kind === "recurring" && form.recurring.mode === "weekdays" && form.recurring.weekdays.length === 0)
    return "Escolhe pelo menos um dia.";
  if (
    form.kind === "timer" &&
    form.timer.almostDoneEnabled &&
    (!Number.isFinite(form.timer.almostDoneMinutes) || form.timer.almostDoneMinutes < 1 || form.timer.almostDoneMinutes >= form.timer.durationMinutes)
  )
    return "O aviso tem de ser antes do fim.";
  if (form.kind === "timer" && form.timer.forgottenRemindersEnabled && form.timer.forgottenReminderMinutes.some((value) => !Number.isFinite(value) || value < 1))
    return "Os lembretes têm de ter pelo menos 1 minuto.";
  const parsed = createTaskRequestSchema.safeParse(buildRequest(form));
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Verifica os campos.");
}

/** Edit route: unwraps the dynamic `id` param. */
export function TaskEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TaskEditor taskId={id} />;
}

export function TaskEditor({ taskId }: { taskId: string | null }) {
  const { data: task, error, isLoading, mutate } = useTask(taskId);
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const isNew = taskId === null;
  const back = { href: "/tarefas", label: "Tarefas" };

  if ((!isNew && isLoading) || (isLoadingSettings && !settings)) {
    return (
      <>
        <PageHeader title={isNew ? "Nova tarefa" : "Tarefa"} back={back} compact />
        <ListSkeleton sections={3} />
      </>
    );
  }
  if (!isNew && (error || !task)) {
    return (
      <>
        <PageHeader title="Tarefa" back={back} compact />
        <LoadError error={error} onRetry={() => mutate()} />
      </>
    );
  }
  return <TaskForm key={task?.updatedAt ?? "new"} task={task ?? null} settings={settings ?? DEFAULT_SETTINGS} />;
}

function TaskForm({ task, settings }: { task: TaskDto | null; settings: Settings }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState(() => createInitialState(task, settings));
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [createdTimer, setCreatedTimer] = useState<TaskDto | null>(null);
  const isNew = task === null;
  const today = getLocalDate(new Date());

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setProblem(null);
  }

  function refreshLists() {
    void mutate(API_PATHS.tasks);
    void mutate(API_PATHS.dashboard);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    const formProblem = findFormProblem(form);
    if (formProblem) {
      setProblem(formProblem);
      return;
    }
    setIsSaving(true);
    try {
      const request = buildRequest(form);
      if (task) {
        const updated = await updateTask(task.id, request);
        await mutate(getTaskPath(task.id), updated, { revalidate: false });
        toast.success("Alterações guardadas");
      } else {
        const created = await createTask(request);
        if (created.kind === "timer") {
          setCreatedTimer(created);
        } else {
          toast.success("Tarefa criada", { description: "Associa-lhe uma tag no separador Tags." });
          router.push("/tarefas");
        }
      }
      refreshLists();
    } catch (error) {
      setProblem(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTask() {
    if (!task) return;
    try {
      await deleteTask(task.id);
      toast.success(`"${task.name}" apagada`);
      refreshLists();
      void mutate(API_PATHS.tags);
      router.push("/tarefas");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function runTaskAction(action: (id: string) => Promise<ScanResult>) {
    if (!task) return;
    try {
      const result = await action(task.id);
      toast.success(result.title, { description: result.message });
      refreshLists();
      void mutate(getTaskPath(task.id));
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const saveButton = (
    <Button
      type="submit"
      form="task-form"
      variant="ghost"
      size="touch"
      disabled={isSaving}
      className="px-2 text-[17px] text-primary"
    >
      {isSaving ? <Loader2 className="animate-spin" /> : isNew ? "Criar" : "Guardar"}
    </Button>
  );

  return (
    <>
      <SecondTagPrompt task={createdTimer} onClose={() => router.push("/tarefas")} />
      <PageHeader
        title={isNew ? "Nova tarefa" : task.name}
        back={{ href: "/tarefas", label: "Tarefas" }}
        action={saveButton}
        compact
      />
      <form id="task-form" onSubmit={submitForm} className="pt-4" noValidate>
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <TaskIcon kind={form.kind} size="lg" muted={!form.enabled} />
          <p className="max-w-sm text-[15px] text-muted-foreground">{TASK_KIND_META[form.kind].description}</p>
        </div>

        <ListSection>
          <div className="pl-4">
            <ListInput
              aria-label="Nome da tarefa"
              placeholder="Nome (ex.: Máquina de lavar)"
              value={form.name}
              maxLength={80}
              onChange={(event) => updateForm("name", event.target.value)}
              className="border-b border-separator pr-4"
              enterKeyHint="done"
            />
          </div>
          <ListField label="Ativa" htmlFor="task-enabled">
            <Switch id="task-enabled" checked={form.enabled} onCheckedChange={(value) => updateForm("enabled", value)} />
          </ListField>
        </ListSection>

        {isNew && (
          <ListSection title="Tipo">
            <div className="p-2">
              <SegmentedControl
                label="Tipo de tarefa"
                value={form.kind}
                options={KIND_OPTIONS}
                onChange={(kind) => updateForm("kind", kind)}
              />
            </div>
          </ListSection>
        )}

        {form.kind === "timer" && (
          <TimerFields value={form.timer} onChange={(timer) => updateForm("timer", timer)} />
        )}
        {form.kind === "until_ack" && (
          <UntilAckFields value={form.untilAck} today={today} onChange={(untilAck) => updateForm("untilAck", untilAck)} />
        )}
        {form.kind === "recurring" && (
          <RecurringFields value={form.recurring} onChange={(recurring) => updateForm("recurring", recurring)} />
        )}

        {problem && (
          <p role="alert" className="mb-5 rounded-xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
            {problem}
          </p>
        )}

        <Button type="submit" size="xl" className="mb-7 w-full" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" />}
          {isNew ? "Criar tarefa" : "Guardar alterações"}
        </Button>
      </form>

      {task && (
        <>
          <TaskTagsSection task={task} />

          {task.enabled && (
            <ListSection footer="Para quando não tens a tag à mão.">
              <ListRow
                onClick={() => runTaskAction(markTaskDone)}
                icon={<CircleCheck className="size-[22px] text-success" />}
                title={<span className="text-primary">Já tratei</span>}
                chevron={false}
              />
              <ListRow
                onClick={() => runTaskAction(snoozeTask)}
                icon={<AlarmClock className="size-[22px] text-muted-foreground" />}
                title={<span className="text-primary">Adiar</span>}
                subtitle={`Próximo lembrete daqui a ${formatMinutes(settings.defaults.snoozeMinutes)}`}
                chevron={false}
              />
            </ListSection>
          )}

          <ListSection>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="pressable flex min-h-11 w-full items-center justify-center gap-2 py-2.5 text-[17px] text-destructive">
                  <Trash2 className="size-5" /> Apagar tarefa
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apagar &quot;{task.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os avisos pendentes são cancelados e as tags ficam sem tarefa. O histórico mantém-se.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
                  <AlertDialogAction size="touch" variant="destructive" onClick={removeTask}>
                    Apagar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </ListSection>
        </>
      )}
    </>
  );
}

/** Linked tags (each opens the tag sheet) and "Adicionar tag" with this task pre-selected. */
function TaskTagsSection({ task }: { task: TaskDto }) {
  const { data: allTags } = useTags();
  const { data: tasks } = useTasks();
  const [openTag, setOpenTag] = useState<TagDto | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const taskTags = task.tags;

  function openSheet(tagId: string | null) {
    setOpenTag(tagId ? (allTags?.find((tag) => tag.id === tagId) ?? null) : null);
    setIsSheetOpen(true);
  }

  return (
    <>
      <ListSection
        title="Tags"
        footer={
          taskTags.length === 0 ? (
            <span className="text-warning">Sem tag não dá para registar com um toque: adiciona uma.</span>
          ) : (
            "Toca numa tag para ver o URL a gravar ou mudar o que faz."
          )
        }
      >
        {taskTags.map((tag) => (
          <ListRow
            key={tag.id}
            onClick={() => openSheet(tag.id)}
            chevron
            icon={<Nfc className="size-[22px] text-primary" />}
            title={tag.label}
            trailing={
              <span className="rounded-full bg-accent px-2 py-0.5 text-[13px] font-medium text-accent-foreground">
                {formatTagAction(tag.action)}
              </span>
            }
          />
        ))}
        <ListRow
          onClick={() => openSheet(null)}
          chevron={false}
          icon={<Plus className="size-[22px] text-primary" />}
          title={<span className="text-primary">Adicionar tag</span>}
        />
      </ListSection>
      <TagSheet
        tag={openTag}
        tasks={tasks ?? [task]}
        defaultTaskId={task.id}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
      />
    </>
  );
}

/**
 * After creating a timer: offer a second "complete" tag (e.g. on the clothes
 * rack) that marks the cycle as handled.
 */
function SecondTagPrompt({ task, onClose }: { task: TaskDto | null; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [isCreating, setIsCreating] = useState(false);

  async function createCompleteTag() {
    if (!task) return;
    setIsCreating(true);
    try {
      await createTag({ label: "Estendal", taskId: task.id, action: "complete" });
      void mutate(API_PATHS.tags);
      toast.success("Tag criada", { description: "Abre-a em Tags para copiar o URL a gravar." });
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
      setIsCreating(false);
    }
  }

  return (
    <Drawer open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="bg-background">
        <div className="mx-auto w-full max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <DrawerHeader className="px-0">
            <div className="mb-2 flex justify-center">
              <TaskIcon kind="timer" size="lg" />
            </div>
            <DrawerTitle className="text-[20px] font-semibold">Tarefa criada</DrawerTitle>
            <DrawerDescription className="text-[15px]">
              Queres uma segunda tag para marcar como tratada? Cola-a no estendal: ao tocá-la, os lembretes param.
            </DrawerDescription>
          </DrawerHeader>
          <Button size="xl" className="mb-2 w-full" disabled={isCreating} onClick={createCompleteTag}>
            {isCreating ? <Loader2 className="animate-spin" /> : <Nfc />}
            Criar tag &quot;tratada&quot;
          </Button>
          <Button variant="ghost" size="xl" className="w-full text-primary" onClick={onClose}>
            Agora não
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Keeps the heads-up before the end on short timers (lowers it instead of failing). */
function fitAlmostDone(timer: FormState["timer"]): FormState["timer"] {
  if (!timer.almostDoneEnabled || timer.almostDoneMinutes < timer.durationMinutes) return timer;
  return { ...timer, almostDoneMinutes: Math.max(1, Math.floor(timer.durationMinutes / 2)) };
}

function TimerFields({ value, onChange }: { value: FormState["timer"]; onChange: (value: FormState["timer"]) => void }) {
  return (
    <>
      <ListSection title="Duração" footer="Quanto tempo dura o programa. A contagem começa quando tocas na tag.">
        <ListField label={<span className="tabular">{formatMinutes(value.durationMinutes)}</span>}>
          <Stepper
            label="duração"
            value={value.durationMinutes}
            min={5}
            max={24 * 60}
            step={5}
            onChange={(durationMinutes) => onChange(fitAlmostDone({ ...value, durationMinutes }))}
          />
        </ListField>
      </ListSection>
      <ListSection
        title="Antes de acabar"
        footer={value.almostDoneEnabled ? "Um aviso para te preparares." : "Sem aviso antes do fim."}
      >
        <ListField label="Avisar antes de acabar" htmlFor="timer-almost-done">
          <Switch
            id="timer-almost-done"
            checked={value.almostDoneEnabled}
            onCheckedChange={(almostDoneEnabled) => onChange({ ...value, almostDoneEnabled })}
          />
        </ListField>
        {value.almostDoneEnabled && (
          <ListField label="Minutos antes" htmlFor="timer-almost-done-minutes">
            <input
              id="timer-almost-done-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={value.durationMinutes - 1}
              value={Number.isFinite(value.almostDoneMinutes) ? value.almostDoneMinutes : ""}
              onChange={(event) => onChange({ ...value, almostDoneMinutes: Number.parseInt(event.target.value, 10) })}
              className={cn(PICKER_CLASS_NAME, "w-20 min-w-0")}
            />
            <span className="ml-2 text-[15px] text-muted-foreground">min</span>
          </ListField>
        )}
      </ListSection>
      <ListSection
        title="Quando acabar"
        footer={
          value.forgottenRemindersEnabled
            ? "Avisa quando acaba e volta a lembrar nestes intervalos até a tratares."
            : "Recebes só um aviso quando acabar."
        }
      >
        <ListField label="Lembrar se ficar esquecida" htmlFor="timer-forgotten">
          <Switch
            id="timer-forgotten"
            checked={value.forgottenRemindersEnabled}
            onCheckedChange={(forgottenRemindersEnabled) => onChange({ ...value, forgottenRemindersEnabled })}
          />
        </ListField>
        {value.forgottenRemindersEnabled && (
          <MinutesListEditor
            values={value.forgottenReminderMinutes}
            onChange={(forgottenReminderMinutes) => onChange({ ...value, forgottenReminderMinutes })}
            describe={(minutes) => (Number.isFinite(minutes) ? `${formatMinutes(minutes)} depois` : "Minutos depois")}
          />
        )}
      </ListSection>
    </>
  );
}

function UntilAckFields({
  value,
  today,
  onChange,
}: {
  value: FormState["untilAck"];
  today: string;
  onChange: (value: FormState["untilAck"]) => void;
}) {
  return (
    <>
      <ListSection title="Dias da semana" footer="Nestes dias, avisa até leres a tag.">
        <WeekdayPicker value={value.weekdays} onChange={(weekdays) => onChange({ ...value, weekdays })} />
      </ListSection>
      <ListSection title="Horas dos avisos" footer="Os avisos vão subindo de tom até leres a tag nesse dia.">
        <TimeListEditor values={value.reminderTimes} onChange={(reminderTimes) => onChange({ ...value, reminderTimes })} />
      </ListSection>
      <ListSection title="Datas extra" footer="Dias avulsos fora do padrão semanal.">
        <DateListEditor
          values={value.dates}
          today={today}
          addLabel="Adicionar data"
          onChange={(dates) => onChange({ ...value, dates })}
        />
      </ListSection>
      <ListSection title="Exceções" footer="Feriados ou dias sem recolha: não avisa nestas datas.">
        <DateListEditor
          values={value.exceptDates}
          today={today}
          addLabel="Adicionar exceção"
          onChange={(exceptDates) => onChange({ ...value, exceptDates })}
        />
      </ListSection>
    </>
  );
}

function RecurringFields({
  value,
  onChange,
}: {
  value: FormState["recurring"];
  onChange: (value: FormState["recurring"]) => void;
}) {
  return (
    <>
    <ListSection title="Repetir">
      <div className="p-2">
        <SegmentedControl
          label="Repetir"
          value={value.mode}
          options={REPEAT_OPTIONS}
          onChange={(mode) => onChange({ ...value, mode })}
        />
      </div>
    </ListSection>
    {value.mode === "weekdays" ? (
      <ListSection title="Dias" footer="Fica por fazer em cada um destes dias até leres a tag.">
        <WeekdayPicker value={value.weekdays} onChange={(weekdays) => onChange({ ...value, weekdays })} />
      </ListSection>
    ) : (
      <ListSection title="Frequência" footer="Conta a partir da última vez que leste a tag.">
        <ListField label={<span className="first-letter:uppercase">{formatEveryDays(value.everyDays)}</span>}>
          <Stepper
            label="intervalo em dias"
            value={value.everyDays}
            min={1}
            max={365}
            onChange={(everyDays) => onChange({ ...value, everyDays })}
          />
        </ListField>
      </ListSection>
    )}
    <ListSection>
      <ListField label="Hora do aviso" htmlFor="recurring-time">
        <input
          id="recurring-time"
          type="time"
          required
          value={value.reminderTime}
          onChange={(event) => onChange({ ...value, reminderTime: event.target.value })}
          className={PICKER_CLASS_NAME}
        />
      </ListField>
    </ListSection>
    </>
  );
}
