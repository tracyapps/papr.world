import { SEED_STORE } from '../sim/catalogs/shops';
import type { SeedId } from '../sim/catalogs/seeds';

export const GREENHOUSE_PAGE = { px: 1, pz: 0 } as const;
export const GREENHOUSE_POSITION = { x: 42, z: -12 } as const;

export const GREENHOUSE_AISLE_HALF_WIDTH = 0.95;
export const GREENHOUSE_PLANTER_WIDTH = 2.15;
export const GREENHOUSE_PLANTER_DEPTH = 2.05;
export const GREENHOUSE_COLUMN_PITCH = 2.55;
export const GREENHOUSE_ROW_Z = GREENHOUSE_AISLE_HALF_WIDTH + GREENHOUSE_PLANTER_DEPTH / 2 + 0.35;

export type GreenhousePlanterSlot = {
  seedId: SeedId;
  /** Local greenhouse coordinates. */
  x: number;
  z: number;
  width: number;
  depth: number;
};

/**
 * Two planter rows flank a continuous west-to-east aisle. The source list is
 * the shop catalog, so adding a stocked seed automatically adds one full-grown
 * display rather than relying on a second hand-maintained prop list.
 */
export function greenhousePlanterLayout(seedIds: readonly SeedId[]): GreenhousePlanterSlot[] {
  const columns = Math.ceil(seedIds.length / 2);
  const firstX = -((columns - 1) * GREENHOUSE_COLUMN_PITCH) / 2;
  return seedIds.map((seedId, index) => ({
    seedId,
    x: firstX + Math.floor(index / 2) * GREENHOUSE_COLUMN_PITCH,
    z: index % 2 === 0 ? -GREENHOUSE_ROW_Z : GREENHOUSE_ROW_Z,
    width: GREENHOUSE_PLANTER_WIDTH,
    depth: GREENHOUSE_PLANTER_DEPTH,
  }));
}

export const GREENHOUSE_PLANTERS = greenhousePlanterLayout(SEED_STORE.sells);

const PLANTER_COLUMNS = Math.max(1, Math.ceil(GREENHOUSE_PLANTERS.length / 2));
export const GREENHOUSE_LENGTH = (
  (PLANTER_COLUMNS - 1) * GREENHOUSE_COLUMN_PITCH + GREENHOUSE_PLANTER_WIDTH + 1.7
);
export const GREENHOUSE_WIDTH = (GREENHOUSE_ROW_Z + GREENHOUSE_PLANTER_DEPTH / 2 + 0.75) * 2;
export const GREENHOUSE_CLEAR_RADIUS = Math.hypot(GREENHOUSE_LENGTH / 2, GREENHOUSE_WIDTH / 2) + 1.8;

/** Outside the west entrance, beside the aisle rather than behind a counter. */
export const PIP_LOCAL_POSITION = {
  x: -GREENHOUSE_LENGTH / 2 - 0.55,
  z: 0.75,
} as const;

export const GREENHOUSE_COUNTER = {
  x: -GREENHOUSE_LENGTH / 2 + 0.65,
  z: -GREENHOUSE_WIDTH / 2 + 0.55,
  width: 1.8,
  depth: 0.78,
} as const;

export function greenhouseWorldPoint(localX: number, localZ: number) {
  return { x: GREENHOUSE_POSITION.x + localX, z: GREENHOUSE_POSITION.z + localZ };
}

/** Place a child on its own terrain sample inside a root anchored elsewhere. */
export function groundedLocalY(rootGroundY: number, targetGroundY: number, footOffset = 0) {
  return targetGroundY - rootGroundY + footOffset;
}
