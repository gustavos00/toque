// Local task board for the agents building this project.
// Run: node board/server.mjs  →  http://localhost:4321
//
// Pushes changes to the page as they happen (Server-Sent Events): agent cards
// written by board/update.mjs, plus every file saved in the project, attributed
// to the agent that owns that part of the code.
import { watch } from "node:fs";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(root);
// BOARD_AGENTS_DIR lets tests run against a scratch folder instead of the live cards.
const agentsDir = process.env.BOARD_AGENTS_DIR ?? join(root, "agents");
const port = Number(process.env.PORT ?? 4321);

const MAX_FILE_EVENTS = 300;
const FILE_EVENTS_SAVE_MS = 2000;
const SAME_FILE_DEBOUNCE_MS = 250;
const BROADCAST_THROTTLE_MS = 50;
const KEEPALIVE_MS = 15000;
const MAX_REPLY_LENGTH = 2000;
const MAX_REPLIES = 100;
const STATIC_TYPES = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const ALLOWED_ORIGINS = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);

// First matching prefix wins, so specific paths go before general ones.
const OWNERSHIP = [
  ["src/server/engine/", "motor"],
  ["src/server/notify/", "motor"],
  ["src/server/", "dados"],
  ["scripts/setup-vercel-env.sh", "devops"],
  ["src/shared/", "dados"],
  ["src/app/api/", "dados"],
  ["src/app/t/", "dados"],
  ["src/proxy.ts", "dados"],
  ["drizzle/", "dados"],
  ["drizzle.config.ts", "dados"],
  ["scripts/", "dados"],
  ["vitest.config.ts", "dados"],
  [".env.example", "dados"],
  [".env", "devops"],
  ["next.config.ts", "pwa"],
  ["src/", "pwa"],
  ["public/", "pwa"],
  ["components.json", "pwa"],
  ["e2e/", "testes"],
  ["docs/", "testes"],
  [".github/", "devops"],
  ["docs/deploy.md", "devops"],
  ["README.md", "testes"],
  ["playwright", "testes"],
  ["vercel.json", "devops"],
  ["", "pm"],
];

const IGNORED = [
  /^node_modules\//, /^\.next\//, /^\.vercel\//, /^\.data\//, /^\.git\//, /^\.git$/, /^board\//,
  /^test-results\//, /^playwright-report\//, /^playwright\//, /^coverage\//,
  /\.tmp$/, /~$/, /\.DS_Store$/, /^next-env\.d\.ts$/, /\.tsbuildinfo$/,
];

// File saves survive restarts in a cache next to the cards (not .json, so it is never read as a card).
const fileEventsCache = join(agentsDir, "file-events.cache");
const fileEvents = JSON.parse(await readFile(fileEventsCache, "utf8").catch(() => "[]")).slice(-MAX_FILE_EVENTS);
let saveFileEventsTimer = null;
const lastSeenByPath = new Map();
const clients = new Set();
let broadcastTimer = null;

function getOwner(path) {
  return OWNERSHIP.find(([prefix]) => path.startsWith(prefix))[1];
}

function isIgnored(path) {
  return IGNORED.some((pattern) => pattern.test(path));
}

// Gustavo's replies live next to each card in <id>.inbox, written only by this
// server, so they never race with the agent rewriting its own card.
function getInboxFile(agentId) {
  return join(agentsDir, `${agentId}.inbox`);
}

async function readJsonArray(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
}

function readReplies(agentId) {
  return readJsonArray(getInboxFile(agentId));
}

