/**
 * The dig lattice.
 *
 * This used to be 1.25 units, which made a single shovel scoop a 1.45-unit
 * crater — nearly as wide as the avatar is tall — and spaced cells so far
 * apart that two digs sat as separate tangent circles instead of merging into
 * worked ground.
 *
 * At 0.5 the lattice is finer than the visual radius of a scoop, so adjacent
 * digs deliberately overlap and read as one continuous bed. That is what
 * makes a garden row or a dug patch possible at all.
 */
export const TERRAIN_CELL_SIZE = 0.5;

/**
 * Visual radius of one scoop, comfortably larger than half a cell (0.25) so
 * neighbouring scoops overlap well into each other's flat floor rather than
 * merely kissing at the rim.
 *
 * At 0.62 the overlap band was so thin, and the depth falloff so peaked, that
 * the midpoint between two adjacent digs sat at only ~9% of full depth — a
 * row of dimples with unturned ridges. Paired with the plateau profile in
 * `digInfluence`, 0.85 puts that midpoint above 90% and the row reads as one
 * continuous worked bed.
 */
export const TERRAIN_CELL_RADIUS = TERRAIN_CELL_SIZE * 0.85;

export type TerrainCellAddress = {
  cellKey: string;
  pageId: string;
  x: number;
  z: number;
};

/** Snap a world point to the shared terrain lattice. Global grid coordinates
 * make cells deterministic across page seams and future multiplayer clients. */
export function terrainCellAt(
  x: number,
  z: number,
  pageIdForPosition: (x: number, z: number) => string,
): TerrainCellAddress {
  const gridX = Math.round(x / TERRAIN_CELL_SIZE);
  const gridZ = Math.round(z / TERRAIN_CELL_SIZE);
  const centerX = gridX * TERRAIN_CELL_SIZE;
  const centerZ = gridZ * TERRAIN_CELL_SIZE;
  return {
    cellKey: `${gridX},${gridZ}`,
    pageId: pageIdForPosition(centerX, centerZ),
    x: centerX,
    z: centerZ,
  };
}
