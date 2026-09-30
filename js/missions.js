// Each mission renders itself into `container` and calls `onResult(success)`
// exactly once when finished. Returns a cleanup function that cancels any
// pending timers/animation frames if the mission is abandoned early.

function steadyHands(container, onResult) {
  const zoneStart = 55 + Math.random() * 20; // 55-75
  const zoneWidth = 14;
  let pos = 0;
  let rafId = null;
  let startTime = null;
  let done = false;

  container.innerHTML = `
    <p>Stop the marker inside the gold zone.</p>
    <div class="mission-track">
      <div class="mission-zone" style="left:${zoneStart}%;width:${zoneWidth}%"></div>
      <div class="mission-marker"></div>
    </div>
    <button class="btn btn-primary" id="mission-lock">Lock In</button>
  `;
  const marker = container.querySelector(".mission-marker");
  const track = container.querySelector(".mission-track");
  const lockBtn = container.querySelector("#mission-lock");

  function tick(t) {
    if (startTime === null) startTime = t;
    const elapsed = t - startTime;
    pos = (Math.sin(elapsed / 550) + 1) / 2 * 100;
    marker.style.left = pos + "%";
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  const failTimer = setTimeout(() => finish(false), 8000);

  function finish(success) {
    if (done) return;
    done = true;
    cancelAnimationFrame(rafId);
    clearTimeout(failTimer);
    track.classList.add(success ? "mission-success" : "mission-fail");
    lockBtn.disabled = true;
    setTimeout(() => onResult(success), 500);
  }

  lockBtn.addEventListener("click", () => {
    finish(pos >= zoneStart && pos <= zoneStart + zoneWidth);
  });

  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    clearTimeout(failTimer);
  };
}

function memoryVault(container, onResult) {
  const TILE_COUNT = 6;
  const SEQ_LENGTH = 4;
  const pool = [...Array(TILE_COUNT).keys()];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sequence = pool.slice(0, SEQ_LENGTH);

  let playerIndex = 0;
  let accepting = false;
  let done = false;
  const timers = [];

  container.innerHTML = `
    <p id="mission-instruction">Watch closely...</p>
    <div class="mission-grid">
      ${Array.from({ length: TILE_COUNT })
        .map((_, i) => `<div class="mission-tile" data-i="${i}"></div>`)
        .join("")}
    </div>
  `;
  const instruction = container.querySelector("#mission-instruction");
  const tiles = [...container.querySelectorAll(".mission-tile")];

  sequence.forEach((tileIndex, step) => {
    timers.push(
      setTimeout(() => {
        tiles[tileIndex].classList.add("flash");
        timers.push(setTimeout(() => tiles[tileIndex].classList.remove("flash"), 450));
      }, step * 700)
    );
  });

  timers.push(
    setTimeout(() => {
      if (done) return;
      instruction.textContent = "Now repeat the sequence!";
      accepting = true;
    }, sequence.length * 700 + 200)
  );

  function finish(success) {
    if (done) return;
    done = true;
    accepting = false;
    timers.forEach(clearTimeout);
    instruction.textContent = success ? "Sequence correct!" : "Wrong tile!";
    setTimeout(() => onResult(success), 500);
  }

  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      if (!accepting || done) return;
      const i = Number(tile.dataset.i);
      if (i === sequence[playerIndex]) {
        tile.classList.add("mission-success-tile");
        playerIndex += 1;
        if (playerIndex === sequence.length) finish(true);
      } else {
        tile.classList.add("mission-fail-tile");
        finish(false);
      }
    });
  });

  return () => {
    done = true;
    accepting = false;
    timers.forEach(clearTimeout);
  };
}

function quickReflex(container, onResult) {
  let stage = "waiting"; // waiting -> go -> done
  let done = false;
  let goTimer = null;
  let windowTimer = null;

  container.innerHTML = `
    <p>Wait for it to turn green, then click as fast as you can.</p>
    <div class="mission-reflex-box waiting">Wait for it...</div>
  `;
  const box = container.querySelector(".mission-reflex-box");

  goTimer = setTimeout(() => {
    if (done) return;
    stage = "go";
    box.className = "mission-reflex-box go";
    box.textContent = "CLICK NOW!";
    windowTimer = setTimeout(() => finish(false, "Too slow!"), 900);
  }, 1000 + Math.random() * 1500);

  function finish(success, message) {
    if (done) return;
    done = true;
    clearTimeout(goTimer);
    clearTimeout(windowTimer);
    box.className = "mission-reflex-box " + (success ? "mission-success" : "mission-fail");
    box.textContent = message;
    setTimeout(() => onResult(success), 500);
  }

  box.addEventListener("click", () => {
    if (done) return;
    if (stage === "waiting") finish(false, "Too soon!");
    else if (stage === "go") finish(true, "Nice reflexes!");
  });

  return () => {
    done = true;
    clearTimeout(goTimer);
    clearTimeout(windowTimer);
  };
}

export const MISSIONS = [
  { name: "Steady Hands", play: steadyHands },
  { name: "Memory Vault", play: memoryVault },
  { name: "Quick Reflex", play: quickReflex },
];

export function pickRandomMission() {
  return MISSIONS[Math.floor(Math.random() * MISSIONS.length)];
}
