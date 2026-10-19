// API client for the Toque server. Types come from the shared web contract
// (type-only imports, so nothing from ../src is bundled by Metro).

import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type {
  ApiError,
  CreateTagRequest,
  CreateTaskRequest,
  DashboardDto,
  EventListDto,
  GoogleStatusDto,
  SettingsDto,
  TagDto,
  TaskDto,
  UpdateTagRequest,
  UpdateTaskRequest,
} from "../../src/shared/api";
import type { UpdateSettingsRequest } from "../../src/shared/settings";

const TOKEN_KEY = "toque_session_token";

export function getApiUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    "https://toque-two.vercel.app";
  return url.replace(/\/+$/, "");
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      body?.error ?? `Erro ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export async function login(password: string): Promise<void> {
  const { token } = await request<{ ok: true; token: string }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ password }) },
  );
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const fetchTasks = () => request<TaskDto[]>("/api/tasks");
export const fetchTask = (id: string) => request<TaskDto>(`/api/tasks/${id}`);
export const createTask = (body: CreateTaskRequest) =>
  request<TaskDto>("/api/tasks", json("POST", body));
export const updateTask = (id: string, body: UpdateTaskRequest) =>
  request<TaskDto>(`/api/tasks/${id}`, json("PATCH", body));
export const deleteTask = (id: string) =>
  request<unknown>(`/api/tasks/${id}`, json("DELETE"));
export const markTaskDone = (id: string) =>
  request<unknown>(`/api/tasks/${id}/done`, json("POST"));
export const snoozeTask = (id: string) =>
  request<unknown>(`/api/tasks/${id}/snooze`, json("POST"));

export const fetchDashboard = () => request<DashboardDto>("/api/dashboard");

export const fetchTags = () => request<TagDto[]>("/api/tags");
export const createTag = (body: CreateTagRequest) =>
  request<TagDto>("/api/tags", json("POST", body));
export const updateTag = (id: string, body: UpdateTagRequest) =>
  request<TagDto>(`/api/tags/${id}`, json("PATCH", body));
export const deleteTag = (id: string) =>
  request<unknown>(`/api/tags/${id}`, json("DELETE"));

export const fetchEvents = (beforeId?: string) =>
  request<EventListDto>(
    `/api/events?limit=50${beforeId ? `&beforeId=${beforeId}` : ""}`,
  );

export const fetchSettings = () => request<SettingsDto>("/api/settings");
export const updateSettings = (body: UpdateSettingsRequest) =>
  request<SettingsDto>("/api/settings", json("PATCH", body));
export const fetchGoogleStatus = () =>
  request<GoogleStatusDto>("/api/google/status");

export async function logout(): Promise<void> {
  try {
    await request<unknown>("/api/auth/logout", json("POST"));
  } catch {
    // Leave anyway.
  }
  await clearToken();
}
