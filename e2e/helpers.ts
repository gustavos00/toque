import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { CreateTagRequest, CreateTaskRequest, TagDto, TaskDto } from "../src/shared/api";
import { getIsoWeekday, getLocalDate } from "../src/shared/time";
import { E2E_PASSWORD } from "./env";

/** Logs in through the API; the session cookie lands in the page's context. */
export async function logInViaApi(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { data: { password: E2E_PASSWORD } });
  expect(response.ok(), `login falhou: ${response.status()}`).toBeTruthy();
}

/** Logs in through the login form, as the user would. */
export async function logInViaForm(page: Page, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Palavra-passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

export async function createTaskViaApi(request: APIRequestContext, body: CreateTaskRequest) {
  const response = await request.post("/api/tasks", { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
  return unwrapItem<TaskDto>(await response.json(), "task");
}

export async function createTagViaApi(request: APIRequestContext, body: CreateTagRequest) {
  const response = await request.post("/api/tags", { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
  return unwrapItem<TagDto>(await response.json(), "tag");
}

/** Path part of a tag URL ("/t/<token>"), so it works whatever host built it. */
export function getTagPath(tag: TagDto) {
  return `/t/${tag.token}`;
}

/** Today's ISO weekday in Europe/Lisbon (1 = Monday … 7 = Sunday). */
export function getTodayIsoWeekday() {
  return getIsoWeekday(getLocalDate(new Date()));
}

/** A name that won't collide with other specs sharing the in-memory DB. */
export function createUniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}`;
}

/** Item routes may answer with the item or with `{ <key>: item }`. */
function unwrapItem<T>(body: unknown, key: string): T {
  const record = body as Record<string, unknown> | null;
  if (record && key in record && typeof record[key] === "object") return record[key] as T;
  return body as T;
}

/** Deletes every tag and task, for specs that need empty lists (single worker). */
export async function deleteAllTasksAndTags(request: APIRequestContext) {
  const tags = unwrapList<TagDto>(await (await request.get("/api/tags")).json(), "tags");
  for (const tag of tags) expect((await request.delete(`/api/tags/${tag.id}`)).ok()).toBeTruthy();
  const tasks = unwrapList<TaskDto>(await (await request.get("/api/tasks")).json(), "tasks");
  for (const task of tasks) expect((await request.delete(`/api/tasks/${task.id}`)).ok()).toBeTruthy();
}

/** List routes may answer with a bare array or with `{ <key>: [...] }`. */
function unwrapList<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  const value = (body as Record<string, unknown> | null)?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}
