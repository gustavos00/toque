// Regenerates docs/images/*.png: the iPhone app's screens, rendered by its web build
// against a local demo server filled with made-up data. Headless WebKit only.
//
//   npm run screenshots
//
// Builds the server in demo mode (into .next-demo) and the app for the web (into
// mobile/.screenshots-web), serves both from one origin so the app needs no CORS,
// seeds a household, captures three screens and stops everything it started.

import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, webkit } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = path.join(ROOT, "mobile", ".screenshots-web");
const OUT_DIR = path.join(ROOT, "docs", "images");
const API_PORT = 4430;
const WEB_PORT = 4431;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;

// Test-only values, like e2e/env.ts: an in-memory database and no notifications.
const SERVER_ENV = {
  ...process.env,
  DATABASE_URL: "",
  TOQUE_PGLITE_DIR: "memory://",
  NEXT_PUBLIC_TOQUE_DEMO: "1",
  TOQUE_DIST_DIR: ".next-demo",
  TOQUE_PASSWORD: "unused-in-demo-mode",
  TOQUE_SESSION_SECRET: "screenshots-session-secret-0123456789abcdef",
  TOQUE_CRON_SECRET: "screenshots-cron-secret-0123456789abcdef0123",
  TOQUE_ACTION_SECRET: "screenshots-action-secret-0123456789abcdef",
  TOQUE_PUBLIC_URL: WEB,
  NTFY_TOPIC: "",
  NTFY_BASE_URL: "http://127.0.0.1:9",
  NEXT_TELEMETRY_DISABLED: "1",
};

function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`${url} did not come up`);
}

/** Serves the app's static build and forwards /api to the demo server. */
function startWebServer() {
  const server = http.createServer(async (request, response) => {
    if (request.url.startsWith("/api/")) {
      const upstream = http.request(
        `${API}${request.url}`,
        { method: request.method, headers: request.headers },
        (reply) => {
          response.writeHead(reply.statusCode ?? 502, reply.headers);
          reply.pipe(response);
        },
      );
      request.pipe(upstream);
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url, WEB).pathname);
    const file = path.join(WEB_DIR, pathname);
    const isAsset = file.startsWith(WEB_DIR) && path.extname(file) !== "";
    try {
      const body = await readFile(isAsset ? file : path.join(WEB_DIR, "index.html"));
      const type = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
      response.writeHead(200, { "Content-Type": type[path.extname(file)] ?? "text/html" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(WEB_PORT, () => resolve(server)));
}

async function call(token, method, url, body) {
  const response = await fetch(`${API}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`);
  return response.json();
}

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];

/** A made-up household. Returns the token of the tag shown in the sheet capture. */
async function seed(token) {
  const createTask = (body) => call(token, "POST", "/api/tasks", { enabled: true, ...body });
  const createTag = (label, taskId, action = "start") =>
    call(token, "POST", "/api/tags", { label, taskId, action });
  const tap = (tag) => call(null, "POST", `/api/scan/${tag.token}`, { action: "done" });

  const laundry = await createTask({
    name: "Washing machine",
    kind: "timer",
    config: { durationMinutes: 75, forgottenReminderMinutes: [30, 60] },
  });
  const dishwasher = await createTask({
    name: "Dishwasher",
    kind: "timer",
    config: { durationMinutes: 120 },
  });
  const bins = await createTask({
    name: "Take out the bins",
    kind: "until_ack",
    config: { weekdays: EVERY_DAY, reminderTimes: ["19:00", "20:30", "21:30"] },
  });
  const cat = await createTask({
    name: "Feed the cat",
    kind: "until_ack",
    config: { weekdays: EVERY_DAY, reminderTimes: ["08:00", "20:00"] },
  });
  const plants = await createTask({
    name: "Water the plants",
    kind: "recurring",
    config: { mode: "interval", everyDays: 3, reminderTime: "09:00" },
  });
  const sheets = await createTask({
    name: "Change the bed sheets",
    kind: "recurring",
    config: { mode: "weekdays", weekdays: [1], reminderTime: "09:00" },
  });

  const laundryTag = await createTag("Washing machine", laundry.id);
  await createTag("Drying rack", laundry.id, "complete");
  await createTag("Dishwasher", dishwasher.id);
  const binsTag = await createTag("Front door", bins.id);
  const catTag = await createTag("Cat bowl", cat.id);
  const plantsTag = await createTag("Balcony", plants.id);
  await createTag("Linen cupboard", sheets.id);

  await tap(plantsTag);
  await tap(catTag);
  await tap(laundryTag);
  return binsTag.token;
}

async function capture(token, binsTagToken) {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({
      ...devices["iPhone 15"],
      locale: "en-GB",
      timezoneId: "Europe/Lisbon",
      colorScheme: "dark",
    });
    await context.addInitScript((value) => {
      localStorage.setItem("toque_session_token", value);
    }, token);
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
    page.on("pageerror", (e) => console.log("pageerror:", e.message));
    const shoot = (name) => page.screenshot({ path: path.join(OUT_DIR, name) });

    await page.goto(`${WEB}/`);
    await page.getByText("Washing machine").first().waitFor();
    await page.waitForTimeout(500);
    const today = await shoot("today.png");

    await page.getByRole("tab", { name: "Tasks" }).click();
    // Only the Tasks screen shows tag counts.
    await page.getByText("2 tags").waitFor();
    await page.waitForTimeout(300);
    await shoot("tasks.png");

    // Open the sheet over the Today screen, as a tag tap does in the app.
    await page.getByRole("tab", { name: "Today" }).click();
    await page.evaluate((tagToken) => {
      history.pushState({}, "", `/t/${tagToken}`);
      dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    }, binsTagToken);
    await page.getByText("What would you like to do?").waitFor();
    await page.waitForTimeout(500);
    // The web stack does not keep the screen under a transparent modal, so paint
    // the Today capture behind the sheet, where the app would show it.
    await page.addStyleTag({
      content: `body { background: #121212 url(data:image/png;base64,${today.toString("base64")}) top left / 100% auto no-repeat; }`,
    });
    await page.waitForTimeout(300);
    await shoot("tag.png");
  } finally {
    await browser.close();
  }
}

const children = [];
let webServer;
try {
  // --no-build reuses the last builds, for iterating on the captures.
  if (!process.argv.includes("--no-build")) {
    run("npx", ["next", "build"], { cwd: ROOT, env: SERVER_ENV });
    run("npx", ["expo", "export", "--platform", "web", "--output-dir", WEB_DIR], {
      cwd: path.join(ROOT, "mobile"),
      env: { ...process.env, EXPO_PUBLIC_API_URL: WEB },
    });
  }

  children.push(
    spawn("npx", ["next", "start", "--port", String(API_PORT)], {
      cwd: ROOT,
      env: SERVER_ENV,
      stdio: "ignore",
      detached: true,
    }),
  );
  webServer = await startWebServer();
  await waitFor(`${API}/api/app-info`);

  const { token } = await call(null, "POST", "/api/auth/login", { password: "demo" });
  const binsTagToken = await seed(token);
  await capture(token, binsTagToken);
  console.log(`Screenshots written to ${path.relative(ROOT, OUT_DIR)}/`);
} finally {
  webServer?.close();
  for (const child of children) {
    // npx starts next in its own process group: stop the whole group.
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}
