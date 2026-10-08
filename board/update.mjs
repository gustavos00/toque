#!/usr/bin/env node
// Updates one agent's card on the local task board.
//
//   node board/update.mjs <agent> init "<name>" "<role>"
//   node board/update.mjs <agent> status <todo|doing|blocked|done>
//   node board/update.mjs <agent> step "<what it is doing now>"
//   node board/update.mjs <agent> task "<title>" <todo|doing|blocked|done>
//   node board/update.mjs <agent> log <decision|file|test|question> "<text>"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATUSES = ["todo", "doing", "blocked", "done"];
const LOG_KINDS = ["decision", "file", "test", "question"];
const MAX_LOG_ENTRIES = 200;

const agentsDir = join(dirname(fileURLToPath(import.meta.url)), "agents");
const [agentId, command, ...args] = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label} inválido: "${value}". Use: ${allowed.join(", ")}`);
}

async function loadAgent(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { id: agentId, name: agentId, role: "", status: "todo", currentStep: "", tasks: [], log: [] };
  }
}

async function saveAgent(file, agent) {
  agent.updatedAt = new Date().toISOString();
  agent.log = agent.log.slice(-MAX_LOG_ENTRIES);
  await mkdir(agentsDir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(agent, null, 2));
  await rename(tmp, file);
}

if (!agentId || !/^[a-z0-9-]+$/.test(agentId)) fail("Indique o id do agente (minúsculas, números e hífens).");

const file = join(agentsDir, `${agentId}.json`);
const agent = await loadAgent(file);
const at = new Date().toISOString();

switch (command) {
  case "init":
    agent.name = args[0] ?? agent.name;
    agent.role = args[1] ?? agent.role;
    break;
  case "status":
    assertOneOf(args[0], STATUSES, "Estado");
    agent.status = args[0];
    if (args[0] === "done") agent.currentStep = "";
    break;
  case "step":
    if (!args[0]) fail("Falta o texto do passo.");
    agent.currentStep = args[0];
    agent.log.push({ at, kind: "step", text: args[0] });
    break;
  case "task": {
    if (!args[0]) fail("Falta o título da tarefa.");
    assertOneOf(args[1], STATUSES, "Estado");
    const task = agent.tasks.find((t) => t.title === args[0]);
    if (task) task.status = args[1];
    else agent.tasks.push({ title: args[0], status: args[1] });
    break;
  }
  case "log":
    assertOneOf(args[0], LOG_KINDS, "Tipo");
    if (!args[1]) fail("Falta o texto.");
    agent.log.push({ at, kind: args[0], text: args[1] });
    break;
  default:
    fail("Comando desconhecido. Use: init, status, step, task, log.");
}

await saveAgent(file, agent);
