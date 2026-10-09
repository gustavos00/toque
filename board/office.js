// The 3D office (CSS 3D). Owner: Leonor (quadro).
// Plain script (no modules): shares globals with the other board/*.js files, loaded in order by index.html.
// ---------- 3D building blocks ----------
// A cuboid on the floor plane: x/y on the floor, z up. "all" adds the back faces for things that turn around.
function createBox(x, y, z, w, d, h, color, opts = {}) {
  const faces = [
    `<i class="t" style="width:${w}px;height:${d}px;transform:translateZ(${h}px)">${opts.top ?? ""}</i>`,
    `<i class="f" style="width:${w}px;height:${h}px;transform:translate3d(0,${d}px,${h}px) rotateX(-90deg)">${opts.front ?? ""}</i>`,
    `<i class="s" style="width:${d}px;height:${h}px;transform:translate3d(${w}px,0,${h}px) rotateZ(90deg) rotateX(-90deg)"></i>`,
  ];
  if (opts.all) {
    faces.push(`<i class="k" style="width:${w}px;height:${h}px;transform:translate3d(0,0,${h}px) rotateX(-90deg)"></i>`);
    faces.push(`<i class="l" style="width:${d}px;height:${h}px;transform:translate3d(0,0,${h}px) rotateZ(90deg) rotateX(-90deg)"></i>`);
  }
  return `<div class="b3 ${opts.cls ?? ""}" style="transform:translate3d(${x}px,${y}px,${z}px);--c:${color}">${faces.join("")}</div>`;
}

function createPersonBox(x, y, z, w, d, h, color, opts = {}) {
  return createBox(x, y, z, w, d, h, color, { ...opts, all: true });
}

function createGroup(x, y, z, inner, cls = "") {
  return `<div class="g" style="transform:translate3d(${x}px,${y}px,${z}px)"><div class="g ${cls}">${inner}</div></div>`;
}

// Wall planes: the back wall (y = 0) reads left to right; the side wall (x = 0) holds no text.
function createBackWallPlane(x, z, w, h, cls, inner = "") {
  return `<div class="plane ${cls}" style="width:${w}px;height:${h}px;transform:translate3d(${x}px,0,${z + h}px) rotateX(-90deg)">${inner}</div>`;
}

function createSideWallPlane(y, w, h, cls, inner = "") {
  return `<div class="plane ${cls}" style="width:${w}px;height:${h}px;transform:translate3d(0,${y}px,${h}px) rotateZ(90deg) rotateX(-90deg)">${inner}</div>`;
}

function createFloorPlane(x, y, w, d, cls, inner = "", z = 0.5) {
  return `<div class="plane ${cls}" style="width:${w}px;height:${d}px;transform:translate3d(${x}px,${y}px,${z}px)">${inner}</div>`;
}

// A soft contact shadow on the floor: a radial gradient that fades out, no filter (cheap in 3D).
function createFloorShadow(cx, cy, w, d, strength = "") {
  return createFloorPlane(cx - w / 2, cy - d / 2, w, d, `soft-shadow ${strength}`, "", 0.9);
}

// ---------- People ----------
function createFaceHtml(look) {
  let html = `<b class="eye" style="left:6px"></b><b class="eye" style="left:15px"></b><b class="mouth"></b>`
    + `<b class="cheek" style="left:2px"></b><b class="cheek" style="left:18px"></b>`;
  if (look.glasses) html += `<b class="glasses"><b style="left:3.5px"></b><b style="left:12.5px"></b></b><b class="glasses-bridge"></b>`;
  return html;
}

function createTorsoFrontHtml(look) {
  if (look.top === "hoodie") return `<b class="t-neck"></b><b class="h-str" style="left:13px"></b><b class="h-str" style="left:20px"></b><b class="h-pocket"></b>`;
  if (look.top === "shirt") return `<b class="s-collar" style="left:7px;transform:skewY(20deg)"></b><b class="s-collar" style="left:17px;transform:skewY(-20deg)"></b><b class="s-btns"></b>`;
  if (look.top === "blazer") return `<b class="b-inner"></b><b class="b-tie"></b>`;
  return `<b class="t-neck"></b>`;
}

