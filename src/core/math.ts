// Small pure math helpers shared across modules.

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function applyDeadzone(value: number, deadzone = 0.18) {
  const magnitude = Math.abs(value);
  if (magnitude < deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

export function aspect(width: number, height: number) {
  return width / height;
}

/** Deterministic LCG. Same seed, same sequence, on every client. */
export function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Stable 32-bit hash for page coordinates plus a salt, for seeded generation. */
export function hashCoords(x: number, z: number, salt = 0) {
  let h = 0x9e3779b9 ^ salt;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = Math.imul(h ^ ((h >>> 13) ^ (z | 0)), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
