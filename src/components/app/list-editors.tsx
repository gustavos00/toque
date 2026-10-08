"use client";

import { CirclePlus, CircleMinus } from "lucide-react";
import { formatLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Native picker styled as the grey value pill iOS uses in forms. */
export const PICKER_CLASS_NAME =
  "h-9 min-w-[5.5rem] appearance-none rounded-[8px] bg-fill px-3 text-center text-[17px] tabular text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

type RowListProps<T> = {
  values: T[];
  onChange: (values: T[]) => void;
  renderValue: (value: T, index: number, update: (next: T) => void) => React.ReactNode;
  createValue: () => T;
  addLabel: string;
  getItemLabel: (value: T) => string;
  minItems?: number;
  maxItems?: number;
};

/** Editable list in iOS edit style: red minus to remove, green plus to add. */
function RowList<T>({
  values,
  onChange,
  renderValue,
  createValue,
  addLabel,
  getItemLabel,
  minItems = 0,
  maxItems = 24,
}: RowListProps<T>) {
  const canRemove = values.length > minItems;
  return (
    <>
      {values.map((value, index) => (
        <div key={index} className="group/row flex items-center pl-2">
          <button
            type="button"
            aria-label={`Remover ${getItemLabel(value)}`}
            disabled={!canRemove}
            onClick={() => onChange(values.filter((_, other) => other !== index))}
            className="flex size-11 shrink-0 items-center justify-center text-destructive disabled:opacity-30"
          >
            <CircleMinus className="size-[22px] fill-destructive text-white dark:text-card" />
          </button>
          <div className="flex min-h-12 flex-1 items-center border-b border-separator py-1.5 pr-4">
            {renderValue(value, index, (next) => onChange(values.map((old, other) => (other === index ? next : old))))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={values.length >= maxItems}
        onClick={() => onChange([...values, createValue()])}
        className="pressable flex w-full items-center pl-2 text-left text-primary disabled:opacity-40"
      >
        <span className="flex size-11 shrink-0 items-center justify-center">
          <CirclePlus className="size-[22px] fill-success text-white dark:text-card" />
        </span>
        <span className="min-h-12 flex-1 content-center text-[17px]">{addLabel}</span>
      </button>
    </>
  );
}

function getNextTime(times: string[]) {
  const last = [...times].sort().at(-1);
  if (!last) return "08:00";
  const [hour, minute] = last.split(":").map(Number);
  const next = Math.min(hour + 1, 23);
  return `${String(next).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** List of "HH:MM" times (alert schedule). */
export function TimeListEditor({
  values,
  onChange,
  minItems = 1,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  minItems?: number;
}) {
  return (
    <RowList
      values={values}
      onChange={onChange}
      minItems={minItems}
      createValue={() => getNextTime(values)}
      addLabel="Adicionar hora"
      getItemLabel={(value) => `hora ${value}`}
      renderValue={(value, index, update) => (
        <div className="flex flex-1 items-center justify-between gap-3">
          <span className="text-[17px] text-muted-foreground">{index + 1}.º aviso</span>
          <input
            type="time"
            required
            aria-label={`Hora do ${index + 1}.º aviso`}
            value={value}
            onChange={(event) => update(event.target.value)}
            className={PICKER_CLASS_NAME}
          />
        </div>
      )}
    />
  );
}

/** List of "YYYY-MM-DD" local dates. */
export function DateListEditor({
  values,
  onChange,
  addLabel,
  today,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  addLabel: string;
  today: string;
}) {
  return (
    <RowList
      values={values}
      onChange={onChange}
      createValue={() => today}
      addLabel={addLabel}
      getItemLabel={(value) => `data ${value}`}
      renderValue={(value, _index, update) => (
        <div className="flex flex-1 items-center justify-between gap-3">
          <span className={cn("truncate text-[17px]", !value && "text-muted-foreground")}>
            {value ? formatLocalDate(value) : "Escolhe a data"}
          </span>
          <input
            type="date"
            required
            aria-label="Data"
            value={value}
            onChange={(event) => update(event.target.value)}
            className={cn(PICKER_CLASS_NAME, "min-w-[8.5rem]")}
          />
        </div>
      )}
    />
  );
}

/** List of minute offsets (e.g. "forgotten" reminders after a timer ends). */
export function MinutesListEditor({
  values,
  onChange,
  describe,
}: {
  values: number[];
  onChange: (values: number[]) => void;
  describe: (minutes: number) => string;
}) {
  return (
    <RowList
      values={values}
      onChange={onChange}
      maxItems={12}
      createValue={() => (values.length ? Math.min(Math.max(...values) * 2, 1440) : 15)}
      addLabel="Adicionar lembrete"
      getItemLabel={(value) => `${value} minutos`}
      renderValue={(value, _index, update) => (
        <div className="flex flex-1 items-center justify-between gap-3">
          <span className="truncate text-[17px] text-muted-foreground">{describe(value)}</span>
          <label className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              required
              aria-label="Minutos"
              value={Number.isFinite(value) ? value : ""}
              onChange={(event) => update(Number.parseInt(event.target.value, 10))}
              className={cn(PICKER_CLASS_NAME, "w-20 min-w-0")}
            />
            <span className="text-[15px] text-muted-foreground">min</span>
          </label>
        </div>
      )}
    />
  );
}
