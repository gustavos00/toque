"use client";

import { useEffect, useState } from "react";

/**
 * The current time, re-rendered every `intervalMs`. Null until mounted, so
 * server and first client render match.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
