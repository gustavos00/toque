// Tests for the agent board (CLI + server), against a scratch agents folder.
// Never touches board/agents/.
//   node --test board/
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const boardDir = dirname(fileURLToPath(import.meta.url));
const UPDATE_SCRIPT = join(boardDir, "update.mjs");
const SERVER_SCRIPT = join(boardDir, "server.mjs");

let agentsDir;
let port;
let server;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port: free } = probe.address();
      probe.close(() => resolve(free));
    });
  });
}

async function runUpdate(...args) {
  const { stdout } = await execFileAsync(process.execPath, [UPDATE_SCRIPT, ...args], {
    env: { ...process.env, BOARD_AGENTS_DIR: agentsDir },
  });
  return stdout.trim();
}

async function readCard(agentId) {
  return JSON.parse(await readFile(join(agentsDir, `${agentId}.json`), "utf8"));
}

async function readStrikes(agentId) {
  return JSON.parse(await readFile(join(agentsDir, `${agentId}.strikes`), "utf8"));
}

function getBaseUrl() {
  return `http://localhost:${port}`;
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${getBaseUrl()}/api/board`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("O servidor do quadro não arrancou a tempo.");
}

function postReply(body, headers) {
  return fetch(`${getBaseUrl()}/api/reply`, { method: "POST", headers, body: JSON.stringify(body) });
}

function createBoardHeaders() {
  return { Origin: getBaseUrl(), "Content-Type": "application/json" };
}

before(async () => {
  agentsDir = await mkdtemp(join(tmpdir(), "toque-board-test-"));
  port = await findFreePort();
  server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: { ...process.env, BOARD_AGENTS_DIR: agentsDir, PORT: String(port) },
    stdio: "ignore",
  });
  await waitForServer();
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  if (agentsDir) await rm(agentsDir, { recursive: true, force: true });
});

describe("estado automático", () => {
  for (const [label, args] of [
    ["step", ["step", "A trabalhar"]],
    ["log", ["log", "decision", "Uma decisão"]],
    ["meet", ["meet", "pm", "Uma reunião"]],
  ]) {
    test(`${label} de um agente "done" passa-o a "doing"`, async () => {
      const id = `auto-${label}`;
      await runUpdate(id, "status", "done");
      assert.equal((await readCard(id)).status, "done");
      await runUpdate(id, ...args);
      assert.equal((await readCard(id)).status, "doing");
    });
  }

  test('"status done" termina a reunião do agente', async () => {
    const id = "reuniao";
    await runUpdate(id, "meet", "pm,quadro", "Testes do quadro");
    assert.deepEqual((await readCard(id)).meeting?.with, ["pm", "quadro"]);

    await runUpdate(id, "status", "done");
    const card = await readCard(id);
    assert.equal(card.status, "done");
    assert.equal(card.meeting, null);
    assert.equal(card.currentStep, "");
    assert.equal(card.log.at(-1).text, "Terminou a reunião");
  });
});

describe("penalizações", () => {
  test("strike e unstrike contam e retiram a última", async () => {
    const id = "penalizado";
    assert.equal(await runUpdate(id, "strike", "Sem atualizações"), `${id}: 1/3 penalizações`);
    assert.equal(await runUpdate(id, "strike", "Estado errado"), `${id}: 2/3 penalizações`);
    assert.deepEqual(
      (await readStrikes(id)).map((s) => s.reason),
      ["Sem atualizações", "Estado errado"],
    );

    assert.equal(await runUpdate(id, "unstrike"), `${id}: 1/3 penalizações`);
    assert.deepEqual(
      (await readStrikes(id)).map((s) => s.reason),
      ["Sem atualizações"],
    );
  });

  test("unstrike sem penalizações falha", async () => {
    await assert.rejects(runUpdate("sem-penalizacoes", "unstrike"), /Não há penalizações para retirar/);
  });
});

describe("respostas do Gustavo (inbox / wait)", () => {
  test("POST /api/reply sem Origin responde 403", async () => {
    await runUpdate("caixa", "status", "doing");
    const response = await postReply({ agentId: "caixa", text: "olá" }, { "Content-Type": "application/json" });
    assert.equal(response.status, 403);
  });

  test("POST /api/reply com Origin de outro sítio responde 403", async () => {
    const response = await postReply(
      { agentId: "caixa", text: "olá" },
      { Origin: "http://evil.example", "Content-Type": "application/json" },
    );
    assert.equal(response.status, 403);
  });

  test("POST /api/reply sem JSON responde 403", async () => {
    const response = await postReply({ agentId: "caixa", text: "olá" }, { Origin: getBaseUrl(), "Content-Type": "text/plain" });
    assert.equal(response.status, 403);
  });

  test("inbox mostra a resposta uma vez e wait espera pela seguinte", async () => {
    const id = "caixa";
    assert.equal(await runUpdate(id, "inbox"), "Sem respostas novas.");

    const first = await postReply({ agentId: id, text: "Primeira resposta" }, createBoardHeaders());
    assert.equal(first.status, 204);
    assert.match(await runUpdate(id, "inbox"), /Gustavo: Primeira resposta$/);
    assert.equal(await runUpdate(id, "inbox"), "Sem respostas novas.");

    assert.equal(await runUpdate(id, "wait", "1"), "Sem resposta ao fim de 1 s.");

    const waiting = runUpdate(id, "wait", "5");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const second = await postReply({ agentId: id, text: "Segunda resposta" }, createBoardHeaders());
    assert.equal(second.status, 204);
    const output = await waiting;
    assert.match(output, /Gustavo: Segunda resposta$/);
    assert.doesNotMatch(output, /Primeira resposta/);
  });

  test("POST /api/reply para um agente desconhecido responde 400", async () => {
    const response = await postReply({ agentId: "nao-existe", text: "olá" }, createBoardHeaders());
    assert.equal(response.status, 400);
  });
});

describe("ficheiros servidos", () => {
  test("GET /server.mjs responde 404", async () => {
    assert.equal((await fetch(`${getBaseUrl()}/server.mjs`)).status, 404);
  });

  test("GET /core.js responde 200 com JavaScript", async () => {
    const response = await fetch(`${getBaseUrl()}/core.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/javascript/);
  });

  test("não serve ficheiros fora de board/", async () => {
    for (const path of ["/../package.json", "/%2e%2e/package.json", "/agents/caixa.json", "/update.mjs"]) {
      assert.equal((await fetch(`${getBaseUrl()}${path}`)).status, 404, path);
    }
  });
});
