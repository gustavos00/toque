// Summary, "Precisa de atenção", agent cards and the detail panel. Owner: Leonor (quadro); visual polish (stats, avatars, rings): Bia (dados).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
// ---------- Small visual pieces (avatar, progress ring, stat tile) ----------
// A 2D head-and-shoulders built from the same LOOKS as the office (getLook gives the fallback).
function createAvatarHtml(id, extraClass = "") {
  const look = getLook(id);
  const classes = [
    "avatar",
    `hair-${look.hairStyle ?? "short"}`,
    look.glasses ? "has-glasses" : "",
    look.cap ? "has-cap" : "",
    look.headphones ? "has-headphones" : "",
    look.beard ? "has-beard" : "",
    extraClass,
  ].filter(Boolean).join(" ");
  const style = `--skin:${look.skin};--hair:${look.hair};--shirt:${look.color};--cap:${look.cap ?? look.hair}`;
  return `<span class="${classes}" style="${escapeHtml(style)}" aria-hidden="true"><span class="av-body"></span><span class="av-head"></span><span class="av-hair"></span><span class="av-extra"></span></span>`;
}

function createProgressRingHtml(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const label = `${done}/${total} tarefas feitas`;
  return `<span class="progress-ring" style="--pct:${pct}" role="img" aria-label="${label}" title="${label}"></span>`;
}

// Zero tiles are dimmed so the non-zero ones stand out.
function createStatTileHtml(value, label, tone = "", isZero = value === 0) {
  return `<span class="stat ${tone}${isZero ? " is-zero" : ""}"><b>${value}</b><span>${label}</span></span>`;
}

// ---------- Side panel ----------
function getVisibleAgents(agents) {
  return selectedAgentId ? agents.filter((a) => a.id === selectedAgentId) : agents;
}

function renderSummary(agents) {
  const tasks = agents.flatMap((a) => a.tasks ?? []);
  const done = tasks.filter((t) => t.status === "done").length;
  const working = agents.filter((a) => a.status === "doing").length;
  const meetings = getMeetingGroups(agents).length;
  const standby = agents.filter((a) => a.status === "done" && !isFired(a)).length;
  const silent = agents.filter((a) => getSilentMs(a)).length;
  const el = document.getElementById("summary");
  el.classList.add("stats");
  // The sentence stays as the accessible name; the tiles are the visual.
  const sentence = `${agents.length} agentes · ${working} a trabalhar · ${standby} em standby · ${silent} sem feedback · ${meetings} ${meetings === 1 ? "reunião" : "reuniões"} · ${done}/${tasks.length} tarefas feitas`;
  const html = agents.length
    ? [
        createStatTileHtml(agents.length, "agentes"),
        createStatTileHtml(working, "a trabalhar", working ? "is-doing" : ""),
        createStatTileHtml(standby, "standby"),
        createStatTileHtml(meetings, meetings === 1 ? "reunião" : "reuniões"),
        createStatTileHtml(silent, "sem feedback", silent ? "is-warn" : ""),
        createStatTileHtml(`${done}<small>/${tasks.length}</small>`, "tarefas feitas", "", tasks.length === 0),
      ].join("")
    : `<span class="stat-empty">Ainda sem agentes</span>`;
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  el.setAttribute("aria-label", agents.length ? sentence : "Ainda sem agentes");
}

function renderNeedsYou(agents) {
  const blocked = agents.filter((a) => a.status === "blocked" && !isFired(a));
  const silent = agents.filter((a) => getSilentMs(a));
  const el = document.getElementById("needs-you");
  if (!blocked.length && !silent.length) { setHtmlKeepingInputs(el, ""); return; }
  const blockedItems = blocked.map((a) => {
    const question = [...(a.log ?? [])].reverse().find((e) => e.kind === "question");
    return `<li><b>${escapeHtml(a.name)}</b>: ${escapeHtml(question?.text ?? a.currentStep ?? "bloqueado")}${createRepliesHtml(a, 2)}${createReplyForm(a, "banner")}</li>`;
  });
  const silentItems = silent.map((a) => `<li class="warn"><b>${escapeHtml(a.name)}</b>: ⏱ ${formatSilence(getSilentMs(a))} (está "Em curso")</li>`);
  setHtmlKeepingInputs(el, `<div class="needs-you"><strong>Precisa de atenção</strong><ul>${[...blockedItems, ...silentItems].join("")}</ul></div>`);
}

