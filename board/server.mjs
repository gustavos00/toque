// Local task board for the agents building this project.
// Run: node board/server.mjs  →  http://localhost:4321
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(root, "agents");
const port = Number(process.env.PORT ?? 4321);

async function readBoard() {
  const names = (await readdir(agentsDir).catch(() => []))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const agents = [];
  for (const name of names) {
    try {
      agents.push(JSON.parse(await readFile(join(agentsDir, name), "utf8")));
    } catch {
      // File is mid-write; it shows up on the next poll.
    }
  }
  return { agents, generatedAt: new Date().toISOString() };
}

createServer(async (req, res) => {
  if (req.url === "/api/board") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify(await readBoard()));
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
