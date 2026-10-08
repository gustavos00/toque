"use client";

import { History, Loader2 } from "lucide-react";
import { getLocalDate, type EventDto } from "@/shared";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/format";
import { useEventPages } from "@/lib/queries";
import { EmptyState } from "./empty-state";
import { EventRow } from "./event-row";
import { ListSection } from "./grouped-list";
import { PageHeader } from "./page-header";
import { ListSkeleton, LoadError } from "./status";

const PAGE_SIZE = 50;

/** Groups events (newest first) by local day. */
function groupEventsByDay(events: EventDto[]) {
  const groups: { day: string; events: EventDto[] }[] = [];
  for (const event of events) {
    const day = getLocalDate(new Date(event.at));
    const last = groups.at(-1);
    if (last?.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

export function HistoryView() {
  const { data, error, isLoading, isValidating, size, setSize, mutate } = useEventPages(PAGE_SIZE);
  const events = data?.flatMap((page) => page.events) ?? [];
  const hasMore = Boolean(data?.at(-1)?.nextBeforeId);
  const isLoadingMore = isValidating && data !== undefined && data.length < size;

  return (
    <>
      <PageHeader title="Histórico" back={{ href: "/", label: "Painel" }} />
      {isLoading && !data && <ListSkeleton rows={5} />}
      {error && !data && <LoadError error={error} onRetry={() => mutate()} />}
      {data && events.length === 0 && (
        <div className="rounded-2xl bg-card">
          <EmptyState icon={History} title="Sem registos" description="Cada leitura de tag e cada aviso aparecem aqui." />
        </div>
      )}
      {groupEventsByDay(events).map((group) => {
        const label = formatDay(group.events[0].at);
        return (
          <ListSection key={group.day} title={label}>
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ListSection>
        );
      })}
      {hasMore && (
        <div className="flex justify-center pb-6">
          <Button variant="secondary" size="touch" className="rounded-full" disabled={isLoadingMore} onClick={() => setSize(size + 1)}>
            {isLoadingMore && <Loader2 className="animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </>
  );
}
