import { expect, test, type APIRequestContext } from "@playwright/test";
import type { DashboardDto } from "../src/shared/api";
import { createTagViaApi, createTaskViaApi, createUniqueName, getTagPath, logInViaApi } from "./helpers";

async function getTimerPhase(request: APIRequestContext, taskId: string) {
  const dashboard = (await (await request.get("/api/dashboard")).json()) as DashboardDto;
  return dashboard.timers.find((timer) => timer.task.id === taskId)?.phase;
}

test.describe("máquina da roupa com duas tags (inicia + estendida)", () => {
  test("tag da máquina inicia, tag do estendal marca a roupa como estendida", async ({ page }) => {
    // The server clock can't be mocked from the browser, so use a 1-minute
    // timer and wait for it to finish for real.
    test.setTimeout(150_000);
    await logInViaApi(page.request);
    const name = createUniqueName("Roupa");
    const task = await createTaskViaApi(page.request, {
      name,
      kind: "timer",
      config: { durationMinutes: 1, almostDoneEnabled: false },
    });
    const startTag = await createTagViaApi(page.request, {
      label: `Máquina ${name}`,
      taskId: task.id,
      action: "start",
    });
    const completeTag = await createTagViaApi(page.request, {
      label: `Estendal ${name}`,
      taskId: task.id,
      action: "complete",
    });
    expect(completeTag.token).not.toBe(startTag.token);

    await page.goto(getTagPath(startTag));
    await expect(page.getByText(/acaba às \d{2}:\d{2}/)).toBeVisible();

    // Scanning the start tag again while running only informs.
    await page.goto(getTagPath(startTag));
    await expect(page.getByText(/^Já está a decorrer · acaba às \d{2}:\d{2}$/)).toBeVisible();

    expect(await getTimerPhase(page.request, task.id)).toBe("running");
    await expect
      .poll(() => getTimerPhase(page.request, task.id), { timeout: 100_000, intervals: [5_000] })
      .toBe("ready");

    await page.goto("/");
    await expect(page.getByRole("link").filter({ hasText: name })).toContainText("Pronta · por estender");

    await page.goto(getTagPath(completeTag));
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(/^Tratado/)).toBeVisible();

    expect(await getTimerPhase(page.request, task.id)).toBe("handled");
    await page.goto("/");
    await expect(page.getByRole("link").filter({ hasText: name })).toContainText(/Tratada às \d{2}:\d{2}/);
  });
});
