"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import type { TagAction, TagDto, TaskDto } from "@/shared";
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
import { API_PATHS, createTag, deleteTag, getErrorMessage, updateTag } from "@/lib/api";
import { CopyButton } from "./copy-button";
import { ListField, ListInput, ListSection } from "./grouped-list";
import { SegmentedControl } from "./segmented-control";

const ACTION_OPTIONS = [
  { value: "start", label: "Inicia" },
  { value: "complete", label: "Marca como tratada" },
] as const satisfies readonly { value: TagAction; label: string }[];

/** Short badge text for a tag's action. */
export function formatTagAction(action: TagAction) {
  return action === "complete" ? "tratada" : "inicia";
}

type TagSheetProps = {
  /** null = create a new tag. */
  tag: TagDto | null;
  tasks: TaskDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Bottom sheet to create or edit a tag (label, task, action), copy its URL, delete it. */
export function TagSheet({ tag, tasks, open, onOpenChange }: TagSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-background">
        {open && <TagForm key={tag?.id ?? "new"} tag={tag} tasks={tasks} onDone={() => onOpenChange(false)} />}
      </DrawerContent>
    </Drawer>
  );
}

function TagForm({ tag, tasks, onDone }: { tag: TagDto | null; tasks: TaskDto[]; onDone: () => void }) {
  const { mutate } = useSWRConfig();
  const [label, setLabel] = useState(tag?.label ?? "");
  const [taskId, setTaskId] = useState<string>(tag?.taskId ?? "");
  const [action, setAction] = useState<TagAction>(tag?.action ?? "start");
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const selectedTask = tasks.find((task) => task.id === taskId);
  const isTimer = selectedTask?.kind === "timer";

  function refreshTags() {
    void mutate(API_PATHS.tags);
  }

  async function submitTag(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setProblem("Dá um nome à tag (ex.: Máquina de lavar).");
      return;
    }
    setIsSaving(true);
    try {
      // Only timers distinguish start / complete; other kinds always "start".
      const input = { label: label.trim(), taskId: taskId || null, action: isTimer ? action : ("start" as const) };
      if (tag) {
        await updateTag(tag.id, input);
        toast.success("Tag guardada");
      } else {
        await createTag(input);
        toast.success("Tag criada", { description: "Toca nela para ver o URL a gravar." });
      }
      refreshTags();
      onDone();
    } catch (error) {
      setProblem(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTag() {
    if (!tag) return;
    try {
      await deleteTag(tag.id);
      toast.success("Tag apagada");
      refreshTags();
      onDone();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <DrawerHeader className="px-0">
        <DrawerTitle className="text-[20px] font-semibold">{tag ? "Editar tag" : "Nova tag"}</DrawerTitle>
        <DrawerDescription>
          {tag ? "Muda o nome, a tarefa ou o que a tag faz." : "Depois de criada, grava o URL dela numa tag NFC."}
        </DrawerDescription>
      </DrawerHeader>

      {tag && (
        <ListSection title="URL da tag" footer="Grava este URL na tag com a app NFC Tools (Escrever → Adicionar registo → URL).">
          <div className="flex items-center gap-3 py-2 pr-2 pl-4">
            <p className="min-w-0 flex-1 font-mono text-[14px] break-all select-all">{tag.url}</p>
            <CopyButton value={tag.url} />
          </div>
        </ListSection>
      )}

      <form onSubmit={submitTag} noValidate>
        <ListSection>
          <div className="pl-4">
            <ListInput
              aria-label="Nome da tag"
              placeholder="Nome (ex.: Estendal)"
              value={label}
              maxLength={80}
              onChange={(event) => {
                setLabel(event.target.value);
                setProblem(null);
              }}
              className="border-b border-separator pr-4"
            />
          </div>
          <ListField label="Tarefa" htmlFor="tag-task">
            <select
              id="tag-task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="h-11 max-w-[60%] appearance-none truncate bg-transparent text-right text-[17px] text-muted-foreground outline-none"
            >
              <option value="">Nenhuma</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </ListField>
        </ListSection>

        {isTimer && (
          <ListSection
            title="O que faz esta tag"
            footer={
              action === "start"
                ? "Ler a tag inicia a contagem do temporizador."
                : "Ler a tag marca o ciclo como tratado (ex.: roupa estendida) e pára os lembretes."
            }
          >
            <div className="p-2">
              <SegmentedControl label="O que faz esta tag" value={action} options={ACTION_OPTIONS} onChange={setAction} />
            </div>
          </ListSection>
        )}

        {problem && (
          <p role="alert" className="mb-5 rounded-xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
            {problem}
          </p>
        )}

        <Button type="submit" size="xl" className="mb-4 w-full" disabled={isSaving}>
          {isSaving && <Loader2 className="animate-spin" />}
          {tag ? "Guardar" : "Criar tag"}
        </Button>
      </form>

      {tag && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="xl" className="w-full text-destructive">
              <Trash2 /> Apagar tag
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar &quot;{tag.label}&quot;?</AlertDialogTitle>
              <AlertDialogDescription>A tag física deixa de funcionar até a gravares com um URL novo.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
              <AlertDialogAction size="touch" variant="destructive" onClick={removeTag}>
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
