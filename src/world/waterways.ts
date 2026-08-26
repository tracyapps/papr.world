import { hashCoords } from '../core/math';
import type { PageData, PropData, TerrainPatchData, WaterBankStyle } from './types';
import { PAGE_SIZE } from './types';

// Deterministic world-scale waterways.
//
// Each river is sampled from a continuous function of world Z. Neighbouring
// pages therefore draw overlapping pieces of the same curve instead of each
// inventing an edge that cannot meet its neighbour. Parallel watersheds are
// deliberately far apart: water remains a place you come upon, not a blue
// stripe on every page.

const RIVER_SPACING = 260;
// East of Pip's greenhouse (centred at x=42), while still on the first page
// beside the clearing so the initial world exposes the new water treatment.
const FIRST_RIVER_X = 65;
const SAMPLE_STEP = 5;
// One sampled segment is appended past the page edge below. More padding than
// that duplicates long stretches (and all their shoreline props) while nine
// neighbouring pages are visible at once.
const PAGE_PADDING = 0;
const DEEP_WATER = 0.48;

function riverCenterX(lane: number, z: number): number {
  const phase = lane * 1.713;
  return FIRST_RIVER_X + lane * RIVER_SPACING
    + Math.sin(z * 0.018 + phase) * 12
    + Math.sin(z * 0.051 - phase * 0.7) * 3.5;
}

function riverWidth(lane: number, z: number): number {
  const pulse = Math.sin(z * 0.012 + lane * 2.17) * 0.5 + 0.5;
  const riffle = Math.sin(z * 0.047 - lane) * 0.5 + 0.5;
  return 2.2 + pulse * 4.3 + riffle * 0.7;
}

function riverDepth(width: number): number {
  // Narrow heads remain friendly wading creeks; wider reaches become deep
  // enough that their generated bridge is the inviting route across.
  return width < 3.25 ? 0.28 : 0.36 + (width - 3.25) * 0.105;
}

function bankStyleFor(px: number, pz: number, lane: number): WaterBankStyle {
  const styles: WaterBankStyle[] = ['marsh', 'rock', 'sand', 'woodland'];
  return styles[Math.abs(hashCoords(px, pz, 640 + lane)) % styles.length];
}

function tangentAt(lane: number, z: number): { x: number; z: number } {
  const before = riverCenterX(lane, z - 0.5);
  const after = riverCenterX(lane, z + 0.5);
  const x = after - before;
  const length = Math.hypot(x, 1) || 1;
  return { x: x / length, z: 1 / length };
}

/** Serializable channel props which intersect one page. */
export function waterwayPropsForPage(page: Pick<PageData, 'px' | 'pz'>): PropData[] {
  const cx = page.px * PAGE_SIZE;
  const cz = page.pz * PAGE_SIZE;
  const half = PAGE_SIZE / 2;
  const minX = cx - half - PAGE_PADDING;
  const maxX = cx + half + PAGE_PADDING;
  const minZ = cz - half - PAGE_PADDING;
  const maxZ = cz + half + PAGE_PADDING;
  const firstLane = Math.floor((minX - FIRST_RIVER_X) / RIVER_SPACING) - 1;
  const lastLane = Math.ceil((maxX - FIRST_RIVER_X) / RIVER_SPACING) + 1;
  const props: PropData[] = [];

  for (let lane = firstLane; lane <= lastLane; lane += 1) {
    const points: Array<[number, number]> = [];
    const widths: number[] = [];
    const depths: number[] = [];
    const startZ = Math.floor(minZ / SAMPLE_STEP) * SAMPLE_STEP;
    for (let z = startZ; z <= maxZ + SAMPLE_STEP; z += SAMPLE_STEP) {
      const x = riverCenterX(lane, z);
      const width = riverWidth(lane, z);
      points.push([x, z]);
      widths.push(width);
      depths.push(riverDepth(width));
    }

    const reachesPage = points.some(([x]) => x >= minX && x <= maxX);
    if (!reachesPage) continue;

    const pageZ = cz;
    const crossingWidth = riverWidth(lane, pageZ);
    const crossingDepth = riverDepth(crossingWidth);
    const tangent = tangentAt(lane, pageZ);
    // A bridge lies along the channel normal (bank-to-bank), not downstream.
    const crossing = crossingDepth >= DEEP_WATER
      ? {
          x: riverCenterX(lane, pageZ),
          z: pageZ,
          rotationY: Math.atan2(-tangent.x, -tangent.z),
          width: 1.45,
          length: crossingWidth + 2.2,
        }
      : undefined;

    props.push({
      id: `river:${lane}`,
      kind: 'waterChannel',
      points,
      widths,
      depths,
      // Wider sections are calmer; narrow reaches visibly hurry.
      flowSpeed: 0.032 + Math.max(0, 5.2 - crossingWidth) * 0.012,
      bankStyle: bankStyleFor(page.px, page.pz, lane),
      seed: hashCoords(page.px, page.pz, 750 + lane),
      crossing,
      map: { kind: 'terrain', color: '#4e84a4' },
    });
  }

  return props;
}

function distanceToSegment(
  x: number,
  z: number,
  a: [number, number],
  b: [number, number],
): { distance: number; t: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared <= 0.0001
    ? 0
    : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared));
  return { distance: Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)), t };
}

function terrainPatchReachesChannel(patch: TerrainPatchData, channel: Extract<PropData, { kind: 'waterChannel' }>): boolean {
  const patchReach = Math.max(patch.radiusX, patch.radiusZ);
  for (let index = 0; index < channel.points.length - 1; index += 1) {
    const nearest = distanceToSegment(patch.x, patch.z, channel.points[index], channel.points[index + 1]);
    const width = (channel.widths[index] ?? 1) * (1 - nearest.t)
      + (channel.widths[index + 1] ?? 1) * nearest.t;
    // Half a unit beyond the visible bank keeps steep patch shoulders from
    // poking through the water between geometry samples.
    if (nearest.distance <= patchReach + width / 2 + 1.25) return true;
  }
  return false;
}

/** Add waterways without mutating authored or cached page objects in place. */
export function withWaterways(page: PageData): PageData {
  const waterways = waterwayPropsForPage(page);
  if (waterways.length === 0) return page;
  const channels = waterways.filter((prop): prop is Extract<PropData, { kind: 'waterChannel' }> => prop.kind === 'waterChannel');
  return {
    ...page,
    // Local hills and hollows are optional decoration. Broad elevation stays,
    // but these bumps must not rise through the water as green wedges.
    terrain: page.terrain.filter((patch) => !channels.some((channel) => terrainPatchReachesChannel(patch, channel))),
    props: [...page.props, ...waterways],
  };
}
