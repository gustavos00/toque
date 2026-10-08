// The PWA's single typed client for /api/*. Types come from the shared
// contract (src/shared); this file only knows URLs and response envelopes.

import type {
  ApiError,
  CreateTagRequest,
  CreateTaskRequest,
  DashboardDto,
  EventListDto,
  ScanResult,
  SettingsDto,
  TagDto,
  TaskDto,
  UpdateSettingsRequest,
  UpdateTagRequest,
  UpdateTaskRequest,
} from "@/shared";
import { getMockResponse, isMockedPath } from "./mock-api";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly issues: unknown;

  constructor(status: number, body: Partial<ApiError> | null) {
    super(body?.error ?? `Erro ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.issues = body?.issues;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockedPath(path)) return getMockResponse<T>(path, init);

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    redirectToLogin();
  }

  const body = response.status === 204 ? null : await readJsonSafely(response);
  if (!response.ok) throw new ApiRequestError(response.status, body as Partial<ApiError> | null);
  return body as T;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = encodeURIComponent(window.location.pathname);
  // Full page load on purpose: this runs outside React and the proxy must re-check the cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${next}`);
}

/** List routes may answer with a bare array or with `{ <key>: [...] }`. */
function unwrapList<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  const value = (body as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Item routes may answer with the item or with `{ <key>: item }`. */
function unwrapItem<T>(body: unknown, key: string): T {
  const record = body as Record<string, unknown> | null;
  if (record && key in record && typeof record[key] === "object") return record[key] as T;
  return body as T;
}

function sendJson(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

export const API_PATHS = {
  dashboard: "/api/dashboard",
  tasks: "/api/tasks",
  tags: "/api/tags",
  settings: "/api/settings",
  events: "/api/events",
} as const;

export function getTaskPath(id: string) {
  return `${API_PATHS.tasks}/${encodeURIComponent(id)}`;
}

function getTagPath(id: string) {
  return `${API_PATHS.tags}/${encodeURIComponent(id)}`;
}

export function getEventsPath(limit: number, beforeId?: string | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set("beforeId", beforeId);
  return `${API_PATHS.events}?${params}`;
}

// ---------- Auth ----------

/** Resolves on `{ ok: true }`; throws ApiRequestError (401) on a wrong password. */
export async function login(password: string) {
  await requestJson<{ ok: true }>("/api/auth/login", sendJson("POST", { password }));
}

/** 204, no body (requestJson skips parsing on 204). */
export async function logout() {
  await requestJson<unknown>("/api/auth/logout", sendJson("POST"));
}

// ---------- Dashboard ----------

export function getDashboard() {
  return requestJson<DashboardDto>(API_PATHS.dashboard);
}

// ---------- Tasks ----------

export async function listTasks() {
  return unwrapList<TaskDto>(await requestJson<unknown>(API_PATHS.tasks), "tasks");
}

export async function getTask(id: string) {
  return unwrapItem<TaskDto>(await requestJson<unknown>(getTaskPath(id)), "task");
}

export async function createTask(input: CreateTaskRequest) {
  return unwrapItem<TaskDto>(await requestJson<unknown>(API_PATHS.tasks, sendJson("POST", input)), "task");
}

export async function updateTask(id: string, input: UpdateTaskRequest) {
  return unwrapItem<TaskDto>(await requestJson<unknown>(getTaskPath(id), sendJson("PATCH", input)), "task");
}

export async function deleteTask(id: string) {
  await requestJson<unknown>(getTaskPath(id), sendJson("DELETE"));
}

/** "Adiar": postpones the next reminder by the snooze length in settings. */
export function snoozeTask(id: string) {
  return requestJson<ScanResult>(`${getTaskPath(id)}/snooze`, sendJson("POST"));
}

/** "Já tratei" without scanning the tag. */
export function markTaskDone(id: string) {
  return requestJson<ScanResult>(`${getTaskPath(id)}/done`, sendJson("POST"));
}

// ---------- Tags ----------

export async function listTags() {
  return unwrapList<TagDto>(await requestJson<unknown>(API_PATHS.tags), "tags");
}

export async function createTag(input: CreateTagRequest) {
  return unwrapItem<TagDto>(await requestJson<unknown>(API_PATHS.tags, sendJson("POST", input)), "tag");
}

export async function updateTag(id: string, input: UpdateTagRequest) {
  return unwrapItem<TagDto>(await requestJson<unknown>(getTagPath(id), sendJson("PATCH", input)), "tag");
}

export async function deleteTag(id: string) {
  await requestJson<unknown>(getTagPath(id), sendJson("DELETE"));
}

// ---------- Events ----------

/** Newest first; pass the previous page's `nextBeforeId` to get older events. */
export function listEvents(limit = 50, beforeId?: string | null) {
  return requestJson<EventListDto>(getEventsPath(limit, beforeId));
}

// ---------- Settings ----------

export async function getSettings() {
  return unwrapItem<SettingsDto>(await requestJson<unknown>(API_PATHS.settings), "settings");
}

export async function updateSettings(input: UpdateSettingsRequest) {
  return unwrapItem<SettingsDto>(
    await requestJson<unknown>(API_PATHS.settings, sendJson("PATCH", input)),
    "settings",
  );
}

/** A readable message for a failed request, in Portuguese. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Sessão expirada. Entra outra vez.";
    if (error.status >= 500) return "O servidor falhou. Tenta outra vez daqui a pouco.";
    return error.message;
  }
  if (error instanceof TypeError) return "Sem ligação. Verifica a internet.";
  return "Algo correu mal.";
}
