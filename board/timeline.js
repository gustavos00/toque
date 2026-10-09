// Per-agent timeline, rendered into #timeline for the selected agent. Owner: Bia (dados).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
// Reads only: lastBoard, selectedAgentId, getAgent, getPersonName, getAgentColor, escapeHtml,
// formatTime, getLastActivityAt, KIND_LABELS, addBoardListener.

const TIMELINE_WINDOW_MS = 2 * 3600000;
const TIMELINE_GRID_MS = 30 * 60000;
const MEETING_END_TEXT = "Terminou a reunião";

// The window ends at the next whole minute, so the HTML only changes when
// the data does or a minute passes (no flicker on every 10 s re-render).
function getTimelineRange() {
  const end = Math.ceil(Date.now() / 60000) * 60000;
  return { start: end - TIMELINE_WINDOW_MS, end };
}

function getTimeMs(iso) {
  return new Date(iso).getTime();
}

// Where a segment stops when nothing later closes it: now while the agent is
// still at it, otherwise its last sign of life.
function getOpenEndMs(agent, isStillOpen, range) {
  if (isStillOpen) return range.end;
  const lastAt = getLastActivityAt(agent);
  return lastAt ? getTimeMs(lastAt) : range.end;
}

// Every moment the agent showed signs of life (log entries and file saves), sorted.
function getActivityTimes(agent) {
  const times = (agent.log ?? []).map((entry) => getTimeMs(entry.at));
  for (const event of lastBoard.fileEvents ?? []) {
    if (event.agentId === agent.id) times.push(getTimeMs(event.at));
  }
  return times.sort((a, b) => a - b);
}

// A step lasts from its start to the last activity before the next step, so
// idle time (standby between tasks) shows as a gap instead of a long bar.
// The agent's current step runs until now.
function buildStepSegments(agent, range) {
  const steps = (agent.log ?? []).filter((entry) => entry.kind === "step");
  const activity = getActivityTimes(agent);
  return steps.map((entry, index) => {
    const startMs = getTimeMs(entry.at);
    const nextMs = steps[index + 1] ? getTimeMs(steps[index + 1].at) : Infinity;
    const isCurrent = nextMs === Infinity && agent.status === "doing";
    const lastActivityMs = activity.filter((t) => t >= startMs && t < nextMs).pop() ?? startMs;
    const minimumEndMs = Math.min(startMs + 60000, nextMs);
    return {
      startMs,
      endMs: isCurrent ? range.end : Math.max(lastActivityMs, minimumEndMs),
      text: entry.text,
      kind: "step",
      isCurrent,
    };
  });
}

function buildMeetingSegments(agent, range) {
  const entries = (agent.log ?? []).filter((entry) => entry.kind === "meeting");
  const segments = [];
  entries.forEach((entry, index) => {
    if (entry.text === MEETING_END_TEXT) return;
    const next = entries[index + 1];
    const isOpen = !next && agent.meeting?.topic === entry.text;
    const people = (entry.with ?? []).map((id) => getPersonName(id)).join(", ");
    segments.push({
      startMs: getTimeMs(entry.at),
      endMs: next ? getTimeMs(next.at) : getOpenEndMs(agent, isOpen, range),
      text: people ? `${entry.text} (com ${people})` : entry.text,
      kind: "meeting",
      isCurrent: isOpen,
    });
  });
  return segments;
}

// A question blocks the agent until Gustavo replies or it logs something else.
function buildQuestionSegments(agent, range) {
  const log = agent.log ?? [];
  const replies = agent.replies ?? [];
  const segments = [];
  log.forEach((entry, index) => {
    if (entry.kind !== "question") return;
    const nextLog = log.slice(index + 1).find((other) => other.kind !== "question");
    const reply = replies.find((r) => r.at > entry.at);
    const candidates = [nextLog?.at, reply?.at].filter(Boolean).map(getTimeMs);
    const isOpen = candidates.length === 0 && agent.status === "blocked";
    segments.push({
      startMs: getTimeMs(entry.at),
      endMs: candidates.length ? Math.min(...candidates) : getOpenEndMs(agent, isOpen, range),
      text: entry.text,
      kind: "question",
      isCurrent: isOpen,
    });
  });
  return segments;
}

function buildDecisionMarkers(agent) {
  return (agent.log ?? [])
    .filter((entry) => entry.kind === "decision")
    .map((entry) => ({ atMs: getTimeMs(entry.at), text: entry.text, kind: "decision" }));
}

function buildFileTicks(agentId) {
  return (lastBoard.fileEvents ?? [])
    .filter((event) => event.agentId === agentId)
    .map((event) => ({ atMs: getTimeMs(event.at), text: event.path, kind: "edit" }));
}

function isInRange(startMs, endMs, range) {
  return endMs >= range.start && startMs <= range.end;
}

function getPercent(ms, range) {
  const clamped = Math.min(Math.max(ms, range.start), range.end);
  return ((clamped - range.start) / (range.end - range.start)) * 100;
}

