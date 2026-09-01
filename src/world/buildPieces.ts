import type { PlacedPiece } from '../../shared/src/index';
import type { DigFootprint } from './footprints';

// The build-piece catalog: renderer-free and deterministic, so the same data
// drives the local placement rule, the server's future overlap checks, and
// (through buildPieceVisuals.ts) the Three.js meshes.
//
// A piece is a small paper object the player puts down anywhere there is room:
//
//   * `radiusX`/`radiusZ` — the ground the piece claims for *physics and
//     digging*. A solid piece blocks movement too; a flat plank does not, so
//     planks can be walked across to make paths.
//   * `overlap` — whether this footprint may cross another. Most objects use
//     their real rotated rectangle and may touch edge-to-edge. Path planks may
//     overlap their own template so rows do not need visible gaps. Future rugs
//     and runners can opt into `any` and sit under/on other pieces.
//
// First slice is deliberately free: no materials are spent to build, so the
// loop is pick → place → adjust, and the economics can be tuned later without
// relocking the verb.

export type BuildPieceKey = keyof typeof BUILD_PIECE_DEFS;

/**
 * A resolved piece definition — either a known catalog entry or the unknown
 * fallback, so callers never have to handle a missing template specially.
 */
export type ResolvedBuildPiece = {
  key: string;
  label: string;
  summary: string;
  radiusX: number;
  radiusZ: number;
  overlap: 'none' | 'same-template' | 'any';
  solid: boolean;
};

export type BuildPiecePose = { x: number; z: number; rotY: number };
export type PositionedBuildPiece = BuildPiecePose & { templateKey: string };

// `key` is the literal catalog key only for known entries; the unknown
// fallback carries an ordinary string instead, so the union stays usable.
export type BuildPieceDef = ResolvedBuildPiece & { key: BuildPieceKey };

export const BUILD_PIECE_DEFS = {
  'paper-bench': {
    key: 'paper-bench',
    label: 'Paper bench',
    summary: 'A little place to sit and watch the paper world.',
    radiusX: 0.62,
    radiusZ: 0.42,
    overlap: 'none',
    solid: true,
  },
  'planter-box': {
    key: 'planter-box',
    label: 'Planter box',
    summary: 'A tidy box for a seed that wants a raised bed.',
    radiusX: 0.55,
    radiusZ: 0.4,
    overlap: 'none',
    solid: true,
  },
  'path-plank': {
    key: 'path-plank',
    label: 'Path plank',
    summary: 'One plank of a path that says this way is friendly.',
    radiusX: 0.85,
    radiusZ: 0.31,
    overlap: 'same-template',
    // Flat and walkable — this is what lets a row of planks become a path.
    solid: false,
  },
  'paper-lamp': {
    key: 'paper-lamp',
    label: 'Paper lamp',
    summary: 'A folded paper shade on a quiet wooden post.',
    radiusX: 0.3,
    radiusZ: 0.3,
    overlap: 'none',
    solid: true,
  },
} as const satisfies Record<string, ResolvedBuildPiece>;

/**
 * Stand-in for a piece whose template no longer exists in the catalog.
 *
 * A save from a newer version can carry a template key we do not know. The
 * piece must still take up its ground (silently erasing an old bench would
 * let the player build inside it) and must still refuse a dig — so it becomes
 * a generic solid mystery object instead of vanishing.
 */
const UNKNOWN_PIECE_DEF: ResolvedBuildPiece = {
  key: 'unknown',
  label: 'mystery object',
  summary: '',
  radiusX: 0.4,
  radiusZ: 0.4,
  overlap: 'none',
  solid: true,
};

export function buildPieceDef(templateKey: string): ResolvedBuildPiece {
  return BUILD_PIECE_DEFS[templateKey as BuildPieceKey] ?? UNKNOWN_PIECE_DEF;
}

const MIN_DUPLICATE_CENTER_DISTANCE = 0.12;
const TOUCH_EPSILON = 1e-7;

function localAxes(rotY: number) {
  const cosine = Math.cos(rotY);
  const sine = Math.sin(rotY);
  return [
    { x: cosine, z: -sine },
    { x: sine, z: cosine },
  ] as const;
}

