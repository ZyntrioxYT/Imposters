import { colorForName } from "./names.js";
import { pickRandomMission } from "./missions.js";
import * as Game from "./game.js";

const el = (id) => document.getElementById(id);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let state = null;
let selectedTargetId = null;
let uiMode = "none"; // 'select-murder' | 'select-vote' | 'none'
let dayTallyPreview = null; // {targetId: count} shown before the verdict resolves
let missionCleanup = null;

export function startApp() {
  wireSetupScreen();
  wireRevealScreen();
  wireRestart();
}

// ---------- SETUP ----------

function wireSetupScreen() {
  const playersInput = el("input-players");
  const traitorsInput = el("input-traitors");
  const playersLabel = el("label-players");
  const traitorsLabel = el("label-traitors");

  function clampTraitorMax() {
    const players = parseInt(playersInput.value, 10);
    const max = Math.max(1, Math.floor(players / 2) - 1);
    traitorsInput.max = String(max);
    if (parseInt(traitorsInput.value, 10) > max) traitorsInput.value = String(max);
    traitorsLabel.textContent = traitorsInput.value;
  }

  playersInput.addEventListener("input", () => {
    playersLabel.textContent = playersInput.value;
    clampTraitorMax();
  });
  traitorsInput.addEventListener("input", () => {
    traitorsLabel.textContent = traitorsInput.value;
  });

  clampTraitorMax();

  el("btn-start").addEventListener("click", () => {
    const name = el("input-name").value.trim() || "You";
    const playerCount = parseInt(playersInput.value, 10);
    const traitorCount = parseInt(traitorsInput.value, 10);

    if (traitorCount < 1 || traitorCount >= playerCount) {
      el("setup-error").textContent = "Invalid traitor count for this many players.";
      return;
    }

    state = Game.createGame({ humanName: name, playerCount, traitorCount });
    showScreen("screen-reveal");
    renderReveal();
  });
}

// ---------- REVEAL ----------

function wireRevealScreen() {
  el("btn-reveal").addEventListener("click", () => {
    el("reveal-card").classList.add("flipped");
    el("btn-reveal").classList.add("hidden");
    el("btn-continue").classList.remove("hidden");
  });

  el("btn-continue").addEventListener("click", () => {
    showScreen("screen-game");
    playNight();
  });
}

function renderReveal() {
  const human = Game.humanPlayer(state);
  el("reveal-card").classList.remove("flipped");
  el("btn-reveal").classList.remove("hidden");
  el("btn-continue").classList.add("hidden");

  const roleEl = el("reveal-role");
  const descEl = el("reveal-desc");

  if (human.role === "traitor") {
    roleEl.textContent = "TRAITOR";
    roleEl.className = "reveal-role traitor";
    const allies = state.players.filter(
      (p) => p.role === "traitor" && p.id !== human.id
    );
    descEl.textContent =
      allies.length > 0
        ? `You conspire with ${allies.map((a) => a.name).join(" and ")}. Murder by night, deceive by day.`
        : `You alone must murder by night and deceive by day.`;
  } else {
    roleEl.textContent = "FAITHFUL";
    roleEl.className = "reveal-role";
    descEl.textContent = `Survive the nights. Root out the Traitors by day.`;
  }
}

// ---------- SCREEN SWITCHING ----------

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(id).classList.add("active");
}

function resetUiState() {
  selectedTargetId = null;
  uiMode = "none";
  dayTallyPreview = null;
  if (missionCleanup) {
    missionCleanup();
    missionCleanup = null;
  }
}

// ---------- SHARED RENDER ----------

function renderHeader() {
  const human = Game.humanPlayer(state);
  el("round-label").textContent = `Round ${state.round}`;

  const phaseBadge = el("phase-label");
  phaseBadge.textContent = phaseLabelFor(state.phase);
  phaseBadge.className = "phase-badge" + (state.phase === "night" ? " phase-night" : "");

  const roleReminder = el("role-reminder");
  if (!human.alive) {
    roleReminder.innerHTML = `You were ${
      human.deathReason === "murdered" ? "murdered" : "banished"
    }. You are watching as a spirit.`;
  } else if (human.role === "traitor") {
    const allies = Game.livingPlayers(state).filter(
      (p) => p.role === "traitor" && p.id !== human.id
    );
    roleReminder.innerHTML = `You are a <span class="you-traitor">TRAITOR</span>${
      allies.length ? ` with ${allies.map((a) => a.name).join(", ")}` : ""
    }`;
  } else {
    roleReminder.innerHTML = `You are <span class="you-faithful">FAITHFUL</span>`;
  }
}

function phaseLabelFor(phase) {
  switch (phase) {
    case "night":
      return "Night";
    case "day-reveal":
      return "Morning";
    case "mission":
      return "Mission";
    case "day-vote":
      return "Round Table";
    case "end":
      return "Game Over";
    default:
      return "Day";
  }
}

function renderLog() {
  const panel = el("log-panel");
  panel.innerHTML = state.log
    .map((entry) => `<div class="log-entry ${entry.className || ""}">${entry.text}</div>`)
    .join("");
  panel.scrollTop = panel.scrollHeight;
}

