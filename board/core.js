// Constants, state and shared helpers. Owner: Leonor (quadro).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
// Read-only API for the other owners' files (keep stable): lastBoard, selectedAgentId, MAX_STRIKES, KIND_LABELS,
// getAgent, getPersonName, getAgentColor, escapeHtml, formatTime, formatAgo, getLastActivityAt, getStrikes, isFired,
// addBoardListener. Page slots: #notify-slot, #timeline, #kind-filters, #feed.
const STATUS_COLUMNS = [["todo", "Por fazer"], ["doing", "Em curso"], ["blocked", "Bloqueado"], ["done", "Feito"]];
const STATUS_LABELS = Object.fromEntries(STATUS_COLUMNS);
// An agent that finished is on standby; its tasks still read "Feito".
const AGENT_STATUS_LABELS = { ...STATUS_LABELS, done: "Standby" };
const KIND_LABELS = { step: "Passo", decision: "Decisão", meeting: "Reunião", reply: "Resposta", strike: "Penalização", edit: "Gravou", file: "Ficheiro", test: "Teste", question: "Pergunta" };
const SILENCE_MS = 5 * 60000;
const MAX_STRIKES = 3;
const RERENDER_MS = 10000;
const ACTIVE_WINDOW_MS = 60000;
const MEETING_TTL_MS = 15 * 60000;
const WALK_MS = 2600;
const CLOCK_MS = 100;

// How each person looks. Unknown ids get a generated look.
const LOOKS = {
  pm:     { color: "#d97757", skin: "#e9b994", hair: "#5b3d2b", hairStyle: "short", top: "blazer", pants: "#2b2f36", glasses: true },
  dados:  { color: "#3b82f6", skin: "#f2c9a6", hair: "#2b1b12", hairStyle: "long", top: "tee", pants: "#33415a" },
  motor:  { color: "#16a34a", skin: "#e7b48c", hair: "#a56b3a", hairStyle: "short", top: "shirt", pants: "#3a3f47", glasses: true, beard: true, pause: "smoke" },
  pwa:    { color: "#0891b2", skin: "#8b5a3c", hair: "#1a1210", hairStyle: "bun", top: "hoodie", pants: "#2a2f3a", glasses: true },
  testes: { color: "#7c3aed", skin: "#c98d63", hair: "#252525", hairStyle: "short", top: "tee", pants: "#4b3a2a", cap: "#1f2937", pause: "smoke" },
  devops: { color: "#e0820f", skin: "#d6a27a", hair: "#121212", hairStyle: "buzz", top: "hoodie", pants: "#263238", beard: true, headphones: true },
  quadro: { color: "#e11d48", skin: "#f6d5bd", hair: "#b4532a", hairStyle: "long", top: "shirt", pants: "#2b2f36" },
  gustavo:{ color: "#475569", skin: "#e8b892", hair: "#2a2420", hairStyle: "short", top: "shirt", pants: "#2f3a4a", beard: true, name: "Gustavo" },
};
const SEAT_ORDER = ["pm", "dados", "motor", "pwa", "testes", "devops", "quadro"];
const FALLBACK_COLORS = ["#0ea5e9", "#84cc16", "#f59e0b", "#ec4899", "#14b8a6", "#a855f7"];
const FALLBACK_SKINS = ["#f2c9a6", "#d6a27a", "#8b5a3c", "#e9b994"];
const FALLBACK_HAIRS = ["#2b1b12", "#a56b3a", "#121212", "#6b4a35"];

const COLS = 4, DESK_W = 130, DESK_GAP_X = 215, ROW_GAP = 270, FIRST_ROW_Y = 175, FIRST_COL_X = 195;
const WALL_H = 240, MARGIN = 80, COS45 = Math.SQRT1_2, SIN60 = Math.sin(Math.PI / 3);

let selectedAgentId = null;
const hiddenKinds = new Set();
let lastBoard = { agents: [], fileEvents: [] };
let scene = null;

