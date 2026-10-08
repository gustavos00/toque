"use client";

import { Minus, Plus } from "lucide-react";

type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
};

/** UIStepper: − / + pill. */
export function Stepper({ value, onChange, min, max, step = 1, label }: StepperProps) {
  const buttonClassName =
    "flex h-9 w-12 items-center justify-center text-foreground active:bg-muted-foreground/20 disabled:opacity-30";
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-[9px] bg-fill">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        className={buttonClassName}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus className="size-5" />
      </button>
      <span aria-hidden className="my-2 w-px bg-separator" />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        className={buttonClassName}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus className="size-5" />
      </button>
    </div>
  );
}
