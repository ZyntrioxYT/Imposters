import { colorForName } from "./names.js";
import * as Game from "./game.js";

const el = (id) => document.getElementById(id);

let state = null;
let selectedTargetId = null;
let dayTallyPreview = null; // {targetId: count} shown before verdict is revealed

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
    renderGame();
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

// ---------- GAME RENDER ----------

function renderGame() {
  const human = Game.humanPlayer(state);
  el("round-label").textContent = `Round ${state.round}`;

  const phaseBadge = el("phase-label");
  const isNight = state.phase === "night";
  phaseBadge.textContent = isNight ? "Night" : phaseLabelForDay();
  phaseBadge.className = "phase-badge" + (isNight ? " phase-night" : "");

  const roleReminder = el("role-reminder");
  if (!human.alive) {
    roleReminder.innerHTML = `You were ${human.deathReason === "murdered" ? "murdered" : "banished"}. You are watching as a spirit.`;
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

  renderLog();
  renderPlayersGrid();
  renderActionPanel();
}

function phaseLabelForDay() {
  if (state.phase === "day-reveal") return "Morning";
  if (state.phase === "day-vote") return "Round Table";
  if (state.phase === "end") return "Game Over";
  return "Day";
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
      card.addEventListener("click", () => {
        selectedTargetId = selectedTargetId === p.id ? null : p.id;
        renderGame();
      });
    }

    grid.appendChild(card);
  });
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
  if (!human.alive) return false;
  if (!p.alive) return false;

  if (state.phase === "night" && human.role === "traitor") {
    return p.role === "faithful";
  }
  if (state.phase === "day-vote" && !dayTallyPreview) {
    return p.id !== human.id;
  }
  return false;
}

// ---------- ACTION PANEL ----------

function renderActionPanel() {
  const panel = el("action-panel");
  panel.innerHTML = "";
  const human = Game.humanPlayer(state);

  if (state.phase === "night") {
    renderNightAction(panel, human);
  } else if (state.phase === "day-reveal") {
    renderMorningAction(panel);
  } else if (state.phase === "day-vote") {
    renderVoteAction(panel, human);
  } else if (state.phase === "end") {
    renderEndTransition();
  }
}

function renderNightAction(panel, human) {
  if (human.alive && human.role === "traitor") {
    const p = document.createElement("p");
    p.textContent = "Choose a Faithful to murder tonight.";
    panel.appendChild(p);

    const btn = makeButton("Confirm Murder", () => {
      if (!selectedTargetId) return;
      const target = selectedTargetId;
      selectedTargetId = null;
      Game.resolveNightMurder(state, target);
      renderGame();
    });
    btn.disabled = !selectedTargetId;
    panel.appendChild(btn);
  } else {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = human.alive
      ? "The Traitors are choosing a victim in the shadows..."
      : "Night falls. You cannot act, but you may watch.";
    panel.appendChild(p);

    panel.appendChild(
      makeButton("Continue", () => {
        const targetId = Game.botMurderTarget(state);
        Game.resolveNightMurder(state, targetId);
        renderGame();
      })
    );
  }
}

function renderMorningAction(panel) {
  const p = document.createElement("p");
  p.textContent = "The castle gathers to discuss the night's events.";
  panel.appendChild(p);

  panel.appendChild(
    makeButton("Continue to the Round Table", () => {
      Game.generateChatter(state, 3).forEach((line) =>
        Game.addLog(state, line, "chatter")
      );
      state.phase = "day-vote";
      selectedTargetId = null;
      dayTallyPreview = null;
      renderGame();
    })
  );
}

function renderVoteAction(panel, human) {
  if (!dayTallyPreview) {
    if (human.alive) {
      const p = document.createElement("p");
      p.textContent = "Cast your vote to banish a suspected Traitor.";
      panel.appendChild(p);

      const btn = makeButton("Confirm Vote", () => {
        castAllVotes(human.id, selectedTargetId);
      });
      btn.disabled = !selectedTargetId;
      panel.appendChild(btn);
    } else {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "You cannot vote, but the table proceeds without you.";
      panel.appendChild(p);
      panel.appendChild(makeButton("Continue", () => castAllVotes(null, null)));
    }
  } else {
    const p = document.createElement("p");
    p.textContent = "The votes are in.";
    panel.appendChild(p);
    panel.appendChild(
      makeButton("Reveal Verdict", () => {
        dayTallyPreview = null;
        Game.resolveDayVotes(state);
        selectedTargetId = null;
        renderGame();
      })
    );
  }
}

function castAllVotes(humanId, humanTargetId) {
  if (humanId && humanTargetId) {
    Game.castVote(state, humanId, humanTargetId);
    const target = Game.getPlayer(state, humanTargetId);
    Game.addLog(state, `You vote for <b>${escapeHtml(target.name)}</b>.`);
  }

  Game.livingPlayers(state)
    .filter((p) => !p.isHuman)
    .forEach((bot) => {
      const targetId = Game.botDayVote(state, bot);
      Game.castVote(state, bot.id, targetId);
      const target = Game.getPlayer(state, targetId);
      Game.addLog(state, `${escapeHtml(bot.name)} votes for <b>${escapeHtml(target.name)}</b>.`);
    });

  const tally = {};
  Object.values(state.dayVotes).forEach((id) => {
    tally[id] = (tally[id] || 0) + 1;
  });
  dayTallyPreview = tally;
  selectedTargetId = null;
  renderGame();
}

function renderEndTransition() {
  const panel = el("action-panel");
  panel.innerHTML = "";
  panel.appendChild(
    makeButton("See Results", () => {
      showEndScreen();
    })
  );
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
    state = null;
    selectedTargetId = null;
    dayTallyPreview = null;
    el("setup-error").textContent = "";
    showScreen("screen-setup");
  });
}
