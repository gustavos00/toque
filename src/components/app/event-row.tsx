import { BellOff, BellRing, CircleCheck, CirclePlay, CircleStop, Clock, Nfc, Pencil, type LucideIcon } from "lucide-react";
import type { EventDto } from "@/shared";
import { formatDayTime, formatEventSubject, formatEventType, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Partial<Record<EventDto["type"], { icon: LucideIcon; className: string }>> = {
  scan: { icon: Nfc, className: "text-primary" },
  timer_started: { icon: CirclePlay, className: "text-kind-timer" },
  timer_finished: { icon: Clock, className: "text-warning" },
  timer_cancelled: { icon: CircleStop, className: "text-muted-foreground" },
  acked: { icon: CircleCheck, className: "text-success" },
  done: { icon: CircleCheck, className: "text-success" },
  snoozed: { icon: Clock, className: "text-muted-foreground" },
  notification_sent: { icon: BellRing, className: "text-muted-foreground" },
  notification_failed: { icon: BellOff, className: "text-destructive" },
};

/** One history entry: icon, "Lixo · Feito", time. */
export function EventRow({ event, showDay = false }: { event: EventDto; showDay?: boolean }) {
  const { icon: Icon, className } = EVENT_ICONS[event.type] ?? { icon: Pencil, className: "text-muted-foreground" };
  return (
    <div className="group/row flex items-center gap-3 pl-4">
      <Icon aria-hidden className={cn("size-[22px] shrink-0", className)} />
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 border-b border-separator py-2 pr-4 group-last/row:border-b-0">
        <p className="min-w-0 flex-1 truncate text-[16px]">
          <span className="font-medium">{formatEventSubject(event)}</span>
          <span className="text-muted-foreground"> · {formatEventType(event)}</span>
        </p>
        <time dateTime={event.at} className="shrink-0 text-[15px] text-muted-foreground tabular">
          {showDay ? formatDayTime(event.at) : formatTime(event.at)}
        </time>
      </div>
    </div>
  );
}
