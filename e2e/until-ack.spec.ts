import { expect, test } from "@playwright/test";
import type { DashboardDto } from "../src/shared/api";
import {
  createTagViaApi,
  createTaskViaApi,
  createUniqueName,
  getTagPath,
  getTodayIsoWeekday,
  logInViaApi,
} from "./helpers";

test.describe("tarefa até confirmar (lixo)", () => {
  test("em dia de recolha aparece pendente e fica feita depois do toque", async ({ page }) => {
    await logInViaApi(page.request);
    const name = createUniqueName("Lixo");
    const task = await createTaskViaApi(page.request, {
      name,
      kind: "until_ack",
      // Today is always a collection day, whatever day the suite runs.
      config: { weekdays: [getTodayIsoWeekday()] },
    });
    const tag = await createTagViaApi(page.request, { label: `Porta ${name}`, taskId: task.id });

    const before = (await (await page.request.get("/api/dashboard")).json()) as DashboardDto;
    expect(before.untilAckToday).toContainEqual(
      expect.objectContaining({ acked: false, task: expect.objectContaining({ id: task.id }) }),
    );

    await page.goto("/");
    const row = page.getByRole("link").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Por fazer");

    await page.goto(getTagPath(tag));
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(/^Feito por hoje\./)).toBeVisible();

    const after = (await (await page.request.get("/api/dashboard")).json()) as DashboardDto;
    expect(after.untilAckToday).toContainEqual(
      expect.objectContaining({ acked: true, task: expect.objectContaining({ id: task.id }) }),
    );
  });
});
