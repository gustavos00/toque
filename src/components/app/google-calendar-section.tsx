"use client";

import { CalendarDays, Loader2, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { GoogleStatusDto } from "@/shared";
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
import { disconnectGoogle, getErrorMessage, GOOGLE_CONNECT_PATH, resyncGoogle } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useGoogleStatus } from "@/lib/queries";
import { ListRow, ListSection } from "./grouped-list";

const SECTION_TITLE = "Google Calendar";
const EXPLANATION = "As tuas tarefas aparecem num calendário “Toque” no Google Calendar, sem avisos.";

/**
 * Reads `?google=ok|erro|config` once (set by the OAuth callback), shows the
 * outcome and removes it from the URL. Returns true for "config".
 */
function useGoogleReturnParam(onReturn: () => void) {
  const [isMissingConfig, setIsMissingConfig] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("google");
    if (!outcome) return;
    if (outcome === "ok") toast.success("Google Calendar ligado");
    else if (outcome === "erro") toast.error("Não foi possível ligar ao Google. Tenta outra vez.");
    else if (outcome === "config") setTimeout(() => setIsMissingConfig(true), 0);
    params.delete("google");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    onReturn();
  }, [onReturn]);

  return isMissingConfig;
}

/** Full-page navigation: the server redirects to Google's consent screen. */
function navigateToGoogle() {
  window.location.assign(GOOGLE_CONNECT_PATH);
}

export function GoogleCalendarSection() {
  const { data: status, error, isLoading, mutate } = useGoogleStatus();
  const revalidate = useCallback(() => void mutate(), [mutate]);
  const isMissingConfigParam = useGoogleReturnParam(revalidate);
  const [busyAction, setBusyAction] = useState<"resync" | "disconnect" | null>(null);

  async function runAction(action: "resync" | "disconnect") {
    setBusyAction(action);
    try {
      const next = action === "resync" ? await resyncGoogle() : await disconnectGoogle();
      await mutate(next, { revalidate: false });
      toast.success(action === "resync" ? "Calendário sincronizado" : "Google Calendar desligado");
    } catch (actionError) {
      toast.error(getErrorMessage(actionError));
      void mutate();
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading && !status) {
    return (
      <ListSection title={SECTION_TITLE}>
        <p className="px-4 py-3 text-[15px] text-muted-foreground">A carregar…</p>
      </ListSection>
    );
  }
  if (error && !status) {
    return (
      <ListSection title={SECTION_TITLE}>
        <p className="px-4 py-3 text-[15px] text-muted-foreground">{getErrorMessage(error)}</p>
      </ListSection>
    );
  }
  if (!status) return null;

  if (isMissingConfigParam || !status.configured) {
    return (
      <ListSection title={SECTION_TITLE} footer={EXPLANATION}>
        <WarningRow message="Falta configurar o Google no servidor" hint="Ver docs/google-calendar.md" />
      </ListSection>
    );
  }

  if (!status.connected) {
    return (
      <ListSection title={SECTION_TITLE} footer={status.lastError ? undefined : EXPLANATION}>
        {status.lastError && <WarningRow message={status.lastError} hint={status.email ? `Conta: ${status.email}` : undefined} />}
        <div className="p-3">
          <Button size="xl" className="w-full" onClick={navigateToGoogle}>
            <CalendarDays /> {status.lastError ? "Ligar outra vez" : "Ligar ao Google"}
          </Button>
        </div>
      </ListSection>
    );
  }

  return <ConnectedRows status={status} busyAction={busyAction} onAction={runAction} />;
}

function WarningRow({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-separator px-4 py-3 last:border-b-0">
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-[16px] font-medium text-warning">{message}</p>
        {hint && <p className="text-[14px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function ConnectedRows({
  status,
  busyAction,
  onAction,
}: {
  status: GoogleStatusDto;
  busyAction: "resync" | "disconnect" | null;
  onAction: (action: "resync" | "disconnect") => void;
}) {
  return (
    <ListSection title={SECTION_TITLE} footer={EXPLANATION}>
      {status.lastError && (
        <>
          <WarningRow message={status.lastError} />
          <ListRow onClick={navigateToGoogle} chevron={false} title={<span className="text-primary">Ligar outra vez</span>} />
        </>
      )}
      <ListRow title="Conta" trailing={<span className="max-w-48 truncate text-[15px]">{status.email ?? "—"}</span>} />
      <ListRow title="Calendário" trailing={status.calendarName ?? "a criar…"} />
      <ListRow
        title="Última sincronização"
        trailing={<span className="text-[15px]">{status.lastSyncAt ? formatRelative(status.lastSyncAt) : "ainda não"}</span>}
      />
      <ListRow
        onClick={() => onAction("resync")}
        chevron={false}
        icon={busyAction === "resync" ? <Loader2 className="size-5 animate-spin text-primary" /> : <RefreshCw className="size-5 text-primary" />}
        title={<span className="text-primary">Sincronizar agora</span>}
      />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={busyAction !== null}
            className="pressable flex min-h-11 w-full items-center gap-3 pl-4 text-left text-[17px] text-destructive"
          >
            {busyAction === "disconnect" ? <Loader2 className="size-5 animate-spin" /> : <Unplug className="size-5" />}
            Desligar
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar o Google Calendar?</AlertDialogTitle>
            <AlertDialogDescription>
              O calendário “Toque” é apagado da tua conta Google. Podes voltar a ligar quando quiseres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="touch">Cancelar</AlertDialogCancel>
            <AlertDialogAction size="touch" variant="destructive" onClick={() => onAction("disconnect")}>
              Desligar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ListSection>
  );
}
