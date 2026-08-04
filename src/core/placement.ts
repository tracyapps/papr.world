// Finding a free spot near an occupied one.
//
// Shared by water and by solid obstructions, because both need the same
// thing: something was placed from seeded coordinates that knew nothing about
// what is already there, and it needs to end up somewhere sensible without
// losing determinism.
//
// Deterministic on purpose — same input, same output, no randomness — so a
// nudged spawn stays put across reloads and agrees between multiplayer
// clients.

export type Spot = { x: number; z: number };

/**
 * The nearest point to (x, z) that `isBlocked` says is free.
 *
 * Searches outward in rings. Returns the original point when it is already
 * free, and gives up gracefully after a bounded search rather than looping
 * forever on a world where everything is blocked.
 */
export function nudgeToFreeSpot(
  x: number,
  z: number,
  isBlocked: (x: number, z: number) => boolean,
  maxRadius = 4,
): Spot {
  if (!isBlocked(x, z)) return { x, z };

  const step = 0.35;
  const directions = 12;
  for (let radius = step; radius <= maxRadius; radius += step) {
    for (let index = 0; index < directions; index += 1) {
      // Offset each ring so successive rings do not probe the same spokes,
      // which would miss a narrow gap between obstacles.
      const angle = (index / directions) * Math.PI * 2 + radius;
      const candidate = {
        x: x + Math.cos(angle) * radius,
        z: z + Math.sin(angle) * radius,
      };
      if (!isBlocked(candidate.x, candidate.z)) return candidate;
    }
  }
  return { x, z };
}

/**
 * Move from (x, z) by (dx, dz), sliding along whichever axis is free.
 *
 * Shared by the player and by critters so both bump into the world the same
 * way. Refusing the whole step reads as walking into glass; sliding reads as
 * brushing past a corner.
 *
 * **Being inside something is never a trap.** If the starting point is already
 * blocked — a building dropped on top of you, a footprint that grew, a spawn
 * that landed badly — the move is allowed unconditionally so you can walk out.
 * The alternative is a player wedged in a wall with no way to free themselves,
 * which is a far worse failure than briefly clipping through one.
 */
export function slideMove(
  x: number,
  z: number,
  dx: number,
  dz: number,
  isBlocked: (x: number, z: number) => boolean,
): Spot {
  if (isBlocked(x, z)) return { x: x + dx, z: z + dz };
  if (!isBlocked(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  if (!isBlocked(x + dx, z)) return { x: x + dx, z };
  if (!isBlocked(x, z + dz)) return { x, z: z + dz };
  return { x, z };
}