function renderDetail() {
  const el = document.getElementById("detail");
  const a = selectedAgentId && getAgent(selectedAgentId);
  if (!a) { setHtmlKeepingInputs(el, ""); return; }
  const tasks = a.tasks ?? [];
  const done = tasks.filter((t) => t.status === "done").length;
  const lastFile = getLastFileEvent(a.id);
  const lastActivityAt = getLastActivityAt(a);
  const strikes = getStrikes(a);
  const strikesHtml = strikes.length
    ? `<ol class="strike-list">${strikes.map((s) => `<li>${escapeHtml(s.reason)} <span class="sub">(${escapeHtml(s.by ?? "pm")}, ${formatTime(s.at)})</span></li>`).join("")}</ol>
       <div class="meta"><button class="danger" data-unstrike="${escapeHtml(a.id)}">Retirar a última penalização</button></div>`
    : "";
  const silentMs = getSilentMs(a);
  const meeting = isMeetingActive(a) ? `<div class="now">💬 Em reunião com ${escapeHtml(a.meeting.with.map(getPersonName).join(", "))}: ${escapeHtml(a.meeting.topic)}</div>` : "";
  setHtmlKeepingInputs(el, `<div class="detail" style="--agent-color:${getAgentColor(a.id)}">
    <div class="top">
      <span class="who">${createAvatarHtml(a.id, "avatar-lg")}<span class="who-text"><span class="name">${escapeHtml(a.name)} ${createStrikeBadge(a)}</span><span class="role">${escapeHtml(a.role)}</span></span></span>
      ${createStatusPill(a)}
    </div>
    <div class="now">${escapeHtml(a.currentStep || (a.status === "done" ? "Em standby." : "—"))}</div>
    ${meeting}
    ${silentMs ? `<div class="warn-line">⏱ ${formatSilence(silentMs)}</div>` : ""}
    ${strikesHtml}
    ${lastFile ? `<div class="meta"><span title="${escapeHtml(lastFile.path)}">✎ ${escapeHtml(getFileName(lastFile.path))}</span><span data-ago="${lastFile.at}">${formatAgo(lastFile.at)}</span></div>` : ""}
    <div class="meta progress">${createProgressRingHtml(done, tasks.length)}<span class="progress-text">${done}/${tasks.length} tarefas</span><span data-ago="${lastActivityAt ?? ""}">${formatAgo(lastActivityAt)}</span></div>
    ${createRepliesHtml(a, 3)}
    ${createReplyForm(a, "detail")}
    <div class="meta"><button class="close" id="clear-selection">Ver todos</button></div>
  </div>`);
}

function renderAgents(agents) {
  const el = document.getElementById("agents");
  document.getElementById("filter-hint").textContent = selectedAgentId ? `· só ${getPersonName(selectedAgentId)} (clica outra vez para ver todos)` : "";
  if (activeView !== "agents") return;
  el.innerHTML = getSeatIds(agents).map(getAgent).map((a) => {
    const tasks = a.tasks ?? [];
    const done = tasks.filter((t) => t.status === "done").length;
    const lastFile = getLastFileEvent(a.id);
    const lastActivityAt = getLastActivityAt(a);
    const silentMs = getSilentMs(a);
    const unread = getUnreadReplies(a).length;
    return `<button class="agent ${a.id === selectedAgentId ? "selected" : ""} ${isFired(a) ? "fired" : ""}" data-id="${escapeHtml(a.id)}" style="--agent-color:${getAgentColor(a.id)}">
      <div class="top">
        <span class="who"><span class="avatar-wrap">${createAvatarHtml(a.id)}<span class="card-pulse" data-active-agent="${escapeHtml(a.id)}"></span></span><span class="who-text"><span class="name">${escapeHtml(a.name)}</span><span class="role">${escapeHtml(a.role)}</span></span></span>
        <span class="right">${createStrikeBadge(a)}${createStatusPill(a)}</span>
      </div>
      <div class="now">${escapeHtml(a.currentStep || (a.status === "done" ? "Em standby." : "—"))}</div>
      ${silentMs ? `<div class="warn-line">⏱ ${formatSilence(silentMs)}</div>` : ""}
      ${unread ? `<div class="warn-line" style="color:var(--accent)">✉ ${unread} resposta${unread > 1 ? "s" : ""} tua${unread > 1 ? "s" : ""} por ler</div>` : ""}
      ${lastFile ? `<div class="last-file" title="${escapeHtml(lastFile.path)}">✎ ${escapeHtml(getFileName(lastFile.path))} · <span data-ago="${lastFile.at}">${formatAgo(lastFile.at)}</span></div>` : ""}
      <div class="meta progress">${createProgressRingHtml(done, tasks.length)}<span class="progress-text">${done}/${tasks.length} tarefas</span><span data-ago="${lastActivityAt ?? ""}">${formatAgo(lastActivityAt)}</span></div>
    </button>`;
  }).join("");
}

