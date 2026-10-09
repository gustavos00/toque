import { expect, test } from "@playwright/test";
import type { TaskDto } from "../src/shared/api";
import { createTagViaApi, createTaskViaApi, createUniqueName, logInViaApi } from "./helpers";

test.describe("tags ligadas a cada tarefa", () => {
  test("a lista de tarefas e o detalhe mostram as tags e o que fazem", async ({ page }) => {
    await logInViaApi(page.request);
    const name = createUniqueName("Roupa");
    const task = await createTaskViaApi(page.request, {
      name,
      kind: "timer",
      config: { durationMinutes: 90 },
    });
    const machineLabel = `Máquina ${name}`;
    const rackLabel = `Estendal ${name}`;
    await createTagViaApi(page.request, { label: machineLabel, taskId: task.id, action: "start" });
    await createTagViaApi(page.request, { label: rackLabel, taskId: task.id, action: "complete" });

    const listed = (await (await page.request.get("/api/tasks")).json()) as TaskDto[] | { tasks: TaskDto[] };
    const tasks = Array.isArray(listed) ? listed : listed.tasks;
    expect(tasks.find((item) => item.id === task.id)?.tags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: machineLabel, action: "start" }),
        expect.objectContaining({ label: rackLabel, action: "complete" }),
      ]),
    );

    await page.goto("/tarefas");
    const row = page.getByRole("link").filter({ hasText: name }).first();
    // The chip is "<label> · <ação>"; the space before "·" depends on markup.
    await expect(row).toContainText(new RegExp(`${machineLabel}\\s*· inicia`));
    await expect(row).toContainText(new RegExp(`${rackLabel}\\s*· tratada`));

    await page.goto(`/tarefas/${task.id}`);
    await expect(page.getByRole("button").filter({ hasText: machineLabel })).toContainText("inicia");
    await expect(page.getByRole("button").filter({ hasText: rackLabel })).toContainText("tratada");
  });

  test("uma tarefa sem tags avisa 'Sem tag' na lista", async ({ page }) => {
    await logInViaApi(page.request);
    const name = createUniqueName("Plantas");
    await createTaskViaApi(page.request, { name, kind: "recurring", config: { everyDays: 3 } });

    await page.goto("/tarefas");
    await expect(page.getByRole("link").filter({ hasText: name }).first()).toContainText("Sem tag");
  });
});
