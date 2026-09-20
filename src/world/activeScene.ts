// Which ground the player is standing on. The surface is the default; a scene
// with its own floor and walls (the inside of the home) installs a `SceneGround`
// while it is active, and the few callers that ask "how high is the floor?" and
// "is this blocked?" for the *player* go through here rather than straight to
// the surface's terrain and footprints. Design: docs/scenes-and-interiors.md.

import { isSolidAt } from './footprints';
import { sampleTerrainHeight } from './terrain';

export type SceneGround = {
  height: (x: number, z: number) => number;
  blocked: (x: number, z: number, radius: number) => boolean;
};

let ground: SceneGround | null = null;

/** Install (or clear, with null) the ground of the scene the player is in. */
export function setSceneGround(next: SceneGround | null) {
  ground = next;
}

/** True while the player is in a scene of their own rather than on the surface. */
export function isInteriorActive(): boolean {
  return ground !== null;
}

export function groundHeightAt(x: number, z: number): number {
  return ground ? ground.height(x, z) : sampleTerrainHeight(x, z);
}

export function solidAt(x: number, z: number, radius = 0): boolean {
  return ground ? ground.blocked(x, z, radius) : isSolidAt(x, z, radius);
}
