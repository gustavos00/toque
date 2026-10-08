"use client";

import { RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/api";

/** Placeholder grouped list while data loads. */
export function ListSkeleton({ rows = 3, sections = 2 }: { rows?: number; sections?: number }) {
  return (
    <div aria-busy="true" aria-label="A carregar">
      {Array.from({ length: sections }, (_, section) => (
        <div key={section} className="mb-7">
          <Skeleton className="mb-2 ml-4 h-3 w-24 rounded-full bg-fill" />
          <div className="overflow-hidden rounded-xl bg-card">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-3 border-b border-separator px-4 py-3 last:border-b-0">
                <Skeleton className="size-[30px] rounded-[8px] bg-fill" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5 rounded-full bg-fill" />
                  <Skeleton className="h-3 w-3/5 rounded-full bg-fill" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Error card with a retry button. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="mb-7 flex flex-col items-center rounded-xl bg-card px-6 py-8 text-center">
      <WifiOff className="mb-3 size-8 text-muted-foreground" />
      <p className="text-[17px] font-semibold">Não foi possível carregar</p>
      <p className="mt-1 text-[15px] text-muted-foreground">{getErrorMessage(error)}</p>
      <Button variant="secondary" size="touch" className="mt-4 rounded-full" onClick={onRetry}>
        <RotateCw /> Tentar outra vez
      </Button>
    </div>
  );
}