function createTipText(kind, startMs, endMs, text) {
  const label = KIND_LABELS[kind] ?? kind;
  const when = endMs && endMs - startMs >= 60000
    ? `${formatTime(new Date(startMs).toISOString())}–${formatTime(new Date(endMs).toISOString())}`
    : formatTime(new Date(startMs).toISOString());
  return `${label} · ${when}\n${text}`;
}

function createSegmentsHtml(segments, range) {
  return segments
    .filter((s) => isInRange(s.startMs, s.endMs, range))
    .map((s) => {
      const left = getPercent(s.startMs, range);
      const width = Math.max(getPercent(s.endMs, range) - left, 0.4);
      const tip = escapeHtml(createTipText(s.kind, s.startMs, s.endMs, s.text));
      return `<span class="tl-seg tl-${s.kind}${s.isCurrent ? " tl-current" : ""}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" data-tip="${tip}" aria-label="${tip}" tabindex="0"></span>`;
    })
    .join("");
}

function createPointsHtml(points, range) {
  return points
    .filter((p) => isInRange(p.atMs, p.atMs, range))
    .map((p) => {
      const tip = escapeHtml(createTipText(p.kind, p.atMs, null, p.text));
      return `<span class="tl-point tl-${p.kind}" style="left:${getPercent(p.atMs, range).toFixed(3)}%" data-tip="${tip}" aria-label="${tip}" tabindex="0"></span>`;
    })
    .join("");
}

function createGridHtml(range) {
  const lines = [];
  for (let at = Math.ceil(range.start / TIMELINE_GRID_MS) * TIMELINE_GRID_MS; at <= range.end; at += TIMELINE_GRID_MS) {
    const label = new Date(at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    lines.push(`<span class="tl-grid" style="left:${getPercent(at, range).toFixed(3)}%"><span>${label}</span></span>`);
  }
  return lines.join("");
}

function createLaneHtml(label, contentHtml) {
  return `<div class="tl-lane"><span class="tl-lane-label">${label}</span><div class="tl-track">${contentHtml}</div></div>`;
}

function createTimelineHtml(agent) {
  const range = getTimelineRange();
  const steps = buildStepSegments(agent, range);
  const meetings = buildMeetingSegments(agent, range);
  const questions = buildQuestionSegments(agent, range);
  const decisions = buildDecisionMarkers(agent);
  const files = buildFileTicks(agent.id);
  const hasAny = [...steps, ...meetings, ...questions].some((s) => isInRange(s.startMs, s.endMs, range))
    || [...decisions, ...files].some((p) => isInRange(p.atMs, p.atMs, range));

  const body = hasAny
    ? [
        createLaneHtml("Passos", createSegmentsHtml(steps, range)),
        createLaneHtml("Reuniões", createSegmentsHtml(meetings, range)),
        createLaneHtml("Perguntas", createSegmentsHtml(questions, range)),
        createLaneHtml("Decisões", createPointsHtml(decisions, range)),
        createLaneHtml("Ficheiros", createPointsHtml(files, range)),
        `<div class="tl-axis"><span class="tl-lane-label"></span><div class="tl-track">${createGridHtml(range)}</div></div>`,
      ].join("")
    : `<p class="tl-empty">Sem atividade nas últimas 2 horas.</p>`;

  return `<section class="tl" style="--agent-color:${escapeHtml(getAgentColor(agent.id))}" aria-label="Linha do tempo de ${escapeHtml(agent.name)}">
    <h2>Últimas 2 horas</h2>${body}</section>`;
}

function renderTimeline() {
  const el = document.getElementById("timeline");
  if (!el) return;
  const agent = selectedAgentId ? getAgent(selectedAgentId) : null;
  const html = agent ? createTimelineHtml(agent) : "";
  if (el.dataset.html === html) return;
  hideTimelineTip();
  el.innerHTML = html;
  el.dataset.html = html;
}

// ---------- Hover tooltip (one shared element, outside the re-rendered HTML) ----------
function getTimelineTip() {
  let tip = document.getElementById("tl-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "tl-tip";
    tip.setAttribute("role", "tooltip");
    document.body.appendChild(tip);
  }
  return tip;
}

function showTimelineTip(target) {
  const tip = getTimelineTip();
  tip.textContent = target.dataset.tip;
  tip.classList.add("visible");
  const box = target.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, box.left + box.width / 2 - tipBox.width / 2), window.innerWidth - tipBox.width - 8);
  const top = box.top - tipBox.height - 8 < 8 ? box.bottom + 8 : box.top - tipBox.height - 8;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${top + window.scrollY}px`;
}

function hideTimelineTip() {
  document.getElementById("tl-tip")?.classList.remove("visible");
}

function handleTimelinePointer(event) {
  const target = event.target.closest?.("[data-tip]");
  if (target) showTimelineTip(target);
  else hideTimelineTip();
}

function attachTimelineEvents() {
  const el = document.getElementById("timeline");
  if (!el) return;
  el.addEventListener("mouseover", handleTimelinePointer);
  el.addEventListener("focusin", handleTimelinePointer);
  el.addEventListener("mouseleave", hideTimelineTip);
  el.addEventListener("focusout", hideTimelineTip);
}

attachTimelineEvents();
addBoardListener(renderTimeline);
