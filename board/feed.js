// Activity feed, its search box and its filters. Owner: Inês (pwa).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.

// ---------- State (feed only) ----------
let feedQuery = "";
// Keys of grouped "Gravou" entries the user expanded; kept across live re-renders.
const openFeedGroups = new Set();

// ---------- Search box (rendered once, above the kind filters) ----------
function createFeedSearch() {
  const filters = document.getElementById("kind-filters");
  if (!filters || document.getElementById("feed-search")) return;
  const wrap = document.createElement("div");
  wrap.className = "feed-search";
  wrap.innerHTML = `<input id="feed-search" type="search" placeholder="Pesquisar texto, ficheiro ou pessoa" aria-label="Pesquisar na atividade" autocomplete="off" spellcheck="false">`;
  filters.parentNode.insertBefore(wrap, filters);
  const input = wrap.querySelector("input");
  input.addEventListener("input", () => {
    feedQuery = input.value;
    renderFeed(lastBoard.agents);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !input.value) return;
    event.stopPropagation(); // Esc clears the search first, before any page-level Esc handler.
    input.value = "";
    feedQuery = "";
    renderFeed(lastBoard.agents);
  });
}

function renderKindFilters() {
  createFeedSearch();
  document.getElementById("kind-filters").innerHTML = Object.entries(KIND_LABELS).map(([kind, label]) =>
    `<button data-kind="${kind}" class="${hiddenKinds.has(kind) ? "" : "on"}">${label}</button>`).join("");
}

// ---------- Icons and time buckets (visual only) ----------
// 16px stroke icons (Lucide-style paths), coloured by CSS per kind.
const FEED_ICON_PATHS = {
  step: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  decision: '<path d="M12 3v3"/><path d="M5 9h14l-2 4H7z"/><path d="M12 13v8"/>',
  meeting: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M15.5 14.6c2.9.2 5.5 2 5.5 5.4"/>',
  reply: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  strike: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  test: '<path d="M20 6 9 17l-5-5"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17h.01"/>',
};