function getStrikesFile(agentId) {
  return join(agentsDir, `${agentId}.strikes`);
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

async function readAgents() {
  const names = (await readdir(agentsDir).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const agents = [];
  for (const name of names) {
    try {
      const agent = JSON.parse(await readFile(join(agentsDir, name), "utf8"));
      agent.replies = await readReplies(agent.id);
      agent.strikes = await readJsonArray(getStrikesFile(agent.id));
      agents.push(agent);
    } catch {
      // File is mid-write; the next change event picks it up.
    }
  }
  return agents;
}

let writeQueue = Promise.resolve();

function enqueueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

function appendReply(agentId, text) {
  return enqueueWrite(async () => {
    const replies = [...(await readReplies(agentId)), { at: new Date().toISOString(), from: "gustavo", text }].slice(-MAX_REPLIES);
    await writeJsonAtomic(getInboxFile(agentId), replies);
  });
}

function removeLastStrike(agentId) {
  return enqueueWrite(async () => {
    const strikes = await readJsonArray(getStrikesFile(agentId));
    strikes.pop();
    await writeJsonAtomic(getStrikesFile(agentId), strikes);
  });
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_REPLY_LENGTH * 4) throw new Error("too large");
  }
  return JSON.parse(body);
}

// Only the board page itself may post: a JSON body forces a CORS preflight,
// which this server never answers, and the Origin must be the board's own.
function isFromBoardPage(req) {
  const isJson = (req.headers["content-type"] ?? "").startsWith("application/json");
  return isJson && ALLOWED_ORIGINS.has(req.headers.origin);
}

async function handleBoardAction(req, res, action) {
  if (!isFromBoardPage(req)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const { agentId, text } = await readJsonBody(req);
    const agents = await readAgents();
    if (!agents.some((a) => a.id === agentId)) {
      res.writeHead(400).end();
      return;
    }
    if (action === "reply") {
      const trimmed = typeof text === "string" ? text.trim() : "";
      if (!trimmed || trimmed.length > MAX_REPLY_LENGTH) {
        res.writeHead(400).end();
        return;
      }
      await appendReply(agentId, trimmed);
    } else {
      await removeLastStrike(agentId);
    }
    res.writeHead(204).end();
  } catch {
    res.writeHead(400).end();
  }
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

function scheduleFileEventsSave() {
  if (saveFileEventsTimer) return;
  saveFileEventsTimer = setTimeout(() => {
    saveFileEventsTimer = null;
    writeJsonAtomic(fileEventsCache, fileEvents).catch((error) => console.error(error));
  }, FILE_EVENTS_SAVE_MS);
}

function recordFileEvent(path) {
  const now = Date.now();
  if (now - (lastSeenByPath.get(path) ?? 0) < SAME_FILE_DEBOUNCE_MS) return;
  lastSeenByPath.set(path, now);
  fileEvents.push({ at: new Date(now).toISOString(), agentId: getOwner(path), path });
  if (fileEvents.length > MAX_FILE_EVENTS) fileEvents.shift();
  scheduleBroadcast();
  scheduleFileEventsSave();
}

watch(projectRoot, { recursive: true }, (_event, filename) => {
  if (!filename) return;
  const path = filename.split(sep).join("/");
  if (path.startsWith("board/agents/")) {
    if (/\.(json|inbox|strikes)$/.test(path)) scheduleBroadcast();
    return;
  }
  if (!isIgnored(path)) recordFileEvent(path);
});

createServer(async (req, res) => {
  // Query strings (e.g. "/?tv") don't change which file is served.
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if ((path === "/api/reply" || path === "/api/unstrike") && req.method === "POST") {
    await handleBoardAction(req, res, path === "/api/reply" ? "reply" : "unstrike");
    return;
  }
  if (path === "/api/stream") {
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
  if (path === "/api/board") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(await buildBoard()));
    return;
  }
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(root, "index.html")));
    return;
  }
  // The page's own stylesheets and scripts: flat names only, so nothing outside board/ is reachable.
  const asset = /^\/([a-z-]+)(\.css|\.js)$/.exec(path);
  if (asset) {
    try {
      const body = await readFile(join(root, asset[1] + asset[2]));
      res.writeHead(200, { "content-type": STATIC_TYPES[asset[2]], "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => {
  console.log(`Quadro em http://localhost:${port}`);
});

setInterval(() => {
  for (const res of clients) res.write(": ping\n\n");
}, KEEPALIVE_MS);
