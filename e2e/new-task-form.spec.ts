import { expect, test, type Page } from "@playwright/test";
import {
  createTagViaApi,
  createTaskViaApi,
  createUniqueName,
  deleteAllTasksAndTags,
  logInViaApi,
} from "./helpers";

function getAddTaskButton(page: Page) {
  return page.getByRole("link", { name: "Nova tarefa" });
}

function getAddTagButton(page: Page) {
  return page.getByRole("button", { name: "Nova tag" });
}

test.describe("formulário de nova tarefa e botões '+'", () => {
  test.beforeEach(async ({ page }) => {
    await logInViaApi(page.request);
  });

  test("temporizador com as tags 'Máquina · inicia' e 'Estendal' aparece com as duas", async ({ page }) => {
    const name = createUniqueName("Máquina de lavar");
    await page.goto("/tarefas/nova");

    // Timer is the default kind, with one default "Máquina" tag that starts it.
    await expect(page.getByRole("radio", { name: "Temporizador" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("textbox", { name: "Nome da tag" })).toHaveValue("Máquina");
    const machineAction = page.getByRole("radiogroup", { name: "O que faz a tag Máquina" });
    await expect(machineAction.getByRole("radio", { name: "Inicia" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Tag para marcar como tratada" }).click();
    await expect(page.getByRole("textbox", { name: "Nome da tag" })).toHaveCount(2);
    await expect(page.getByRole("textbox", { name: "Nome da tag" }).nth(1)).toHaveValue("Estendal");
    // Only one "complete" tag: the shortcut disappears.
    await expect(page.getByRole("button", { name: "Tag para marcar como tratada" })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Nome da tarefa" }).fill(name);
    await page.getByRole("button", { name: "Criar tarefa" }).click();
    await expect(page).toHaveURL(/\/tarefas\/[0-9a-f-]{36}$/);

    await expect(page.getByRole("button").filter({ hasText: "Máquina" })).toContainText("inicia");
    await expect(page.getByRole("button").filter({ hasText: "Estendal" })).toContainText("tratada");
  });

  test("o placeholder do nome muda com o tipo", async ({ page }) => {
    await page.goto("/tarefas/nova");
    const nameInput = page.getByRole("textbox", { name: "Nome da tarefa" });
    const kinds = page.getByRole("radiogroup", { name: "Tipo de tarefa" });

    await expect(nameInput).toHaveAttribute("placeholder", "ex.: Máquina de lavar");
    await kinds.getByRole("radio", { name: "Até confirmar" }).click();
    await expect(nameInput).toHaveAttribute("placeholder", "ex.: Pôr o lixo na rua");
    await kinds.getByRole("radio", { name: "Periódica" }).click();
    await expect(nameInput).toHaveAttribute("placeholder", "ex.: Regar as plantas");
    await kinds.getByRole("radio", { name: "Temporizador" }).click();
    await expect(nameInput).toHaveAttribute("placeholder", "ex.: Máquina de lavar");
  });

  test("/tarefas: sem tarefas não há '+', só 'Criar tarefa'; com uma tarefa aparece o '+'", async ({ page }) => {
    await deleteAllTasksAndTags(page.request);
    await page.goto("/tarefas");
    await expect(page.getByRole("link", { name: "Criar tarefa" })).toBeVisible();
    await expect(getAddTaskButton(page)).toHaveCount(0);

    await createTaskViaApi(page.request, { name: createUniqueName("Plantas"), kind: "recurring", config: { everyDays: 3 } });
    await page.reload();
    await expect(getAddTaskButton(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar tarefa" })).toHaveCount(0);
  });

  test("/tags: sem tags não há '+'; com uma tag aparece", async ({ page }) => {
    await deleteAllTasksAndTags(page.request);
    await page.goto("/tags");
    await expect(page.getByText("Sem tags")).toBeVisible();
    await expect(getAddTagButton(page)).toHaveCount(0);

    await createTagViaApi(page.request, { label: createUniqueName("Porta"), taskId: null });
    await page.reload();
    await expect(getAddTagButton(page)).toBeVisible();
  });
});