function createHairHtml(look) {
  const hair = look.hair;
  if (look.hairStyle === "buzz") return createPersonBox(-12.5, -11.5, 23, 25, 23, 4, hair) + createPersonBox(-12.5, -12, 8, 25, 2, 16, hair);
  let html = createPersonBox(-13, -12, 24, 26, 24, 5, hair);
  if (look.hairStyle === "long") {
    html += createPersonBox(-13, -15, -22, 26, 5, 49, hair)
      + createPersonBox(-15, -11, -8, 3, 16, 34, hair) + createPersonBox(12, -11, -8, 3, 16, 34, hair)
      + createPersonBox(-12, 10.5, 19, 24, 2, 6, hair);
  } else {
    html += createPersonBox(-13, -13.5, 6, 26, 3, 21, hair)
      + createPersonBox(-14, -11, 13, 2, 14, 13, hair) + createPersonBox(12, -11, 13, 2, 14, 13, hair)
      + createPersonBox(-12, 10.5, 22, 24, 1.5, 3, hair);
  }
  if (look.hairStyle === "bun") html += createPersonBox(-6, -11, 28, 12, 12, 10, hair);
  return html;
}

function createAccessoriesHtml(look) {
  let html = "";
  if (look.beard) html += createPersonBox(-12, 10.5, -1, 24, 2.5, 9, look.hair) + createPersonBox(-6, 11, 7, 12, 2, 2.5, look.hair);
  if (look.cap) html += createPersonBox(-13.5, -12.5, 24, 27, 25, 7, look.cap) + createPersonBox(-12, 11, 24, 24, 11, 2, look.cap);
  if (look.headphones) {
    html += createPersonBox(-14, -2, 30, 28, 4, 3, "#222") + createPersonBox(-16, -2, 16, 3, 4, 15, "#222") + createPersonBox(13, -2, 16, 3, 4, 15, "#222")
      + createPersonBox(-17, -5, 7, 5, 10, 11, "#2d2d2d") + createPersonBox(12, -5, 7, 5, 10, 11, "#2d2d2d");
  }
  return html;
}

function createArmHtml(look, side) {
  const x = side === "l" ? -21.5 : 21.5;
  const sleeve = look.top === "tee" ? look.skin : look.color;
  let forearm = createPersonBox(-4, -4, -4, 8, 34, 8, sleeve) + createPersonBox(-3.5, 32, -3.5, 7, 8, 7, look.skin);
  if (side === "r") {
    const puffs = [0, 1, 2].map(() => `<div class="g puff">${createPersonBox(-2, -2, 0, 4, 4, 4, "#d6d6d6")}</div>`).join("");
    forearm += `<div class="g prop prop-mug">${createPersonBox(-5, 31, 3.5, 10, 10, 12, "#f3f1ea") + createPersonBox(5, 34, 7, 3, 4, 6, "#f3f1ea")}</div>`
      + `<div class="g prop prop-cig">${createPersonBox(-1, 38, 2, 2, 9, 2, "#f5f5f5") + createPersonBox(-1, 47, 2, 2, 2, 2, "#ff5a1f")}`
      + `<div class="g" style="transform:translate3d(0,48px,5px)">${puffs}</div></div>`;
  }
  const upper = createPersonBox(-4.5, -4.5, -22, 9, 9, 25, look.color) + createGroup(0, 0, -17, forearm, "el");
  return `<div class="g arm-${side}" style="transform:translate3d(${x}px,0,95px)"><div class="g sh">${upper}</div></div>`;
}

function createLegHtml(look, side) {
  const x = side === "l" ? -15 : 2;
  const shin = createPersonBox(0.5, -5, -46, 12, 10, 46, look.pants) + createPersonBox(0.5, -6, -52, 12, 17, 6, "#1d1d1d");
  const thigh = createPersonBox(0, -6, -6, 13, 36, 12, look.pants) + createGroup(0, 26, 0, shin, "knee-rot");
  return `<div class="g leg-${side}" style="transform:translate3d(${x}px,0,52px)"><div class="g thigh-rot">${thigh}</div></div>`;
}

