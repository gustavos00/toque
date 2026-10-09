// Wiring: render loop, live stream and page events. Owner: Leonor (quadro).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
function renderAll() {
  const agents = lastBoard.agents;
  renderSummary(agents);
  renderNeedsYou(agents);
  updateScene(agents);
  renderDetail();
  renderViewTabs(agents);
  renderAgents(agents);
  renderWorkItems(agents);
  renderKindFilters();
  renderFeed(agents);
  notifyBoardListeners();
}

function selectAgent(id) {
  selectedAgentId = selectedAgentId === id || !getAgent(id) ? null : id;
  renderAll();
}

function connectStream() {
  const live = document.getElementById("live");
  const liveText = document.getElementById("live-text");
  const stream = new EventSource("/api/stream");
  stream.onopen = () => { live.classList.remove("off"); liveText.textContent = "ao vivo"; };
  stream.onmessage = (event) => { lastBoard = JSON.parse(event.data); renderAll(); };
  // EventSource reconnects by itself; just show the state meanwhile.
  stream.onerror = () => { live.classList.add("off"); liveText.textContent = "a religar…"; };
}

document.getElementById("office-wrap").addEventListener("click", (event) => {
  const target = event.target.closest("[data-agent]");
  if (target) selectAgent(target.dataset.agent);
});

document.getElementById("detail").addEventListener("click", async (event) => {
  if (event.target.id === "clear-selection") selectAgent(null);
  const unstrikeId = event.target.dataset.unstrike;
  if (unstrikeId && confirm(`Retirar a última penalização a ${getPersonName(unstrikeId)}?`)) {
    await postBoardAction("/api/unstrike", { agentId: unstrikeId });
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("input");
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  if (await postBoardAction("/api/reply", { agentId: form.dataset.agent, text })) input.value = "";
  input.disabled = false;
  input.focus();
});

document.getElementById("agents").addEventListener("click", (event) => {
  const card = event.target.closest(".agent");
  if (card) selectAgent(card.dataset.id);
});

function setTvMode(isOn) {
  document.body.classList.toggle("tv", isOn);
  document.getElementById("tv-toggle").textContent = isOn ? "Sair do modo TV" : "📺 Modo TV";
  fitStage();
}

document.getElementById("tv-toggle").addEventListener("click", () => {
  const isOn = !document.body.classList.contains("tv");
  setTvMode(isOn);
  if (isOn) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen();
});

// Leaving full screen (Esc) also leaves TV mode.
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && document.body.classList.contains("tv")) setTvMode(false);
});

if (new URLSearchParams(location.search).has("tv")) setTvMode(true);

window.addEventListener("resize", fitStage);
connectStream();
setInterval(updateClocks, CLOCK_MS);
// Silence warnings grow with time, not with board events.
setInterval(() => { if (lastBoard.generatedAt) renderAll(); }, RERENDER_MS);
