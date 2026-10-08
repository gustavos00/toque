import { expect, test, type APIRequestContext } from "@playwright/test";
import { createTagViaApi, createTaskViaApi, createUniqueName, getTagPath, logInViaApi } from "./helpers";

async function createTimerWithTag(request: APIRequestContext) {
  await logInViaApi(request);
  const name = createUniqueName("Máquina");
  const task = await createTaskViaApi(request, { name, kind: "timer", config: { durationMinutes: 90 } });
  const tag = await createTagViaApi(request, { label: `Tag ${name}`, taskId: task.id });
  return { name, task, tag };
}

test.describe("tarefa temporizador (máquina da roupa)", () => {
  test("tocar na tag, sem sessão, inicia o temporizador e confirma em português", async ({ page, browser }) => {
    const { name, tag } = await createTimerWithTag(page.request);
    expect(tag.url).toMatch(new RegExp(`/t/${tag.token}$`));

    // The tag is opened from a phone with no session: the token is the credential.
    const anonymous = await browser.newContext();
    const tagPage = await anonymous.newPage();
    const response = await tagPage.goto(getTagPath(tag));
    expect(response?.status()).toBe(200);
    await expect(tagPage).not.toHaveURL(/\/login/);
    await expect(tagPage.locator("html")).toHaveAttribute("lang", "pt-PT");
    await expect(tagPage.getByRole("heading", { name })).toBeVisible();
    await expect(tagPage.getByText(/acaba às \d{2}:\d{2}/)).toBeVisible();
    await anonymous.close();
  });

  test("o painel mostra o temporizador a decorrer", async ({ page }) => {
    const { name, tag } = await createTimerWithTag(page.request);
    await page.request.get(getTagPath(tag));

    await page.goto("/");
    const card = page.getByRole("link", { name: new RegExp(`^${name}: faltam .+, acaba às \\d{2}:\\d{2}$`, "i") });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/acaba às \d{2}:\d{2}/);
  });

  test("token desconhecido mostra uma página em português", async ({ page }) => {
    const response = await page.goto("/t/token-que-nao-existe-0000");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Etiqueta desconhecida" })).toBeVisible();
  });
});
