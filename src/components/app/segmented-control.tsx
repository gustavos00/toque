"use client";

import { cn } from "@/lib/utils";

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
};

/** UISegmentedControl look-alike, built on a radio group. */
export function SegmentedControl<T extends string>({ value, options, onChange, label }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[10px] bg-fill p-0.5">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 flex-1 rounded-[8px] px-2 text-[14px] font-medium transition-all",
              isSelected ? "bg-card shadow-[0_1px_4px_rgb(0_0_0/0.12)] dark:bg-muted-foreground/40" : "text-foreground/80",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