// ---------- Work items: every task of every agent ----------
const VIEW_KEY = "toque-board-view";
const WORK_ITEM_ORDER = ["doing", "blocked", "todo", "done"];
let activeView = readStoredView();
let workItemStatus = "all";

function readStoredView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "items" ? "items" : "agents";
  } catch {
    return "agents";
  }
}

function setView(view) {
  activeView = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice only lasts for this visit.
  }
  renderAll();
}

function getWorkItems(agents) {
  return getVisibleAgents(agents)
    .flatMap((a) => (a.tasks ?? []).map((t) => ({ ...t, agent: a })))
    .sort((x, y) => WORK_ITEM_ORDER.indexOf(x.status) - WORK_ITEM_ORDER.indexOf(y.status)
      || getSeatIds(agents).indexOf(x.agent.id) - getSeatIds(agents).indexOf(y.agent.id));
}

function renderViewTabs(agents) {
  for (const button of document.querySelectorAll("#view-tabs button")) button.classList.toggle("on", button.dataset.view === activeView);
  document.getElementById("agents").hidden = activeView !== "agents";
  document.getElementById("work-items").hidden = activeView !== "items";
  const items = getWorkItems(agents);
  const open = items.filter((t) => t.status !== "done").length;
  document.getElementById("items-count").textContent = `${open} abertos · ${items.length}`;
}

function renderWorkItems(agents) {
  if (activeView !== "items") return;
  const el = document.getElementById("work-items");
  const items = getWorkItems(agents);
  const query = (el.querySelector("input[data-key='wi-search']")?.value ?? "").trim().toLowerCase();
  const chips = [["all", "Todos"], ...WORK_ITEM_ORDER.map((s) => [s, STATUS_LABELS[s]])].map(([status, label]) => {
    const count = status === "all" ? items.length : items.filter((t) => t.status === status).length;
    return `<button class="wi-chip ${workItemStatus === status ? "on" : ""}" data-wi-status="${status}">${label} ${count}</button>`;
  }).join("");
  const shown = items.filter((t) => (workItemStatus === "all" || t.status === workItemStatus)
    && (!query || `${t.title} ${t.agent.name}`.toLowerCase().includes(query)));
  const rows = shown.map((t) => `<tr class="wi-row ${t.status === "done" ? "is-done" : ""}" data-id="${escapeHtml(t.agent.id)}" style="--agent-color:${getAgentColor(t.agent.id)}">
      <td class="wi-status"><span class="pill ${escapeHtml(t.status)}">${STATUS_LABELS[t.status] ?? escapeHtml(t.status)}</span></td>
      <td class="wi-title">${escapeHtml(t.title)}</td>
      <td class="wi-agent">${createAvatarHtml(t.agent.id, "avatar-xs")}${escapeHtml(t.agent.name)}</td>
    </tr>`).join("");
  const table = shown.length
    ? `<table class="wi-table"><thead><tr><th>Estado</th><th>Work item</th><th>Agente</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="wi-empty">Nenhum work item com estes filtros.</div>`;
  setHtmlKeepingInputs(el, `<div class="wi-tools"><input data-key="wi-search" type="search" placeholder="Procurar work item ou agente…" autocomplete="off">${chips}</div>${table}`);
}

document.getElementById("view-tabs").addEventListener("click", (event) => {
  const view = event.target.closest("button")?.dataset.view;
  if (view) setView(view);
});

document.getElementById("work-items").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-wi-status]");
  if (chip) {
    workItemStatus = chip.dataset.wiStatus;
    renderAll();
    return;
  }
  const row = event.target.closest(".wi-row");
  if (row) selectAgent(row.dataset.id);
});

document.getElementById("work-items").addEventListener("input", () => renderAll());
