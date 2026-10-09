import { expect, test, type APIRequestContext } from "@playwright/test";
import type { DashboardDto } from "../../src/shared/api";
import { DEMO_PASSWORD } from "../../src/shared/demo";
import { createTagViaApi, createTaskViaApi, createUniqueName, getTagPath } from "../helpers";

const DEMO_BLOCKED = { error: "Indisponível na demonstração" };

async function logInAsDemo(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { data: { password: DEMO_PASSWORD } });
  expect(response.ok(), `login demo falhou: ${response.status()}`).toBeTruthy();
}

function getRedirectPath(location: string | undefined) {
  const url = new URL(location ?? "", "http://irrelevante");
  return `${url.pathname}${url.search}`;
}

test.describe("demonstração pública", () => {
  test.describe("login", () => {
    test("a palavra-passe 'demo' vem preenchida e visível, e Entrar funciona", async ({ page }) => {
      await page.goto("/login");
      const password = page.getByLabel("Palavra-passe", { exact: true });
      await expect(password).toHaveValue(DEMO_PASSWORD);
      await expect(password).toHaveAttribute("type", "text");
      await expect(page.getByText("Versão de demonstração: a palavra-passe já está preenchida.")).toBeVisible();

      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Painel", level: 1 })).toBeVisible();
      await expect(page.getByRole("note").filter({ hasText: /^Demonstração$/ }).first()).toBeVisible();
    });

    test("a TOQUE_PASSWORD do servidor é ignorada", async ({ request }) => {
      const response = await request.post("/api/auth/login", { data: { password: "nao-e-esta-na-demo" } });
      expect(response.status()).toBe(401);
    });

    test("o aviso de demonstração diz que os dados se apagam a cada 5 minutos", async ({ page }) => {
      await logInAsDemo(page.request);
      await page.goto("/");
      await expect(
        page.getByText(/^Os dados são apagados a cada 5 minutos · próxima limpeza daqui a \d+ min$/).first(),
      ).toBeVisible();
    });
  });

  test("/api/app-info é público e indica a próxima limpeza (≤ 5 minutos)", async ({ request }) => {
    const response = await request.get("/api/app-info");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { demo: boolean; demoResetAt: string | null };
    expect(body.demo).toBe(true);
    const resetIn = new Date(body.demoResetAt ?? "").getTime() - Date.now();
    expect(resetIn).toBeGreaterThan(0);
    expect(resetIn).toBeLessThanOrEqual(5 * 60_000 + 5_000);
  });

  test.describe("ntfy e Google bloqueados", () => {
    test.beforeEach(async ({ page }) => {
      await logInAsDemo(page.request);
    });

    test("nas Definições o tópico e 'Ligar ao Google' estão visíveis mas desativados", async ({ page }) => {
      await page.goto("/definicoes");
      await expect(page.getByLabel("Tópico")).toBeDisabled();
      const connect = page.getByRole("button", { name: "Ligar ao Google" });
      await expect(connect).toBeVisible();
      await expect(connect).toBeDisabled();
      // Footer of both the ntfy and the Google sections.
      await expect(page.getByText("Indisponível na demonstração")).toHaveCount(2);
    });

    test("?google=demo mostra o aviso 'Indisponível na demonstração'", async ({ page }) => {
      await page.goto("/definicoes?google=demo");
      await expect(page.getByRole("status").or(page.locator("[data-sonner-toast]")).filter({
        hasText: "Indisponível na demonstração",
      }).first()).toBeVisible();
    });

    test("o estado do Google indica demonstração e não ligado", async ({ page }) => {
      const response = await page.request.get("/api/google/status");
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expect.objectContaining({ demo: true, connected: false, demoResetAt: expect.any(String) }));
    });

    test("PATCH às definições com ntfy responde 403", async ({ page }) => {
      const response = await page.request.patch("/api/settings", {
        data: { ntfy: { topic: "toque-demo-teste-1234567890" } },
      });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual(expect.objectContaining(DEMO_BLOCKED));
    });

    test("PATCH às definições sem ntfy continua a funcionar", async ({ page }) => {
      const response = await page.request.patch("/api/settings", {
        data: { quietHours: { enabled: false } },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    });

    for (const path of ["/api/google/connect", "/api/google/callback?state=x&code=y"]) {
      test(`${path.split("?")[0]} volta às Definições com google=demo`, async ({ page }) => {
        const response = await page.request.get(path, { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(getRedirectPath(response.headers()["location"])).toBe("/definicoes?google=demo");
      });
    }

    for (const path of ["/api/google/resync", "/api/google/disconnect"]) {
      test(`POST ${path} responde 403`, async ({ page }) => {
        const response = await page.request.post(path);
        expect(response.status()).toBe(403);
        expect(await response.json()).toEqual(expect.objectContaining(DEMO_BLOCKED));
      });
    }
  });

  test.describe("tarefas e tags funcionam", () => {
    test("criar tarefa e tag, tocar em /t/<token> e ver no painel", async ({ page, browser }) => {
      await logInAsDemo(page.request);
      const name = createUniqueName("Máquina demo");
      const task = await createTaskViaApi(page.request, {
        name,
        kind: "timer",
        config: { durationMinutes: 45 },
      });
      const tag = await createTagViaApi(page.request, { label: `Tag ${name}`, taskId: task.id, action: "start" });

      const anonymous = await browser.newContext();
      const tagPage = await anonymous.newPage();
      const response = await tagPage.goto(getTagPath(tag));
      expect(response?.status()).toBe(200);
      await expect(tagPage.getByRole("heading", { name })).toBeVisible();
      await expect(tagPage.getByText(/acaba às \d{2}:\d{2}/)).toBeVisible();
      await anonymous.close();

      const dashboard = (await (await page.request.get("/api/dashboard")).json()) as DashboardDto;
      expect(dashboard.timers).toContainEqual(
        expect.objectContaining({ phase: "running", task: expect.objectContaining({ id: task.id }) }),
      );

      await page.goto("/tarefas");
      await expect(page.getByRole("link").filter({ hasText: name }).first()).toContainText(/· inicia/);
    });
  });
});