function createPersonHtml(id, look) {
  let torso = createPersonBox(-17, -10, 52, 34, 20, 46, look.color, { front: createTorsoFrontHtml(look) });
  if (look.top === "hoodie") torso += createPersonBox(-14, -14, 86, 28, 5, 14, look.color);
  const head = createPersonBox(-12, -11, 0, 24, 22, 26, look.skin, { front: createFaceHtml(look) })
    + createHairHtml(look) + createAccessoriesHtml(look);
  const body = createLegHtml(look, "l") + createLegHtml(look, "r") + torso
    + createPersonBox(-5, -5, 97, 10, 10, 7, look.skin)
    + createArmHtml(look, "l") + createArmHtml(look, "r")
    + createGroup(0, 0, 103, head, "head-rot");
  const shadow = createFloorPlane(-34, -30, 68, 72, "soft-shadow person-shadow", "", 0.9);
  return `<div class="g person" data-agent="${escapeHtml(id)}" style="--agent-color:${look.color};--skin:${look.skin}">${shadow}<div class="g body">${body}</div></div>`;
}

function createDeskHtml(id, look, seat) {
  const parts = [
    createFloorPlane(-100, -70, 200, 190, "ring", "", 0.8),
    createFloorShadow(0, 70, 170, 100), createFloorShadow(0, 0, 64, 64, "light"),
    // Chair (stays at the desk when its owner walks away).
    createBox(-18, -18, 0, 36, 36, 4, "#2a2d33"), createBox(-3, -3, 4, 6, 6, 36, "var(--metal)"),
    createBox(-20, -20, 40, 40, 40, 6, "var(--chair)"), createBox(-20, -28, 46, 40, 7, 62, "var(--chair)"),
    // Desk.
    createBox(-63, 36, 0, 4, 4, 70, "var(--metal)"), createBox(59, 36, 0, 4, 4, 70, "var(--metal)"),
    createBox(-63, 100, 0, 4, 4, 70, "var(--metal)"), createBox(59, 100, 0, 4, 4, 70, "var(--metal)"),
    createBox(-65, 34, 70, DESK_W, 70, 4, "var(--wood)"),
    // Laptop, its lid back facing the room.
    createBox(-19, 38, 74, 38, 24, 2, "#9aa0a8"),
    createBox(-19, 61, 76, 38, 2, 26, "#b7bcc3", { front: `<b class="lid-logo"></b>` }),
    // Mug, papers and the status lamp.
    createBox(-52, 74, 74, 9, 9, 11, "#f3f1ea"),
    createBox(28, 50, 74, 24, 30, 2, "#fbfaf6"),
    createBox(44, 84, 74, 10, 10, 3, "#3a3a3a"), createBox(47, 87, 77, 4, 4, 12, "#3a3a3a"),
    createBox(45, 85, 89, 8, 8, 6, "var(--todo)", { cls: "lamp" }),
  ];
  return `<div class="g desk" data-agent="${escapeHtml(id)}" style="--agent-color:${look.color};transform:translate3d(${seat.x}px,${seat.y}px,0)">${parts.join("")}</div>`;
}

// ---------- Office layout ----------
function getSeatIds(agents) {
  const ids = agents.map((a) => a.id);
  return [...SEAT_ORDER.filter((id) => ids.includes(id)), ...ids.filter((id) => !SEAT_ORDER.includes(id)).sort()];
}

function buildLayout(agents) {
  const seatIds = getSeatIds(agents);
  const rows = Math.max(1, Math.ceil(seatIds.length / COLS));
  const W = FIRST_COL_X + (COLS - 1) * DESK_GAP_X + 160;
  const D = FIRST_ROW_Y + rows * ROW_GAP + 250;
  const seats = new Map(seatIds.map((id, i) => [id, { x: FIRST_COL_X + (i % COLS) * DESK_GAP_X, y: FIRST_ROW_Y + Math.floor(i / COLS) * ROW_GAP }]));
  const tables = [{ x: W * 0.33, y: D - 150 }, { x: W * 0.72, y: D - 150 }];
  const door = { x: 30, y: D - 300 };
  const breakSpots = { coffee: { x: 105, y: 140 }, smoke: { x: 95, y: D - 400 } };
  const L = D * COS45 + MARGIN;
  const T = WALL_H * SIN60 + MARGIN + 40;
  return { W, D, seats, tables, door, breakSpots, L, T, stageW: (W + D) * COS45 + MARGIN * 2, stageH: T + (W + D) * COS45 * 0.5 + MARGIN / 2 };
}