function renderPlayersGrid() {
  const grid = el("players-grid");
  const human = Game.humanPlayer(state);
  grid.innerHTML = "";

  state.players.forEach((p) => {
    const card = document.createElement("div");
    card.className = "player-card";
    if (!p.alive) card.classList.add("dead");
    if (p.isHuman) card.classList.add("you");

    const selectable = isSelectable(p);
    if (selectable) card.classList.add("selectable");
    if (selectedTargetId === p.id) card.classList.add("selected");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = colorForName(p.name);
    avatar.textContent = p.name.slice(0, 2).toUpperCase();
    card.appendChild(avatar);

    if (state.shieldPlayerId === p.id) {
      const shield = document.createElement("div");
      shield.className = "shield-badge";
      shield.textContent = "\u{1F6E1}";
      card.appendChild(shield);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "player-name";
    nameEl.textContent = p.name + (p.isHuman ? " (You)" : "");
    card.appendChild(nameEl);

    const tag = document.createElement("div");
    tag.className = "player-tag";
    tag.textContent = tagFor(p, human);
    if (!p.alive && shouldRevealRole(p)) {
      tag.classList.add(p.role === "traitor" ? "role-traitor" : "role-faithful");
    }
    card.appendChild(tag);

    if (dayTallyPreview && dayTallyPreview[p.id]) {
      const badge = document.createElement("div");
      badge.className = "vote-count";
      badge.textContent = String(dayTallyPreview[p.id]);
      card.appendChild(badge);
    }

    if (selectable) {
      card.addEventListener("click", () => onCardClick(p.id));
    }

    grid.appendChild(card);
  });
}

function onCardClick(playerId) {
  selectedTargetId = selectedTargetId === playerId ? null : playerId;
  renderPlayersGrid();
  if (uiMode === "select-murder") renderActionSelectMurder();
  else if (uiMode === "select-vote") renderActionSelectVote();
}

function shouldRevealRole(p) {
  return state.phase === "end" || p.deathReason === "banished";
}

function tagFor(p, human) {
  if (!p.alive) {
    if (shouldRevealRole(p)) return p.role === "traitor" ? "TRAITOR" : "FAITHFUL";
    return p.deathReason === "murdered" ? "murdered" : "dead";
  }
  if (p.id === human.id && human.role === "traitor") return "Traitor";
  if (p.id === human.id) return "Faithful";
  return "";
}

function isSelectable(p) {
  const human = Game.humanPlayer(state);
  if (!human.alive || !p.alive) return false;
  if (uiMode === "select-murder") return p.role === "faithful";
  if (uiMode === "select-vote") return p.id !== human.id;
  return false;
}

function renderWaitingPanel(text) {
  const panel = el("action-panel");
  panel.innerHTML = `
    <p class="hint">${text}</p>
    <div class="waiting-dots"><span></span><span></span><span></span></div>
  `;
}

function makeButton(text, onClick) {
  const btn = document.createElement("button");
  btn.className = "btn btn-primary";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- GAME FLOW ----------
// Only three points require a human decision: choosing a murder target,
// playing the day's mission, and casting a day vote. Everything else
// (waiting, reveals, chatter, tallies) plays out automatically.

async function proceedOrEnd(session, nextFn) {
  await delay(900);
  if (state !== session) return;
  if (state.phase === "end") {
    await delay(900);
    if (state !== session) return;
    showEndScreen();
  } else {
    nextFn();
  }
}

async function playNight() {
  resetUiState();
  const human = Game.humanPlayer(state);
  renderHeader();
  renderLog();

  if (human.alive && human.role === "traitor") {
    uiMode = "select-murder";
    renderPlayersGrid();
    renderActionSelectMurder();
    return;
  }

  renderPlayersGrid();
  renderWaitingPanel("The Traitors are moving through the shadows...");
  const session = state;
  await delay(1800);
  if (state !== session) return;

  const targetId = Game.botMurderTarget(state);
  Game.resolveNightMurder(state, targetId);
  renderHeader();
  renderPlayersGrid();
  renderLog();
  await proceedOrEnd(session, playMorning);
}

function renderActionSelectMurder() {
  const panel = el("action-panel");
  panel.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = "Choose a Faithful to murder tonight.";
  panel.appendChild(p);

  const btn = makeButton("Confirm Murder", () => {
    if (!selectedTargetId) return;
    const targetId = selectedTargetId;
    const session = state;
    resetUiState();
    Game.resolveNightMurder(state, targetId);
    renderHeader();
    renderPlayersGrid();
    renderLog();
    proceedOrEnd(session, playMorning);
  });
  btn.disabled = !selectedTargetId;
  panel.appendChild(btn);
}

async function playMorning() {
  state.phase = "day-reveal";
  renderHeader();
  renderWaitingPanel("Morning breaks over the castle...");
  const session = state;
  await delay(1700);
  if (state !== session) return;
  playMission();
}

function playMission() {
  resetUiState();
  state.phase = "mission";
  renderHeader();
  const human = Game.humanPlayer(state);
  const session = state;

  if (!human.alive) {
    renderWaitingPanel("The Faithful attempt today's mission without you...");
    (async () => {
      await delay(1400);
      if (state !== session) return;
      playChatter();
    })();
    return;
  }

  const panel = el("action-panel");
  panel.innerHTML = `
    <p class="hint">Today's mission: complete it to win a shield for tonight.</p>
    <div id="mission-mount"></div>
  `;
  const mount = panel.querySelector("#mission-mount");
  const mission = pickRandomMission();
  let resolved = false;

  missionCleanup = mission.play(mount, (success) => {
    if (resolved) return;
    resolved = true;
    missionCleanup = null;
    Game.resolveMissionResult(state, success);
    renderLog();
    renderPlayersGrid();
    (async () => {
      await delay(1200);
      if (state !== session) return;
      playChatter();
    })();
  });
}

async function playChatter() {
  state.phase = "day-vote";
  renderHeader();
  const panel = el("action-panel");
  panel.innerHTML = `<p class="hint">The castle gathers at the Round Table...</p>`;
  const session = state;

  const lines = Game.generateChatter(state, 3);
  for (const line of lines) {
    if (state !== session) return;
    Game.addLog(state, line, "chatter");
    renderLog();
    await delay(650);
  }
  await delay(350);
  if (state !== session) return;
  playVoting();
}

function playVoting() {
  resetUiState();
  renderHeader();
  const human = Game.humanPlayer(state);

  if (human.alive) {
    uiMode = "select-vote";
    renderPlayersGrid();
    renderActionSelectVote();
  } else {
    renderPlayersGrid();
    renderWaitingPanel("You cannot vote, but the table proceeds without you.");
    const session = state;
    (async () => {
      await delay(1200);
      if (state !== session) return;
      castAllVotesAndTally(null, null);
    })();
  }
}

function renderActionSelectVote() {
  const panel = el("action-panel");
  panel.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = "Cast your vote to banish a suspected Traitor.";
  panel.appendChild(p);

  const btn = makeButton("Confirm Vote", () => {
    if (!selectedTargetId) return;
    const targetId = selectedTargetId;
    const humanId = Game.humanPlayer(state).id;
    resetUiState();
    castAllVotesAndTally(humanId, targetId);
  });
  btn.disabled = !selectedTargetId;
  panel.appendChild(btn);
}

async function castAllVotesAndTally(humanId, humanTargetId) {
  renderHeader();
  renderPlayersGrid();
  const panel = el("action-panel");
  panel.innerHTML = `<p class="hint">Casting votes...</p>`;
  const session = state;

  if (humanId && humanTargetId) {
    Game.castVote(state, humanId, humanTargetId);
    const target = Game.getPlayer(state, humanTargetId);
    Game.addLog(state, `You vote for <b>${escapeHtml(target.name)}</b>.`);
    renderLog();
  }

  const bots = Game.livingPlayers(state).filter((p) => !p.isHuman);
  for (const bot of bots) {
    if (state !== session) return;
    const targetId = Game.botDayVote(state, bot);
    Game.castVote(state, bot.id, targetId);
    const target = Game.getPlayer(state, targetId);
    Game.addLog(state, `${escapeHtml(bot.name)} votes for <b>${escapeHtml(target.name)}</b>.`);
    renderLog();
    await delay(280);
  }
  if (state !== session) return;

  const tally = {};
  Object.values(state.dayVotes).forEach((id) => {
    tally[id] = (tally[id] || 0) + 1;
  });
  dayTallyPreview = tally;
  renderPlayersGrid();
  panel.innerHTML = `<p class="hint">The votes are in...</p>`;

  await delay(1800);
  if (state !== session) return;

  dayTallyPreview = null;
  Game.resolveDayVotes(state);
  renderHeader();
  renderLog();
  renderPlayersGrid();
  await proceedOrEnd(session, playNight);
}

// ---------- END SCREEN ----------

function showEndScreen() {
  showScreen("screen-end");
  const human = Game.humanPlayer(state);
  const humanWon =
    (state.winner === "faithful" && human.role === "faithful") ||
    (state.winner === "traitors" && human.role === "traitor");

  el("end-title").textContent =
    state.winner === "faithful" ? "The Faithful Win" : "The Traitors Win";
  el("end-subtitle").textContent =
    (humanWon ? "You won. " : "You lost. ") + state.winReason;

  const roster = el("end-roster");
  roster.innerHTML = "";
  state.players.forEach((p) => {
    const row = document.createElement("div");
    row.className = "end-row";
    const status = p.alive ? "Survived" : p.deathReason === "murdered" ? "Murdered" : "Banished";
    row.innerHTML = `<span>${escapeHtml(p.name)}${p.isHuman ? " (You)" : ""} — ${status}</span><span class="${
      p.role === "traitor" ? "role-traitor" : "role-faithful"
    }">${p.role.toUpperCase()}</span>`;
    roster.appendChild(row);
  });
}

function wireRestart() {
  el("btn-restart").addEventListener("click", () => {
    resetUiState();
    state = null;
    el("setup-error").textContent = "";
    showScreen("screen-setup");
  });
}
