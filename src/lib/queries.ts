"use client";

// SWR hooks over src/lib/api.ts. Data refreshes when the app returns to the
// foreground (e.g. after tapping an NFC tag and coming back).

import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import type { EventListDto } from "@/shared";
import {
  API_PATHS,
  getDashboard,
  getEventsPath,
  getGoogleStatus,
  getSettings,
  getTask,
  getTaskPath,
  listEvents,
  listTags,
  listTasks,
} from "./api";

const SWR_OPTIONS = { revalidateOnFocus: true, keepPreviousData: true } as const;

export function useDashboard() {
  return useSWR(API_PATHS.dashboard, getDashboard, { ...SWR_OPTIONS, refreshInterval: 60_000 });
}

export function useTasks() {
  return useSWR(API_PATHS.tasks, listTasks, SWR_OPTIONS);
}

export function useTask(id: string | null) {
  return useSWR(id ? getTaskPath(id) : null, () => getTask(id!), SWR_OPTIONS);
}

export function useTags() {
  return useSWR(API_PATHS.tags, listTags, SWR_OPTIONS);
}

export function useSettings() {
  return useSWR(API_PATHS.settings, getSettings, SWR_OPTIONS);
}

/** History pages, newest first, chained by `nextBeforeId`. */
export function useEventPages(pageSize: number) {
  return useSWRInfinite(
    (index: number, previous: EventListDto | null) => {
      if (index === 0) return getEventsPath(pageSize);
      if (!previous?.nextBeforeId) return null;
      return getEventsPath(pageSize, previous.nextBeforeId);
    },
    (path: string) => {
      const beforeId = new URL(path, "http://local").searchParams.get("beforeId");
      return listEvents(pageSize, beforeId);
    },
    { revalidateOnFocus: true },
  );
}

export function useGoogleStatus() {
  return useSWR(API_PATHS.googleStatus, getGoogleStatus, SWR_OPTIONS);
}
