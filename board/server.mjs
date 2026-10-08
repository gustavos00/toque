// Local task board for the agents building this project.
// Run: node board/server.mjs  →  http://localhost:4321
//
// Pushes changes to the page as they happen (Server-Sent Events): agent cards
// written by board/update.mjs, plus every file saved in the project, attributed
// to the agent that owns that part of the code.
import { watch } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
const agentsDir = join(root, "agents");
const port = Number(process.env.PORT ?? 4321);

const MAX_FILE_EVENTS = 300;
const SAME_FILE_DEBOUNCE_MS = 250;
const BROADCAST_THROTTLE_MS = 50;
const KEEPALIVE_MS = 15000;

// First matching prefix wins, so specific paths go before general ones.
const OWNERSHIP = [
  ["src/server/engine/", "motor"],
  ["src/server/notify/", "motor"],
  ["src/server/", "dados"],
  ["src/shared/", "dados"],
  ["src/app/api/", "dados"],
  ["src/app/t/", "dados"],
  ["src/proxy.ts", "dados"],
  ["drizzle/", "dados"],
  ["drizzle.config.ts", "dados"],
  ["scripts/", "dados"],
  ["vitest.config.ts", "dados"],
  [".env.example", "dados"],
  ["src/", "pwa"],
  ["public/", "pwa"],
  ["components.json", "pwa"],
  ["e2e/", "testes"],
  ["docs/", "testes"],
  [".github/", "testes"],
  ["README.md", "testes"],
  ["playwright.config.ts", "testes"],
  ["vercel.json", "testes"],
  ["", "pm"],
];

const IGNORED = [
  /^node_modules\//, /^\.next\//, /^\.data\//, /^\.git\//, /^\.git$/, /^board\//,
  /^test-results\//, /^playwright-report\//, /^playwright\//, /^coverage\//,
  /\.tmp$/, /~$/, /\.DS_Store$/, /^next-env\.d\.ts$/, /\.tsbuildinfo$/,
];

const fileEvents = [];
const lastSeenByPath = new Map();
const clients = new Set();
let broadcastTimer = null;

function getOwner(path) {
  return OWNERSHIP.find(([prefix]) => path.startsWith(prefix))[1];
}

function isIgnored(path) {
  return IGNORED.some((pattern) => pattern.test(path));
}

async function readAgents() {
  const names = (await readdir(agentsDir).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const agents = [];
  for (const name of names) {
    try {
      agents.push(JSON.parse(await readFile(join(agentsDir, name), "utf8")));
    } catch {
      // File is mid-write; the next change event picks it up.
    }
  }
  return agents;
}

async function buildBoard() {
  return { agents: await readAgents(), fileEvents, generatedAt: new Date().toISOString() };
}

function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    const payload = `data: ${JSON.stringify(await buildBoard())}\n\n`;
    for (const res of clients) res.write(payload);
  }, BROADCAST_THROTTLE_MS);
}

function recordFileEvent(path) {
  const now = Date.now();
  if (now - (lastSeenByPath.get(path) ?? 0) < SAME_FILE_DEBOUNCE_MS) return;
  lastSeenByPath.set(path, now);
  fileEvents.push({ at: new Date(now).toISOString(), agentId: getOwner(path), path });
  if (fileEvents.length > MAX_FILE_EVENTS) fileEvents.shift();
  scheduleBroadcast();
}

watch(projectRoot, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const path = filename.split(sep).join("/");
  if (path.startsWith("board/agents/")) {
    if (path.endsWith(".json")) scheduleBroadcast();
    return;
  }
  if (!isIgnored(path)) recordFileEvent(path);
});

createServer(async (req, res) => {
  if (req.url === "/api/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify(await buildBoard())}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.url === "/api/board") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(await buildBoard()));
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(root, "index.html")));
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => {
  console.log(`Quadro em http://localhost:${port}`);
});

setInterval(() => {
  for (const res of clients) res.write(": ping\n\n");
}, KEEPALIVE_MS);
