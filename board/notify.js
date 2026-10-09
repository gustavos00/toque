// Sounds and system notifications; UI goes in #notify-slot. Owner: Rui (motor).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
// Everything lives in this IIFE so nothing here leaks into the shared globals.
(() => {
  const STORAGE_KEY = "toque-board-notify";
  const GUSTAVO_ID = "gustavo";

  let isEnabled = readStoredChoice();
  let audioContext = null;
  // Snapshot of the previous board; null until the first board arrives (nothing fires on load).
  let previous = null;

  function readStoredChoice() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      return false;
    }
  }

  function storeChoice(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      // Private mode / blocked storage: the toggle still works for this visit.
    }
  }

  function canUseNotifications() {
    return typeof Notification !== "undefined";
  }

  function getPermissionHint() {
    if (!canUseNotifications()) return " (este browser não suporta notificações; só som)";
    if (Notification.permission === "denied") return " (notificações bloqueadas no browser; só som)";
    return "";
  }

  // ---------- UI ----------
  function renderToggle() {
    const slot = document.getElementById("notify-slot");
    if (!slot) return;
    let button = slot.querySelector("button.notify-toggle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "notify-toggle";
      button.addEventListener("click", toggleNotifications);
      slot.appendChild(button);
    }
    const label = isEnabled ? "Alertas ligados" : "Alertas desligados";
    button.textContent = isEnabled ? "🔔" : "🔕";
    button.classList.toggle("on", isEnabled);
    button.setAttribute("aria-pressed", String(isEnabled));
    button.setAttribute("aria-label", label);
    button.title = `${label}: bloqueios, reuniões contigo e penalizações${isEnabled ? getPermissionHint() : ""}`;
  }

  async function toggleNotifications() {
    isEnabled = !isEnabled;
    storeChoice(isEnabled);
    if (isEnabled) {
      // Both need a user gesture, which this click is.
      unlockAudio();
      if (canUseNotifications() && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // Older browsers: callback-style API; ignore, sound still works.
        }
      }
      playBeep();
    }
    renderToggle();
  }

  // ---------- Sound (WebAudio, no files) ----------
  function unlockAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext ??= new AudioCtor();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playBeep() {
    const ctx = unlockAudio();
    if (!ctx) return;
    const start = ctx.currentTime;
    // Two short tones, soft attack/release so it doesn't click.
    [880, 1320].forEach((frequency, i) => {
      const at = start + i * 0.16;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.15);
    });
  }

  function showNotification(alert) {
    if (!canUseNotifications() || Notification.permission !== "granted") return;
    try {
      const notification = new Notification(alert.title, { body: alert.body, tag: alert.tag, icon: "/favicon.ico" });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error(error);
    }
  }

  // ---------- Diff ----------
  function createSnapshot(board) {
    const agents = new Map();
    for (const agent of board.agents ?? []) {
      agents.set(agent.id, {
        status: agent.status,
        strikeCount: getStrikes(agent).length,
        meetingKey: agent.meeting ? `${agent.meeting.since}|${agent.meeting.topic}` : null,
      });
    }
    return agents;
  }

  function isWithGustavo(agent) {
    return Boolean(agent.meeting) && (agent.id === GUSTAVO_ID || (agent.meeting.with ?? []).includes(GUSTAVO_ID));
  }

  function findAlerts(board, before) {
    const alerts = [];
    for (const agent of board.agents ?? []) {
      const was = before.get(agent.id);
      const name = getPersonName(agent.id);

      if (agent.status === "blocked" && was?.status !== "blocked" && !isFired(agent)) {
        const question = [...(agent.log ?? [])].reverse().find((entry) => entry.kind === "question");
        alerts.push({
          title: `${name} está bloqueado`,
          body: question?.text ?? agent.currentStep ?? "Precisa de ti no quadro.",
          tag: `blocked-${agent.id}`,
        });
      }

      const strikes = getStrikes(agent);
      if (strikes.length > (was?.strikeCount ?? 0)) {
        const latest = strikes[strikes.length - 1];
        alerts.push({
          title: isFired(agent) ? `${name} foi despedido` : `${name} levou uma penalização (${strikes.length}/${MAX_STRIKES})`,
          body: latest?.reason ?? "",
          tag: `strike-${agent.id}-${strikes.length}`,
        });
      }

      const meetingKey = agent.meeting ? `${agent.meeting.since}|${agent.meeting.topic}` : null;
      if (meetingKey && meetingKey !== was?.meetingKey && isWithGustavo(agent)) {
        const others = (agent.meeting.with ?? []).filter((id) => id !== GUSTAVO_ID).map(getPersonName);
        alerts.push({
          title: `Reunião contigo: ${agent.meeting.topic}`,
          body: `Com ${[name, ...others].join(", ")}.`,
          tag: `meeting-${agent.id}-${agent.meeting.since}`,
        });
      }
    }
    return alerts;
  }

  function handleBoard(board) {
    renderToggle();
    const snapshot = createSnapshot(board);
    const before = previous;
    previous = snapshot;
    if (!before || !isEnabled) return;
    const alerts = findAlerts(board, before);
    if (alerts.length === 0) return;
    playBeep();
    alerts.forEach(showNotification);
  }

  renderToggle();
  addBoardListener(handleBoard);
})();