function createKindIcon(kind) {
  const paths = FEED_ICON_PATHS[kind] ?? '<circle cx="12" cy="12" r="3"/>';
  return `<svg class="kind-icon ${escapeHtml(kind)}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

// Upper bounds in minutes for the sticky separators; anything older is "Há mais de 6 h".
const FEED_BUCKETS = [[1, "Agora"], [5, "Há 5 min"], [15, "Há 15 min"], [30, "Há 30 min"], [60, "Há 1 h"], [120, "Há 2 h"], [360, "Há 6 h"]];

function getFeedBucket(iso, now) {
  const minutes = (now - new Date(iso)) / 60000;
  const bucket = FEED_BUCKETS.find(([limit]) => minutes < limit);
  return bucket ? bucket[1] : "Há mais de 6 h";
}

// ---------- Entries ----------
function getEntryText(e) {
  if (e.kind === "meeting" && e.with?.length) return `com ${e.with.map(getPersonName).join(", ")} — ${e.text}`;
  return e.text;
}

/** Lowercase without accents, so "reuniao" finds "Reunião". */
function normalizeSearchText(text) {
  return String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every search term must appear in the entry's text, path, agent name/id or kind label. */
function isEntryMatching(e, terms) {
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText([getEntryText(e), e.agent.name, e.agent.id, KIND_LABELS[e.kind] ?? e.kind].join(" "));
  return terms.every((term) => haystack.includes(term));
}

function collectEntries(agents) {
  const visible = getVisibleAgents(agents);
  const fileEntries = (lastBoard.fileEvents ?? []).flatMap((e) => {
    const agent = visible.find((a) => a.id === e.agentId);
    return agent ? [{ at: e.at, kind: "edit", text: e.path, agent }] : [];
  });
  const replyEntries = visible.flatMap((a) => (a.replies ?? []).map((r) => ({ at: r.at, kind: "reply", text: `Gustavo: ${r.text}`, agent: a })));
  const strikeEntries = visible.flatMap((a) => getStrikes(a).map((s, i) => ({
    at: s.at, kind: "strike", agent: a,
    text: `${i + 1}/${MAX_STRIKES} · ${s.reason} (por ${s.by ?? "pm"})${i + 1 >= MAX_STRIKES ? " · Despedido" : ""}`,
  })));
  const terms = normalizeSearchText(feedQuery).split(/\s+/).filter(Boolean);
  return visible
    .flatMap((a) => (a.log ?? []).map((e) => ({ ...e, agent: a })))
    .concat(fileEntries, replyEntries, strikeEntries)
    .filter((e) => !hiddenKinds.has(e.kind) && isEntryMatching(e, terms))
    .sort((x, y) => y.at.localeCompare(x.at))
    .slice(0, 150);
}

/** Consecutive "Gravou" entries by the same agent become one group (newest first). */
function groupFileSaves(entries) {
  const items = [];
  for (const e of entries) {
    const last = items.at(-1);
    if (e.kind === "edit" && last?.kind === "edit" && last.agent.id === e.agent.id) {
      if (last.group) last.group.push(e);
      else items[items.length - 1] = { kind: "edit", agent: e.agent, at: last.at, group: [last, e] };
      continue;
    }
    items.push(e);
  }
  return items;
}

/** Longest shared folder of the paths, e.g. "src/server/" (empty when none). */
function getCommonFolder(paths) {
  const folders = paths.map((p) => p.split("/").slice(0, -1));
  const shared = [];
  for (let i = 0; folders.every((parts) => i < parts.length && parts[i] === folders[0][i]); i += 1) shared.push(folders[0][i]);
  return shared.length ? `${shared.join("/")}/` : "";
}

function createEntryHead(e, at) {
  return `<div class="head">${createKindIcon(e.kind)}<span class="who"><span class="swatch"></span>${escapeHtml(e.agent.name)}${isFired(e.agent) ? " (despedido)" : ""}</span><span class="kind ${escapeHtml(e.kind)}">${KIND_LABELS[e.kind] ?? escapeHtml(e.kind)}</span><time class="time" datetime="${escapeHtml(at)}">${formatTime(at)}</time></div>`;
}

function createEntryHtml(e) {
  return `<div class="entry ${e.kind === "strike" ? "strike" : ""}" style="--agent-color:${getAgentColor(e.agent.id)}">
    ${createEntryHead(e, e.at)}
    <div class="text">${escapeHtml(getEntryText(e))}</div>
  </div>`;
}

function createGroupHtml(item) {
  const files = item.group;
  // Key on the agent and the oldest save, which stays stable while newer saves join the group.
  const key = `${item.agent.id}|${files.at(-1).at}`;
  const unique = [...new Set(files.map((f) => f.text))];
  const folder = getCommonFolder(unique);
  const summary = `Gravou ${files.length} ficheiros${folder ? ` · ${folder}…` : ""}`;
  const list = files.map((f) => `<li><span class="path">${escapeHtml(f.text)}</span><span class="time">${formatTime(f.at)}</span></li>`).join("");
  return `<details class="entry group" data-group="${escapeHtml(key)}" style="--agent-color:${getAgentColor(item.agent.id)}"${openFeedGroups.has(key) ? " open" : ""}>
    <summary>${createEntryHead(item, item.at)}<div class="text">${escapeHtml(summary)}</div></summary>
    <ul class="files">${list}</ul>
  </details>`;
}

function renderFeed(agents) {
  const items = groupFileSaves(collectEntries(agents));
  const emptyText = feedQuery.trim() ? "Nada encontrado para esta pesquisa." : "Sem atividade.";
  if (!items.length) {
    document.getElementById("feed").innerHTML = `<div class="feed-empty">${emptyText}</div>`;
    return;
  }
  // Newest first; a sticky separator opens each time bucket ("Agora", "Há 15 min"…).
  const now = Date.now();
  const sections = [];
  for (const item of items) {
    const label = getFeedBucket(item.at, now);
    if (sections.at(-1)?.label !== label) sections.push({ label, html: [] });
    sections.at(-1).html.push(item.group ? createGroupHtml(item) : createEntryHtml(item));
  }
  document.getElementById("feed").innerHTML = sections.map((section) =>
    `<section class="feed-section"><h3 class="feed-sep">${section.label}</h3>${section.html.join("")}</section>`).join("");
}

// ---------- Events ----------
document.getElementById("kind-filters").addEventListener("click", (event) => {
  const kind = event.target.closest("button")?.dataset.kind;
  if (!kind) return;
  if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
  else hiddenKinds.add(kind);
  renderAll();
});

// <details> "toggle" doesn't bubble; capture it on the feed to remember open groups.
document.getElementById("feed").addEventListener("toggle", (event) => {
  const key = event.target.dataset?.group;
  if (!key) return;
  if (event.target.open) openFeedGroups.add(key);
  else openFeedGroups.delete(key);
}, true);