function projectPoint(layout, x, y, z) {
  return { left: layout.L + (x - y) * COS45, top: layout.T + (x + y) * COS45 * 0.5 - z * SIN60 };
}

function createDecorHtml(layout) {
  const { W, D, tables, door, breakSpots } = layout;
  const backWall = createBackWallPlane(0, 0, W, WALL_H, "wall",
    // Centred, ~60% of the wall; it starts right of the coffee corner (x ≤ 124).
    `<div class="whiteboard" id="whiteboard" style="left:${Math.round(W * 0.2)}px;top:16px;width:${Math.round(W * 0.6)}px;height:${WALL_H - 50}px"></div>`);
  const sideWall = createSideWallPlane(0, D, WALL_H, "wall side",
    `<div class="window" style="left:150px;width:200px"></div><div class="window" style="left:420px;width:200px"></div>`
    + `<div class="door" style="left:${door.y - 40}px;width:80px"></div>`);
  let html = backWall + sideWall;
  // Daylight (or moonlight in dark mode) falling through the two side windows.
  html += createFloorPlane(0, 160, 300, 230, "light-patch", "", 0.7) + createFloorPlane(0, 430, 300, 230, "light-patch", "", 0.7);
  html += createFloorPlane(W * 0.12, D - 300, W * 0.82, 260, "rug", `<div class="rug-label">Reuniões</div>`);
  html += createFloorShadow(69, 46, 140, 80);
  for (const t of tables) {
    html += createFloorShadow(t.x, t.y, 130, 130)
      + createBox(t.x - 16, t.y - 16, 0, 32, 32, 3, "var(--metal)") + createBox(t.x - 4, t.y - 4, 3, 8, 8, 95, "var(--metal)")
      + createBox(t.x - 34, t.y - 34, 98, 68, 68, 4, "var(--wood)");
  }
  // Coffee corner (the coffee break spot).
  html += createBox(14, 16, 0, 110, 46, 88, "#8a6a4a") + createBox(26, 22, 88, 30, 28, 40, "#2f2f2f") + createBox(68, 28, 88, 10, 10, 12, "#f3f1ea") + createBox(84, 28, 88, 10, 10, 12, "#f3f1ea");
  // Smoking corner: a standing ashtray by the door.
  const smoke = breakSpots.smoke;
  html += createBox(smoke.x - 9, smoke.y - 9, 0, 18, 18, 3, "#3a3a3a") + createBox(smoke.x - 2, smoke.y - 2, 3, 4, 4, 70, "#5d6168")
    + createBox(smoke.x - 10, smoke.y - 10, 73, 20, 20, 5, "#9aa0a8");
  return html;
}

function buildScene(agents) {
  const layout = buildLayout(agents);
  const stage = document.getElementById("stage");
  stage.classList.add("instant");
  let world = createDecorHtml(layout);
  for (const [id, seat] of layout.seats) world += createDeskHtml(id, getLook(id), seat);
  stage.style.width = `${layout.stageW}px`;
  stage.style.height = `${layout.stageH}px`;
  stage.innerHTML = `<div class="floor" id="floor" style="left:${layout.L}px;top:${layout.T}px;width:${layout.W}px;height:${layout.D}px">${world}</div>`
    + `<div class="overlay" id="overlay" style="width:${layout.stageW}px;height:${layout.stageH}px"></div>`;
  scene = { key: [...layout.seats.keys()].join(), layout, people: new Map(), meetBubbles: [], knownFileAt: getLatestFileAt(), knownTestAt: getLatestTestAt(), isFresh: true };
  for (const id of layout.seats.keys()) addPerson(id, false);
  fitStage();
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove("instant")));
}

