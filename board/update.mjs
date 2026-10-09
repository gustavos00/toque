#!/usr/bin/env node
// Updates one agent's card on the local task board.
//
//   node board/update.mjs <agent> init "<name>" "<role>"
//   node board/update.mjs <agent> status <todo|doing|blocked|done>
//   node board/update.mjs <agent> step "<what it is doing now>"
//   node board/update.mjs <agent> task "<title>" <todo|doing|blocked|done>
//   node board/update.mjs <agent> log <decision|file|test|question> "<text>"
//   node board/update.mjs <agent> meet <otherId>[,<otherId>…] "<topic>"   (e.g. meet pm "Propostas para o quadro")
//   node board/update.mjs <agent> meet end
//
// A meeting makes everyone in it walk to the meeting table in the office view.
// Ids without a card (e.g. "gustavo") join as visitors. A meeting stays on for
// 15 min after the agent's last update; run "meet end" when it is over.
//
//   node board/update.mjs <agent> inbox              prints Gustavo's new replies (sent from the board page)
//   node board/update.mjs <agent> wait [seconds]     waits for a reply (default 540 s), then prints it
//
//   node board/update.mjs <target> strike "<reason>"    records a strike against <target> (any id, pm included)
//   node board/update.mjs <target> unstrike             removes the last one (Gustavo's call; also a button on the board)
//
// A step, log or meeting from an agent that is "todo" or "done" sets it back to
// "doing"; "status done" also ends its meeting.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATUSES = ["todo", "doing", "blocked", "done"];
const LOG_KINDS = ["decision", "file", "test", "question"];
const MAX_LOG_ENTRIES = 200;
const DEFAULT_WAIT_S = 540;
const WAIT_POLL_MS = 1000;

// BOARD_AGENTS_DIR lets tests run against a scratch folder instead of the live cards.
const agentsDir = process.env.BOARD_AGENTS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "agents");
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

async function readUnreadReplies(agent) {
  try {
    const replies = JSON.parse(await readFile(join(agentsDir, `${agent.id}.inbox`), "utf8"));
    return replies.filter((r) => !agent.inboxReadAt || r.at > agent.inboxReadAt);
  } catch {
    return [];
  }
}

function printReplies(replies) {
  for (const r of replies) console.log(`[${r.at}] Gustavo: ${r.text}`);
}

function setDoingIfIdle(agent) {
  if (agent.status === "todo" || agent.status === "done") agent.status = "doing";
}

if (!agentId || !/^[a-z0-9-]+$/.test(agentId)) fail("Indique o id do agente (minúsculas, números e hífens).");

// Strikes live in <id>.strikes so recording one never rewrites the target's own card.
if (command === "strike" || command === "unstrike") {
  const strikesFile = join(agentsDir, `${agentId}.strikes`);
  const strikes = JSON.parse(await readFile(strikesFile, "utf8").catch(() => "[]"));
  if (command === "strike") {
    if (!args[0]) fail("Falta o motivo.");
    strikes.push({ at: new Date().toISOString(), reason: args[0], by: "pm" });
  } else if (!strikes.pop()) {
    fail("Não há penalizações para retirar.");
  }
  await mkdir(agentsDir, { recursive: true });
  const tmp = `${strikesFile}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(strikes, null, 2));
  await rename(tmp, strikesFile);
  console.log(`${agentId}: ${strikes.length}/3 penalizações`);
  process.exit(0);
}

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
    if (args[0] === "done") {
      agent.currentStep = "";
      if (agent.meeting) agent.log.push({ at, kind: "meeting", text: "Terminou a reunião", with: agent.meeting.with });
      agent.meeting = null;
    }
    break;
  case "step":
    if (!args[0]) fail("Falta o texto do passo.");
    agent.currentStep = args[0];
    agent.log.push({ at, kind: "step", text: args[0] });
    setDoingIfIdle(agent);
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
    setDoingIfIdle(agent);
    break;
  case "meet": {
    if (args[0] === "end") {
      if (agent.meeting) agent.log.push({ at, kind: "meeting", text: "Terminou a reunião", with: agent.meeting.with });
      agent.meeting = null;
      break;
    }
    const withIds = (args[0] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!withIds.length || withIds.some((id) => !/^[a-z0-9-]+$/.test(id))) fail("Indique com quem (ids separados por vírgulas).");
    if (!args[1]) fail("Falta o assunto.");
    const isSameMeeting = agent.meeting?.topic === args[1] && agent.meeting.with.join() === withIds.join();
    if (!isSameMeeting) agent.log.push({ at, kind: "meeting", text: args[1], with: withIds });
    agent.meeting = { with: withIds, topic: args[1], since: isSameMeeting ? agent.meeting.since : at };
    setDoingIfIdle(agent);
    break;
  }
  case "inbox":
  case "wait": {
    const timeoutMs = (command === "wait" ? Number(args[0] ?? DEFAULT_WAIT_S) : 0) * 1000;
    const deadline = Date.now() + timeoutMs;
    let replies = await readUnreadReplies(agent);
    while (!replies.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
      replies = await readUnreadReplies(agent);
    }
    if (!replies.length) {
      console.log(command === "wait" ? `Sem resposta ao fim de ${timeoutMs / 1000} s.` : "Sem respostas novas.");
      process.exit(0);
    }
    printReplies(replies);
    // Re-read the card: it may have changed while waiting.
    Object.assign(agent, await loadAgent(file));
    agent.inboxReadAt = replies.at(-1).at;
    break;
  }
  default:
    fail("Comando desconhecido. Use: init, status, step, task, log, meet, inbox, wait, strike, unstrike.");
}

await saveAgent(file, agent);
