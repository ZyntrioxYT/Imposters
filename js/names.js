export const NAME_POOL = [
  "Alex", "Amara", "Andrew", "Brian", "Charlotte", "Diane", "Elin", "Evie",
  "Fay", "Frank", "Harry", "Ivy", "Jaz", "Kyle", "Leah", "Mollie",
  "Nathan", "Paul", "Quinn", "Rachel", "Sam", "Theo", "Ursula", "Victor",
  "Wilf", "Zara"
];

const AVATAR_COLORS = [
  "#8c2f2f", "#2f5d8c", "#5d8c2f", "#8c692f", "#5d2f8c",
  "#2f8c7a", "#8c2f6b", "#4a4a8c", "#8c4a2f", "#2f6b8c"
];

export function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function pickBotNames(count, excludeName) {
  const pool = NAME_POOL.filter(
    (n) => n.toLowerCase() !== (excludeName || "").toLowerCase()
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