function addPerson(id, isVisitor) {
  const look = getLook(id);
  const floor = document.getElementById("floor");
  floor.insertAdjacentHTML("beforeend", createPersonHtml(id, look));
  const el = floor.lastElementChild;
  const overlay = document.getElementById("overlay");
  overlay.insertAdjacentHTML("beforeend", `<div class="tag" data-agent="${escapeHtml(id)}" style="--agent-color:${look.color}"><div class="bubble-wrap"><div class="bubble"></div></div><div class="name"><span class="pulse"></span><span class="label"></span></div></div>`);
  const person = { id, el, tag: overlay.lastElementChild, isVisitor, place: null, walkTimer: null };
  scene.people.set(id, person);
  const start = isVisitor ? { ...scene.layout.door, angle: 90, z: 26, away: true } : getDeskPlace(id);
  placePerson(person, start);
  person.place = start;
  return person;
}

function getDeskPlace(id) {
  const seat = scene.layout.seats.get(id);
  return { x: seat.x, y: seat.y, angle: 0, z: 0 };
}

function placePerson(person, place) {
  person.el.style.transform = `translate3d(${place.x}px,${place.y}px,0) rotateZ(${place.angle}deg)`;
  person.el.classList.toggle("away", Boolean(place.away));
  person.tag.classList.toggle("away", Boolean(place.away));
  setTagPosition(person, projectPoint(scene.layout, place.x, place.y, 150 + (place.z ?? 0)));
}

// Tags move with a CSS transition; the target is kept so overlaps can be solved without reading layout.
function setTagPosition(person, p) {
  person.tagPos = p;
  person.tag.style.left = `${p.left}px`;
  person.tag.style.top = `${p.top}px`;
}

function isSamePlace(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.angle === b.angle && Boolean(a.away) === Boolean(b.away);
}

// On a fresh page everyone is already where they belong: no walking in.
function movePerson(person, place, isInstant) {
  if (isInstant) {
    clearTimeout(person.walkTimer);
    person.place = place;
    placePerson(person, place);
    person.el.classList.remove("walking");
    person.el.classList.toggle("standing", place.z > 0);
    return;
  }
  if (isSamePlace(person.place, place)) return;
  const wasAway = person.place?.away;
  person.place = place;
  if (wasAway) {
    // Appear at the door first, then walk in.
    placePerson(person, { ...scene.layout.door, angle: 90, z: 26 });
    person.el.getBoundingClientRect();
  }
  person.el.classList.add("walking", "standing");
  clearTimeout(person.walkTimer);
  placePerson(person, place);
  person.walkTimer = setTimeout(() => {
    person.el.classList.remove("walking");
    person.el.classList.toggle("standing", place.z > 0);
  }, WALK_MS);
}

// ---------- Meetings ----------
function isMeetingActive(agent) {
  if (!agent.meeting?.with?.length) return false;
  const lastAt = [agent.meeting.since, agent.updatedAt].filter(Boolean).sort().pop();
  return Date.now() - new Date(lastAt) < MEETING_TTL_MS;
}

// Groups everyone connected by an active meeting; each group gets a table.
function getMeetingGroups(agents) {
  const parent = new Map();
  const findRoot = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  const hosts = agents.filter(isMeetingActive).sort((a, b) => a.meeting.since.localeCompare(b.meeting.since));
  for (const host of hosts) for (const other of host.meeting.with) parent.set(findRoot(other), findRoot(host.id));
  const groups = new Map();
  for (const host of hosts) {
    const root = findRoot(host.id);
    if (!groups.has(root)) groups.set(root, { ids: new Set(), topics: [], since: host.meeting.since });
    const group = groups.get(root);
    [host.id, ...host.meeting.with].forEach((id) => group.ids.add(id));
    group.topics.push({ by: host.id, topic: host.meeting.topic });
  }
  return [...groups.values()].map((g) => ({ ...g, ids: [...g.ids] }));
}

function getCirclePlaces(center, count, radius) {
  if (count === 1) return [{ x: center.x + 30, y: center.y + 30, angle: -45, z: 26 }];
  // A pair stands side-on to the camera and turns towards it a little, so both faces show.
  const target = count === 2 ? { x: center.x + 90, y: center.y + 90 } : center;
  return Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count - Math.PI / 4;
    const x = Math.round(center.x + Math.cos(a) * radius);
    const y = Math.round(center.y + Math.sin(a) * radius);
    const angle = Math.round((Math.atan2(-(target.x - x), target.y - y) * 180) / Math.PI);
    return { x, y, angle, z: 26 };
  });
}