// ---------- Generic helpers ----------
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatAgo(iso) {
  if (!iso) return "—";
  const ms = Math.max(0, Date.now() - new Date(iso));
  if (ms < 60000) return `há ${(ms / 1000).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  if (ms < 3600000) return `há ${Math.floor(ms / 60000)} min ${Math.floor((ms % 60000) / 1000)} s`;
  return `há ${Math.floor(ms / 3600000)} h ${Math.floor((ms % 3600000) / 60000)} min`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getFileName(path) {
  return path.split("/").pop();
}

function hashText(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function getLook(id) {
  if (LOOKS[id]) return LOOKS[id];
  const h = hashText(id);
  return {
    color: FALLBACK_COLORS[h % FALLBACK_COLORS.length], skin: FALLBACK_SKINS[h % 4], hair: FALLBACK_HAIRS[(h >> 3) % 4],
    hairStyle: ["short", "long", "bun", "buzz"][(h >> 5) % 4], top: ["tee", "hoodie", "shirt"][(h >> 7) % 3], pants: "#2f3a4a",
    pause: h % 3 === 0 ? "smoke" : "coffee",
  };
}

function getBreakKind(id) {
  return getLook(id).pause ?? "coffee";
}

function getAgentColor(id) {
  return getLook(id).color;
}

function getAgent(id) {
  return lastBoard.agents.find((a) => a.id === id);
}

function getPersonName(id) {
  return getAgent(id)?.name ?? LOOKS[id]?.name ?? id;
}

function getLastFileEvent(agentId) {
  return [...(lastBoard.fileEvents ?? [])].reverse().find((e) => e.agentId === agentId);
}

function getLastActivityAt(agent) {
  return [agent.updatedAt, getLastFileEvent(agent.id)?.at].filter(Boolean).sort().pop();
}

function isActiveNow(agent) {
  const at = getLastActivityAt(agent);
  return Boolean(at) && Date.now() - new Date(at) < ACTIVE_WINDOW_MS;
}

function getStrikes(agent) {
  return agent?.strikes ?? [];
}

function isFired(agent) {
  return getStrikes(agent).length >= MAX_STRIKES;
}

// An agent "doing" something with nothing on the board for 5 min: a warning, not a strike.
function getSilentMs(agent) {
  if (!agent || agent.status !== "doing" || isFired(agent)) return 0;
  const at = getLastActivityAt(agent);
  const ms = at ? Date.now() - new Date(at) : Infinity;
  return ms >= SILENCE_MS ? ms : 0;
}

function formatSilence(ms) {
  return Number.isFinite(ms) ? `Sem feedback há ${Math.floor(ms / 60000)} min` : "Sem feedback";
}

function getUnreadReplies(agent) {
  return (agent.replies ?? []).filter((r) => !agent.inboxReadAt || r.at > agent.inboxReadAt);
}

function createStrikeBadge(agent) {
  const strikes = getStrikes(agent);
  if (!strikes.length) return "";
  const reasons = strikes.map((s, i) => `${i + 1}. ${s.reason}`).join("\n");
  return `<span class="strike-badge" title="${escapeHtml(reasons)}">⚠️ ${strikes.length}/${MAX_STRIKES}</span>`;
}

function createStatusPill(agent) {
  if (isFired(agent)) return `<span class="pill fired">Despedido</span>`;
  return `<span class="pill ${escapeHtml(agent.status)}">${AGENT_STATUS_LABELS[agent.status] ?? escapeHtml(agent.status)}</span>`;
}

function createReplyForm(agent, place) {
  return `<form class="reply-form" data-agent="${escapeHtml(agent.id)}"><input name="text" data-key="reply-${escapeHtml(agent.id)}-${place}" maxlength="2000" autocomplete="off" placeholder="Responder a ${escapeHtml(agent.name)}…"><button>Enviar</button></form>`;
}

function createRepliesHtml(agent, limit) {
  return (agent.replies ?? []).slice(-limit).map((r) => {
    const isRead = agent.inboxReadAt && r.at <= agent.inboxReadAt;
    return `<div class="reply">Tu, ${formatTime(r.at)}: ${escapeHtml(r.text)} · ${isRead ? "✓ lida" : "por ler"}</div>`;
  }).join("");
}

// Re-renders without losing what Gustavo is typing in a reply box.
function setHtmlKeepingInputs(el, html) {
  if (el.dataset.html === html) return;
  const values = new Map([...el.querySelectorAll("input[data-key]")].map((i) => [i.dataset.key, i.value]));
  const focused = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  el.innerHTML = html;
  el.dataset.html = html;
  for (const input of el.querySelectorAll("input[data-key]")) {
    if (values.has(input.dataset.key)) input.value = values.get(input.dataset.key);
    if (input.dataset.key === focused) input.focus();
  }
}

async function postBoardAction(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) alert("Não foi possível enviar. O servidor do quadro está a correr?");
  return res.ok;
}


// Extra panels (timeline, notifications…) subscribe here; called after every render.
// A broken listener must never take the board down, hence the try/catch.
const boardListeners = [];

function addBoardListener(listener) {
  boardListeners.push(listener);
}

function notifyBoardListeners() {
  for (const listener of boardListeners) {
    try {
      listener(lastBoard);
    } catch (error) {
      console.error(error);
    }
  }
}
