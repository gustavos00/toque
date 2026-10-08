import { expect, test } from "@playwright/test";
import { logInViaForm } from "./helpers";

test.describe("login", () => {
  test("sem sessão, o painel redireciona para o login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("palavra-passe errada mostra erro e não entra", async ({ page }) => {
    await logInViaForm(page, "isto-nao-e-a-palavra-passe");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Palavra-passe errada.")).toBeVisible();
  });

  test("palavra-passe certa abre o painel", async ({ page }) => {
    await logInViaForm(page);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Painel", level: 1 })).toBeVisible();
  });

  test("as APIs exigem sessão", async ({ request }) => {
    const response = await request.get("/api/tasks");
    expect(response.status()).toBe(401);
  });
});