// ---------- Updating the scene ----------
function getPose(agent, inMeeting, isHost) {
  if (inMeeting) return isHost ? "talk" : "listen";
  if (!agent) return "listen";
  if (agent.status === "blocked") return "raise";
  if (agent.status === "done") return getBreakKind(agent.id) === "smoke" ? "smoke" : "coffee";
  if (getSilentMs(agent)) return "sleep";
  if (agent.status === "doing" && isActiveNow(agent)) return "typing";
  return "idle";
}

function getBubble(agent) {
  if (!agent) return ["", ""];
  if (isFired(agent)) return ["Despedido", "fired"];
  const silentMs = getSilentMs(agent);
  if (silentMs) return [`💤 ${formatSilence(silentMs)}`, "silent"];
  if (agent.status === "blocked") {
    const question = [...(agent.log ?? [])].reverse().find((e) => e.kind === "question");
    return [`✋ ${question?.text ?? agent.currentStep ?? "Bloqueado"}`, "blocked"];
  }
  if (agent.status === "done") return [`${getBreakKind(agent.id) === "smoke" ? "🚬" : "☕"} Standby`, "done"];
  if (agent.status === "doing") return [agent.currentStep || "", ""];
  return ["", ""];
}

function setPose(person, pose) {
  if (person.el.dataset.pose === pose) return;
  person.el.classList.remove(`pose-${person.el.dataset.pose}`);
  person.el.dataset.pose = pose;
  person.el.classList.add(`pose-${pose}`);
}

function updateScene(agents) {
  const key = getSeatIds(agents).join();
  if (!scene || scene.key !== key) buildScene(agents);
  const groups = getMeetingGroups(agents);
  const meetingPlaces = new Map();
  const hostIds = new Set(groups.flatMap((g) => g.topics.map((t) => t.by)));
  groups.slice(0, scene.layout.tables.length).forEach((group, i) => {
    const places = getCirclePlaces(scene.layout.tables[i], group.ids.length, 80);
    group.ids.forEach((id, j) => meetingPlaces.set(id, places[j]));
  });

  const breakPlaces = new Map();
  for (const kind of ["coffee", "smoke"]) {
    const ids = agents.filter((a) => a.status === "done" && !isFired(a) && !meetingPlaces.has(a.id) && getBreakKind(a.id) === kind).map((a) => a.id);
    const places = getCirclePlaces(scene.layout.breakSpots[kind], ids.length, kind === "coffee" ? 50 : 38);
    ids.forEach((id, i) => breakPlaces.set(id, places[i]));
  }

  for (const id of meetingPlaces.keys()) {
    if (!scene.people.has(id)) addPerson(id, true);
  }

  for (const person of scene.people.values()) {
    const agent = getAgent(person.id);
    const meetingPlace = meetingPlaces.get(person.id);
    const fired = isFired(agent);
    const home = person.isVisitor || fired ? { ...scene.layout.door, angle: 90, z: 26, away: true } : getDeskPlace(person.id);
    movePerson(person, (!fired && meetingPlace) || breakPlaces.get(person.id) || home, scene.isFresh);
    if (fired) {
      // They walk out of the door; their name stays on the empty desk.
      const seat = scene.layout.seats.get(person.id);
      setTagPosition(person, projectPoint(scene.layout, seat.x, seat.y, 150));
      person.tag.classList.remove("away");
    }
    person.tag.classList.toggle("fired", fired);
    setPose(person, getPose(agent, Boolean(meetingPlace), hostIds.has(person.id)));

    const [text, cls] = meetingPlace ? ["", ""] : getBubble(agent);
    const bubble = person.tag.querySelector(".bubble");
    if (bubble.textContent !== text) bubble.textContent = text;
    bubble.className = `bubble ${cls}`;
    bubble.parentElement.className = `bubble-wrap ${cls}${text ? "" : " empty"}`;
    const strikeCount = getStrikes(agent).length;
    person.tag.querySelector(".label").textContent = `${getPersonName(person.id)}${strikeCount ? ` ⚠️${strikeCount}/${MAX_STRIKES}` : ""}`;
    person.tag.classList.toggle("selected", person.id === selectedAgentId);
  }

  for (const desk of document.querySelectorAll(".desk")) {
    const agent = getAgent(desk.dataset.agent);
    desk.dataset.status = agent?.status ?? "todo";
    desk.toggleAttribute("data-fired", isFired(agent));
    desk.classList.toggle("selected", desk.dataset.agent === selectedAgentId);
  }

  scene.isFresh = false;
  renderMeetingBubbles(groups);
  separateLabels();
  renderWhiteboard(agents);
  spawnSaveChips();
  spawnTestChips();
  updateClocks();
}

