import { pickBotNames } from "./names.js";

const CHATTER_TEMPLATES = [
  "{a} glances across the table at {b}.",
  "{a} says the murder felt personal.",
  "{a} points out that {b} has been quiet all round.",
  "{a} insists they'd never turn on the group.",
  "{a} and {b} exchange a nervous look.",
  "{a} reminds everyone to trust their gut.",
  "{a} says {b}'s story doesn't add up.",
  "The table falls silent as {a} stares at the empty chair.",
  "{a} says the Traitors must be getting nervous by now.",
  "{a} accuses {b} of deflecting.",
];

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `p${idCounter}`;
}

export function createGame({ humanName, playerCount, traitorCount }) {
  const name = (humanName || "").trim() || "You";
  const botNames = pickBotNames(playerCount - 1, name);

  const players = [
    { id: nextId(), name, isHuman: true, role: "faithful", alive: true },
    ...botNames.map((n) => ({
      id: nextId(),
      name: n,
      isHuman: false,
      role: "faithful",
      alive: true,
    })),
  ];

  // Shuffle and assign traitors
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  shuffled.slice(0, traitorCount).forEach((p) => (p.role = "traitor"));

  const state = {
    players,
    round: 1,
    phase: "night",
    log: [],
    winner: null,
    winReason: "",
    pendingMurderTargetId: null,
    dayVotes: {},
    suspicion: {},
    shieldPlayerId: null,
  };

  players.forEach((p) => (state.suspicion[p.id] = 0));

  addLog(state, `Round 1 begins. The castle falls silent as night draws in.`, "night");
  return state;
}

export function addLog(state, text, className = "") {
  state.log.push({ text, className });
}

export function getPlayer(state, id) {
  return state.players.find((p) => p.id === id);
}

export function humanPlayer(state) {
  return state.players.find((p) => p.isHuman);
}

export function livingPlayers(state) {
  return state.players.filter((p) => p.alive);
}

export function livingTraitors(state) {
  return livingPlayers(state).filter((p) => p.role === "traitor");
}

export function livingFaithful(state) {
  return livingPlayers(state).filter((p) => p.role === "faithful");
}

function weightedRandom(candidates, weightFn) {
  const weights = candidates.map((c) => Math.max(1, weightFn(c)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// --- Night phase ---

export function botMurderTarget(state) {
  const targets = livingFaithful(state);
  if (targets.length === 0) return null;
  return weightedRandom(targets, (p) => 1 + (state.suspicion[p.id] || 0)).id;
}

export function resolveNightMurder(state, targetId) {
  if (targetId && targetId === state.shieldPlayerId) {
    const protectedPlayer = getPlayer(state, targetId);
    addLog(
      state,
      `The Traitors struck at <b>${escapeName(protectedPlayer.name)}</b>, but they were protected by a shield!`,
      "dramatic"
    );
  } else {
    const victim = targetId ? getPlayer(state, targetId) : null;
    if (victim) {
      victim.alive = false;
      victim.deathReason = "murdered";
      addLog(state, `<b>${escapeName(victim.name)}</b> was murdered in the night.`, "dramatic");
    } else {
      addLog(state, `The Traitors could not agree on a victim. No one was murdered.`, "dramatic");
    }
  }

  state.shieldPlayerId = null;
  state.pendingMurderTargetId = null;
  state.phase = "day-reveal";

  checkWinCondition(state);
}

// --- Mission phase ---

export function resolveMissionResult(state, success) {
  const human = humanPlayer(state);
  if (success) {
    state.shieldPlayerId = human.id;
    addLog(state, `You completed the mission and won a <b>shield</b> for tonight!`, "win");
  } else {
    addLog(state, `The mission was not completed. No shield tonight.`, "dramatic");
  }
}

// --- Day phase ---

export function botDayVote(state, bot) {
  const living = livingPlayers(state).filter((p) => p.id !== bot.id);
  if (bot.role === "traitor") {
    const faithfulTargets = living.filter((p) => p.role === "faithful");
    const pool = faithfulTargets.length > 0 ? faithfulTargets : living;
    return weightedRandom(pool, (p) => 1 + (state.suspicion[p.id] || 0)).id;
  }
  return weightedRandom(living, (p) => 1 + (state.suspicion[p.id] || 0) * 2).id;
}

export function castVote(state, voterId, targetId) {
  state.dayVotes[voterId] = targetId;
}

export function generateChatter(state, count = 3) {
  const living = livingPlayers(state);
  const lines = [];
  for (let i = 0; i < count && living.length >= 2; i++) {
    const template = CHATTER_TEMPLATES[Math.floor(Math.random() * CHATTER_TEMPLATES.length)];
    let a = living[Math.floor(Math.random() * living.length)];
    let b = living[Math.floor(Math.random() * living.length)];
    let guard = 0;
    while (b.id === a.id && guard < 5) {
      b = living[Math.floor(Math.random() * living.length)];
      guard++;
    }
    lines.push(template.replace("{a}", escapeName(a.name)).replace("{b}", escapeName(b.name)));
  }
  return lines;
}

export function resolveDayVotes(state) {
  const tally = {};
  Object.values(state.dayVotes).forEach((targetId) => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  Object.entries(tally).forEach(([id, count]) => {
    state.suspicion[id] = (state.suspicion[id] || 0) + count;
  });

  let maxVotes = -1;
  let topCandidates = [];
  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      topCandidates = [id];
    } else if (count === maxVotes) {
      topCandidates.push(id);
    }
  });

  const banishedId =
    topCandidates.length > 0
      ? topCandidates[Math.floor(Math.random() * topCandidates.length)]
      : null;

  state.lastTally = tally;
  state.lastBanishedId = banishedId;

  if (banishedId) {
    const banished = getPlayer(state, banishedId);
    banished.alive = false;
    banished.deathReason = "banished";
    addLog(
      state,
      `<b>${escapeName(banished.name)}</b> was banished with ${maxVotes} vote${maxVotes === 1 ? "" : "s"}. They were a <b>${banished.role.toUpperCase()}</b>.`,
      banished.role === "traitor" ? "win" : "dramatic"
    );
  } else {
    addLog(state, `No one received a majority. No one was banished.`, "dramatic");
  }

  state.dayVotes = {};
  state.phase = "night";
  state.round += 1;

  const win = checkWinCondition(state);
  if (!win) {
    addLog(state, `Round ${state.round} begins. Night falls over the castle.`, "night");
  }
}

export function checkWinCondition(state) {
  const traitors = livingTraitors(state);
  const faithful = livingFaithful(state);

  if (traitors.length === 0) {
    state.winner = "faithful";
    state.winReason = "Every Traitor has been banished.";
    state.phase = "end";
    addLog(state, `The Faithful have banished every Traitor. Faithful win!`, "win");
    return true;
  }

  if (faithful.length === 0) {
    state.winner = "traitors";
    state.winReason = "No Faithful remain.";
    state.phase = "end";
    addLog(state, `No Faithful remain. The Traitors win!`, "win");
    return true;
  }

  if (traitors.length >= faithful.length) {
    state.winner = "traitors";
    state.winReason = "The Traitors equal or outnumber the Faithful.";
    state.phase = "end";
    addLog(state, `The Traitors now control the table. The Traitors win!`, "win");
    return true;
  }

  return false;
}

function escapeName(name) {
  const div = document.createElement("div");
  div.textContent = name;
  return div.innerHTML;
}
