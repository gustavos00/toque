"use client";

import { formatWeekdaySummary, WEEKDAYS } from "@/lib/weekdays";
import { cn } from "@/lib/utils";

/** Row of 7 round day chips (Monday first) with a summary line underneath. */
export function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (weekdays: number[]) => void }) {
  function toggleDay(day: number) {
    onChange(value.includes(day) ? value.filter((other) => other !== day) : [...value, day].sort());
  }

  return (
    <div className="p-3">
      <div role="group" aria-label="Dias da semana" className="flex justify-between gap-1.5">
        {WEEKDAYS.map(({ day, short, name }) => {
          const isOn = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isOn}
              aria-label={name}
              onClick={() => toggleDay(day)}
              className={cn(
                "flex size-11 items-center justify-center rounded-full text-[15px] font-semibold transition-colors",
                isOn ? "bg-primary text-primary-foreground" : "bg-fill text-foreground",
              )}
            >
              {short}
            </button>
          );
        })}
      </div>
      <p className={cn("mt-2.5 text-center text-[15px]", value.length === 0 ? "text-destructive" : "text-muted-foreground")}>
        {formatWeekdaySummary(value)}
      </p>
    </div>
  );
}