function renderMeetingBubbles(groups) {
  const overlay = document.getElementById("overlay");
  for (const el of scene.meetBubbles) el.remove();
  scene.meetBubbles = groups.slice(0, scene.layout.tables.length).map((group, i) => {
    const table = scene.layout.tables[i];
    const p = projectPoint(scene.layout, table.x, table.y, 240);
    const names = group.ids.map(getPersonName).join(" ↔ ");
    const topics = group.topics.map((t) => escapeHtml(t.topic)).join("<br>");
    overlay.insertAdjacentHTML("beforeend", `<div class="meet-bubble" style="left:${p.left}px;top:${p.top}px"><div class="who">💬 ${escapeHtml(names)}</div>${topics}</div>`);
    return overlay.lastElementChild;
  });
}

// ---------- Overlap avoidance ----------
// After positioning, nudge overlapping labels upwards so they stay readable. Name tags are placed
// front to back (the one closer to the camera keeps its place); meeting bubbles go last and rise
// above the tags of the people around their table. One batched read of sizes, pure math on the
// target positions (not the mid-walk ones), then one batch of writes.
function separateLabels() {
  const people = [...scene.people.values()].filter((p) => p.tagPos && !p.tag.classList.contains("away"));
  const tagItems = people.map((p) => ({ el: p.tag, ...p.tagPos, w: p.tag.offsetWidth, h: p.tag.offsetHeight, nudge: 0 }));
  // Meeting bubbles sit 10px above their anchor (see .meet-bubble in office.css).
  const meetItems = scene.meetBubbles.map((el) => ({
    el, left: parseFloat(el.style.left), top: parseFloat(el.style.top) - 10, w: el.offsetWidth, h: el.offsetHeight, nudge: 0,
  }));
  const placed = [];
  for (const item of [...tagItems.sort((a, b) => b.top - a.top), ...meetItems]) {
    liftAbove(item, placed);
    placed.push(item);
  }
  for (const item of placed) {
    const value = `${Math.round(item.nudge)}px`;
    if (item.el.style.getPropertyValue("--nudge") !== value) item.el.style.setProperty("--nudge", value);
  }
}

// Moves `item` up (its anchor is its bottom-centre) until it clears every placed label.
function liftAbove(item, placed) {
  const GAP = 4;
  for (let pass = 0; pass < placed.length + 1; pass++) {
    const bottom = item.top + item.nudge;
    const hit = placed.find((o) => Math.abs(o.left - item.left) < (o.w + item.w) / 2
      && bottom > o.top + o.nudge - o.h - GAP && bottom - item.h < o.top + o.nudge + GAP);
    if (!hit) return;
    item.nudge = hit.top + hit.nudge - hit.h - GAP - item.top;
  }
}

function renderWhiteboard(agents) {
  const el = document.getElementById("whiteboard");
  if (!el) return;
  const tasks = agents.flatMap((a) => (a.tasks ?? []).map((t) => ({ ...t, agent: a })));
  const cols = STATUS_COLUMNS.map(([status, label]) =>
    `<div class="wb-col" style="color:var(--${status})"><b>${tasks.filter((t) => t.status === status).length}</b>${label}</div>`).join("");
  // Three lines fit the board at its larger type size.
  const doing = tasks.filter((t) => t.status === "doing").slice(0, 3)
    .map((t) => `<div class="wb-doing">▸ ${escapeHtml(t.title)} <span style="color:${getAgentColor(t.agent.id)}">(${escapeHtml(t.agent.name)})</span></div>`).join("");
  el.innerHTML = `<div class="wb-title">Quadro de tarefas</div><div class="wb-cols">${cols}</div>${doing}`;
}