function projectionRadius(
  definition: ResolvedBuildPiece,
  rotY: number,
  axis: { x: number; z: number },
) {
  const [localX, localZ] = localAxes(rotY);
  return definition.radiusX * Math.abs(axis.x * localX.x + axis.z * localX.z)
    + definition.radiusZ * Math.abs(axis.x * localZ.x + axis.z * localZ.z);
}

/**
 * Rotated-rectangle overlap with authored soft-piece exceptions.
 *
 * Touching edges are allowed. That is the important difference from the old
 * centre-spacing circles: a bench can sit exactly beside another bench, and
 * turning a long plank changes the space it actually occupies.
 */
export function buildPieceDefsConflict(
  first: ResolvedBuildPiece,
  firstPose: BuildPiecePose,
  second: ResolvedBuildPiece,
  secondPose: BuildPiecePose,
): boolean {
  if (first.overlap === 'any' || second.overlap === 'any') return false;
  const centerDistance = Math.hypot(firstPose.x - secondPose.x, firstPose.z - secondPose.z);
  if (
    first.key === second.key
    && (first.overlap === 'same-template' || second.overlap === 'same-template')
  ) {
    // A small duplicate guard catches double-clicks without preventing the
    // intentional end/side overlap that makes a continuous plank path.
    return centerDistance < MIN_DUPLICATE_CENTER_DISTANCE;
  }

  const delta = { x: secondPose.x - firstPose.x, z: secondPose.z - firstPose.z };
  const axes = [...localAxes(firstPose.rotY), ...localAxes(secondPose.rotY)];
  for (const axis of axes) {
    const distance = Math.abs(delta.x * axis.x + delta.z * axis.z);
    const reach = projectionRadius(first, firstPose.rotY, axis)
      + projectionRadius(second, secondPose.rotY, axis);
    if (distance >= reach - TOUCH_EPSILON) return false;
  }
  return true;
}

export function buildPiecesConflict(first: PositionedBuildPiece, second: PositionedBuildPiece): boolean {
  return buildPieceDefsConflict(
    buildPieceDef(first.templateKey), first,
    buildPieceDef(second.templateKey), second,
  );
}

/**
 * The ground a placed piece claims, in the footprint system's terms.
 *
 * Footprints decide "can I dig here" and (when solid) "can I walk here".
 * Routing placed pieces through the same list means a new piece refuses a dig
 * the moment it exists, and a solid bench stops a critter mid-stride.
 */
export function placedPieceFootprint(piece: PlacedPiece): DigFootprint {
  const def = buildPieceDef(piece.templateKey);
  const cosine = Math.abs(Math.cos(piece.rotY ?? 0));
  const sine = Math.abs(Math.sin(piece.rotY ?? 0));
  return {
    id: `placed:${piece.id}`,
    label: `the ${def.label}`,
    x: piece.x,
    z: piece.z,
    // Footprint queries are axis-aligned, so use the rotated rectangle's
    // enclosing radii. Quarter-turns swap X/Z exactly; arbitrary angles stay
    // conservative for walking and digging.
    radiusX: def.radiusX * cosine + def.radiusZ * sine,
    radiusZ: def.radiusX * sine + def.radiusZ * cosine,
    solid: def.solid,
  };
}

/**
 * The placed planter box a point sits inside, if any.
 *
 * A planter box is placed like any other piece, but its whole purpose is a
 * raised bed you can plant straight into — no shovel required. The garden
 * tool's preview (`gardenActions.ts`) and the `plantTerrain` command both
 * need the same answer to "is this point inside one?", so it lives here next
 * to `placedPieceFootprint` rather than being worked out twice.
 */
export function planterBoxAt(
  placedPieces: Record<string, PlacedPiece> | undefined,
  x: number,
  z: number,
): PlacedPiece | null {
  if (!placedPieces) return null;
  for (const piece of Object.values(placedPieces)) {
    if (piece.templateKey !== 'planter-box') continue;
    const footprint = placedPieceFootprint(piece);
    const dx = (x - footprint.x) / footprint.radiusX;
    const dz = (z - footprint.z) / footprint.radiusZ;
    if (dx * dx + dz * dz < 1) return piece;
  }
  return null;
}