function getLatestFileAt() {
  return (lastBoard.fileEvents ?? []).at(-1)?.at ?? "";
}

function getTestEntries() {
  return lastBoard.agents.flatMap((a) => (a.log ?? []).filter((e) => e.kind === "test").map((e) => ({ ...e, agentId: a.id })));
}

function getLatestTestAt() {
  return getTestEntries().map((e) => e.at).sort().pop() ?? "";
}

function isFailedTest(text) {
  return /falh|fail|vermelh|erro|✗|❌/i.test(text);
}

function spawnChip(agentId, html, cls, delayIndex) {
  const person = scene.people.get(agentId);
  if (!person || person.place?.away) return;
  const p = projectPoint(scene.layout, person.place.x, person.place.y + 50, 115);
  const overlay = document.getElementById("overlay");
  overlay.insertAdjacentHTML("beforeend", `<div class="save-chip ${cls}" style="--agent-color:${getAgentColor(agentId)};left:${p.left}px;top:${p.top}px;animation-delay:${delayIndex * 0.25}s">${html}</div>`);
  const chip = overlay.lastElementChild;
  chip.addEventListener("animationend", () => chip.remove());
}

// A green or red label over the laptop when someone reports a test run.
function spawnTestChips() {
  const fresh = getTestEntries().filter((e) => e.at > scene.knownTestAt).sort((a, b) => a.at.localeCompare(b.at)).slice(-4);
  scene.knownTestAt = getLatestTestAt() || scene.knownTestAt;
  fresh.forEach((e, i) => {
    const failed = isFailedTest(e.text);
    spawnChip(e.agentId, `🧪 ${failed ? "Testes falharam" : "Testes passaram"}`, `test ${failed ? "failed" : "passed"}`, i);
  });
}

// A little floating label over the laptop each time someone saves a file.
function spawnSaveChips() {
  const fresh = (lastBoard.fileEvents ?? []).filter((e) => e.at > scene.knownFileAt).slice(-8);
  scene.knownFileAt = getLatestFileAt() || scene.knownFileAt;
  fresh.forEach((e, i) => spawnChip(e.agentId, `✎ ${escapeHtml(getFileName(e.path))}`, "", i));
}

function fitStage() {
  if (!scene) return;
  const wrap = document.getElementById("office-wrap");
  const stage = document.getElementById("stage");
  const { stageW, stageH } = scene.layout;
  let scale = Math.min(wrap.clientWidth / stageW, 1.2);
  if (document.body.classList.contains("tv")) {
    // TV mode: the whole office fits the screen.
    const freeHeight = window.innerHeight - wrap.getBoundingClientRect().top - 12;
    scale = Math.min(wrap.clientWidth / stageW, freeHeight / stageH);
  }
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${Math.max(0, (wrap.clientWidth - stageW * scale) / 2)}px`;
  wrap.style.height = `${Math.round(stageH * scale)}px`;
}

function updateClocks() {
  for (const el of document.querySelectorAll("[data-ago]")) el.textContent = formatAgo(el.dataset.ago);
  for (const el of document.querySelectorAll("[data-active-agent]")) {
    const agent = getAgent(el.dataset.activeAgent);
    el.classList.toggle("on", Boolean(agent) && isActiveNow(agent));
  }
  if (!scene) return;
  for (const person of scene.people.values()) {
    const agent = getAgent(person.id);
    const isActive = Boolean(agent) && isActiveNow(agent);
    person.tag.querySelector(".pulse").classList.toggle("on", isActive);
    document.querySelector(`.desk[data-agent="${CSS.escape(person.id)}"]`)?.classList.toggle("active", isActive);
    if (agent && (person.el.dataset.pose === "typing") !== (getPose(agent, false) === "typing") && !person.place?.z) {
      setPose(person, getPose(agent, false));
    }
  }
}
