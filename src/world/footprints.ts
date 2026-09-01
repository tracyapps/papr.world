import { getPage, peekPage } from './pages';
import { pageId, pageOfPosition, type PageData, type PropData } from './types';
import { getGameState } from '../sim/state';
import { placedPieceFootprint } from './buildPieces';
import {
  GREENHOUSE_COUNTER,
  GREENHOUSE_LENGTH,
  GREENHOUSE_PAGE,
  GREENHOUSE_PLANTERS,
  GREENHOUSE_POSITION,
  GREENHOUSE_WIDTH,
  greenhouseWorldPoint,
} from './seedStoreLayout';

export type DigFootprint = {
  id: string;
  label: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  /**
   * Whether this is a physical obstruction, not just something you cannot
   * dig through.
   *
   * The two are genuinely different. A twig bundle blocks digging — there is
   * already something lying there — but a squirrel should walk right over it.
   * The Thing Maker blocks both. Conflating them would either let critters
   * stroll through walls or make them refuse to cross a scattered stick.
   */
  solid?: boolean;
  /**
   * How much room the object takes up *physically*, when that is smaller
   * than the ground it claims.
   *
   * A tree is the case this exists for. Its roots spread — you cannot dig a
   * bed against the trunk — but the trunk itself is a narrow thing you should
   * be able to walk right up to and squeeze past. Using one radius for both
   * put an invisible wall around every tree at more than twice the width of
   * the visible trunk, which is what made the treeline feel sticky.
   *
   * Defaults to the dig radius, so anything that genuinely is as solid as it
   * is wide — a wall, the Thing Maker — needs to say nothing.
   */
  solidRadiusX?: number;
  solidRadiusZ?: number;
  rotationY?: number;
};

const CLEARING_DETAIL_FOOTPRINTS: DigFootprint[] = [
  { id: 'starter-house', label: 'the house', x: 2.7, z: 0.35, radiusX: 1.75, radiusZ: 1.75, solid: true },
  { id: 'thing-maker', label: 'the Thing Maker', x: -0.12, z: -3.22, radiusX: 1.35, radiusZ: 1.2, solid: true },
  { id: 'display-wall', label: 'the display wall', x: -0.85, z: 1.65, radiusX: 1.05, radiusZ: 0.75, solid: true },
  { id: 'trail-sign', label: 'the trail sign', x: -4.05, z: -4.7, radiusX: 0.48, radiusZ: 0.48, solid: true },
  // Not solid: the pond is walkable, and land critters avoid it through the
  // water registry instead (they wade rather than bounce off a wall).
  { id: 'paper-pond', label: 'the paper pond', x: -5.2, z: 4.7, radiusX: 1.5, radiusZ: 1.05 },
  { id: 'listening-tree', label: 'the listening tree', x: -1.7, z: -6.8, radiusX: 0.62, radiusZ: 0.62, solid: true, solidRadiusX: 0.3, solidRadiusZ: 0.3 },
  { id: 'porch-mobile', label: 'the porch mobile', x: 5.2, z: -1.9, radiusX: 0.72, radiusZ: 0.72, solid: true },
];

const CLEARING_COZY_TREE_SPOTS: Array<[number, number]> = [
  [-9.2, -7.2], [-6.7, -8.9], [-3.4, -9.5], [0.3, -10], [4.6, -9], [8.3, -7],
  [9.4, -2.5], [9, 2.5], [8.1, 7.2], [4.4, 9.1], [0, 10], [-4.1, 9.4],
  [-8, 7.3], [-9.4, 3], [-9.8, -2],
];

function propFootprint(page: PageData, prop: PropData, index: number): DigFootprint | null {
  const id = `page:${page.id}:prop:${prop.id ?? index}`;
  switch (prop.kind) {
    case 'tree': {
      // Roots claim the ground; the trunk claims far less of it. The solid
      // radius is matched to the trunk the player can actually see — the map
      // feature registers the same 0.28 in `pageRuntime.ts`.
      const redwood = prop.tree.startsWith('redwood');
      const radius = redwood ? 0.8 : 0.52;
      const trunk = redwood ? 0.46 : 0.28;
      return {
        id,
        label: 'a tree',
        x: prop.x,
        z: prop.z,
        radiusX: radius,
        radiusZ: radius,
        solid: true,
        solidRadiusX: trunk,
        solidRadiusZ: trunk,
      };
    }
    // Loose material and flat scraps lie *on* the ground. They block digging
    // (something is already there) but nothing should walk around a twig.
    case 'harvestable':
      return { id, label: 'a loose material', x: prop.x, z: prop.z, radiusX: 0.42, radiusZ: 0.42 };
    case 'scrapPile':
      return { id, label: 'a scrap pile', x: prop.x, z: prop.z, radiusX: prop.spreadX * 0.55, radiusZ: prop.spreadZ * 0.55 };
    case 'sheet':
      return prop.map?.kind === 'building' || prop.map?.kind === 'crafted'
        ? { id, label: 'a placed object', x: prop.x, z: prop.z, radiusX: prop.width / 2, radiusZ: prop.depth / 2, solid: true }
        : null;
    case 'water':
      // You cannot dig a hole in a pond. Water claims its full footprint.
      return { id, label: 'water', x: prop.x, z: prop.z, radiusX: prop.width / 2, radiusZ: prop.depth / 2 };
    case 'waterChannel':
      // Expanded into one short rotated footprint per segment below. A single
      // ellipse here would block acres of dry land between bends.
      return null;
    case 'ribbon':
    case 'unique':
    case 'decor':
      // Flat desert scenery (cactus): nothing to dig around, nothing solid
      // to bump into — same treatment as the other pure-decoration props.
      return null;
  }
}

/**
 * Footprints are derived from page props, which never change after a page is
 * built — so this is computed once per page rather than on every query.
 *
 * Not a micro-optimisation: rebuilding the list meant mapping every prop and
 * pushing the clearing's 15 trees and 4 shrubs, on every single call, from
 * code that runs several times a frame per critter.
 *
 * Placed pieces are the exception: they are a live part of the page. After a
 * piece appears the cache for its page must be invalidated (see
 * `invalidateFootprintCache`), otherwise a fresh bench would be walkable and
 * dig-throughable until something unrelated rebuilt the list.
 */
const footprintCache = new Map<string, DigFootprint[]>();

function pageFootprints(page: PageData): DigFootprint[] {
  const cached = footprintCache.get(page.id);
  if (cached) return cached;
  const built = buildPageFootprints(page);
  footprintCache.set(page.id, built);
  return built;
}

/**
 * Drop the cached footprint list for a page (or every page, with no args).
 *
 * Call this after placing or removing a piece so the very next query sees it.
 * Only ever called at user-action rate — a placement — never from the per-
 * frame movement paths.
 */
export function invalidateFootprintCache(pageIds?: Iterable<string>) {
  if (!pageIds) {
    footprintCache.clear();
    return;
  }
  for (const id of pageIds) footprintCache.delete(id);
}

function buildPageFootprints(page: PageData): DigFootprint[] {
  const footprints = page.props
    .map((prop, index) => propFootprint(page, prop, index))
    .filter((footprint): footprint is DigFootprint => Boolean(footprint));

  for (let propIndex = 0; propIndex < page.props.length; propIndex += 1) {
    const prop = page.props[propIndex];
    if (prop.kind !== 'waterChannel') continue;
    for (let segment = 0; segment < prop.points.length - 1; segment += 1) {
      const [ax, az] = prop.points[segment];
      const [bx, bz] = prop.points[segment + 1];
      footprints.push({
        id: `page:${page.id}:prop:${prop.id ?? propIndex}:segment:${segment}`,
        label: 'running water',
        x: (ax + bx) / 2,
        z: (az + bz) / 2,
        radiusX: Math.hypot(bx - ax, bz - az) / 2 + 0.15,
        radiusZ: Math.max(prop.widths[segment] ?? 1, prop.widths[segment + 1] ?? 1) / 2,
        rotationY: Math.atan2(-(bz - az), bx - ax),
      });
    }
  }

  // Pieces the player has put down stand on top of whatever the page seeded.
  const placed = getGameState().world.pages[page.id]?.placedPieces ?? {};
  for (const piece of Object.values(placed)) {
    if (piece.page !== page.id) continue;
    footprints.push(placedPieceFootprint(piece));
  }

  if (page.id === '0,0') {
    footprints.push(...CLEARING_DETAIL_FOOTPRINTS);
    CLEARING_COZY_TREE_SPOTS.forEach(([x, z], index) => {
      footprints.push({
        id: `clearing-cozy-tree:${index}`,
        label: 'a tree',
        x,
        z,
        radiusX: 0.52,
        radiusZ: 0.52,
        solid: true,
        solidRadiusX: 0.28,
        solidRadiusZ: 0.28,
      });
    });
    [-1, -0.25, 0.5, 1.25].forEach((z, index) => {
      // Shrubs are ankle height — walkable.
      footprints.push({ id: `house-shrub:${index}`, label: 'a garden shrub', x: 4.35, z, radiusX: 0.42, radiusZ: 0.42 });
    });
  }
  if (page.id === '-2,0') {
    footprints.push(
      { id: 'wood-mill-cutter', label: 'the great paper cutter', x: -94.3, z: 0, radiusX: 2.8, radiusZ: 2.0, solid: true },
      // The awning is a roof on posts — walkable underneath, so it blocks
      // digging but not movement. Only the cutter itself is an obstruction.
      { id: 'wood-mill-awning', label: 'the Wood Mill', x: -94, z: 0, radiusX: 4.4, radiusZ: 3.5 },
      { id: 'wood-mill-sign', label: 'the Wood Mill sign', x: -88.8, z: -3.4, radiusX: 0.5, radiusZ: 0.5, solid: true },
    );
  }
  if (page.id === pageId(GREENHOUSE_PAGE.px, GREENHOUSE_PAGE.pz)) {
    // The roof claims the ground for digging but not walking. Raised beds and
    // the little checkout desk are the only solid pieces, leaving the middle
    // aisle genuinely traversable from one end to the other.
    footprints.push({
      id: 'pips-greenhouse-canopy',
      label: 'Pip’s greenhouse',
      x: GREENHOUSE_POSITION.x,
      z: GREENHOUSE_POSITION.z,
      radiusX: GREENHOUSE_LENGTH / 2,
      radiusZ: GREENHOUSE_WIDTH / 2,
    });
    for (const planter of GREENHOUSE_PLANTERS) {
      const world = greenhouseWorldPoint(planter.x, planter.z);
      footprints.push({
        id: `pips-planter:${planter.seedId}`,
        label: 'a greenhouse planter',
        x: world.x,
        z: world.z,
        radiusX: planter.width / 2,
        radiusZ: planter.depth / 2,
        solid: true,
      });
    }
    const counter = greenhouseWorldPoint(GREENHOUSE_COUNTER.x, GREENHOUSE_COUNTER.z);
    footprints.push({
      id: 'pips-potting-desk',
      label: 'Pip’s potting desk',
      x: counter.x,
      z: counter.z,
      radiusX: GREENHOUSE_COUNTER.width / 2,
      radiusZ: GREENHOUSE_COUNTER.depth / 2,
      solid: true,
    });
  }
  return footprints;
}

function overlaps(footprint: DigFootprint, x: number, z: number, radius: number, physical = false) {
  const footprintX = physical ? footprint.solidRadiusX ?? footprint.radiusX : footprint.radiusX;
  const footprintZ = physical ? footprint.solidRadiusZ ?? footprint.radiusZ : footprint.radiusZ;
  const worldDx = x - footprint.x;
  const worldDz = z - footprint.z;
  const cos = Math.cos(-(footprint.rotationY ?? 0));
  const sin = Math.sin(-(footprint.rotationY ?? 0));
  const dx = (worldDx * cos - worldDz * sin) / (footprintX + radius);
  const dz = (worldDx * sin + worldDz * cos) / (footprintZ + radius);
  return dx * dx + dz * dz < 1;
}

/**
 * Deterministic page-data validation; an authoritative server can run the same
 * footprint test without loading renderer objects.
 *
 * Generates pages it hasn't seen, unlike the movement query below. This one
 * runs at user-action rate — a click, a hover — and must answer correctly even
 * about a page that hasn't streamed in yet.
 */
export function findDigFootprintBlocker(x: number, z: number, radius: number): DigFootprint | null {
  return findFootprint(x, z, radius, () => true, getPage);
}

/**
 * Placement blockers excluding other player-built pieces.
 *
 * Built pieces use rotated rectangular overlap rules in `buildPieces.ts`;
 * feeding them through this older ellipse query first would recreate the
 * broad invisible spacing the build system is deliberately removing.
 */
export function findBuildFootprintBlocker(x: number, z: number, radius: number): DigFootprint | null {
  return findFootprint(x, z, radius, (footprint) => !footprint.id.startsWith('placed:'), getPage);
}

/**
 * The physical obstruction at a point, or null when it is walkable.
 *
 * Used by critter movement so animals stop at walls and trees instead of
 * strolling through them — and, more visibly, instead of stopping halfway
 * and leaving only their back half on show.
 */
export function findSolidBlocker(x: number, z: number, radius: number): DigFootprint | null {
  // Peeks rather than generates: this runs every frame for every nearby
  // critter, and a walking animal must never cause world generation.
  return findFootprint(x, z, radius, (footprint) => Boolean(footprint.solid), peekPage, true);
}

export function isSolidAt(x: number, z: number, radius = 0): boolean {
  return findSolidBlocker(x, z, radius) !== null;
}

/** Deterministic page-data search shared by both queries. */
function findFootprint(
  x: number,
  z: number,
  radius: number,
  accept: (footprint: DigFootprint) => boolean,
  lookup: (px: number, pz: number) => PageData | null,
  physical = false,
): DigFootprint | null {
  const center = pageOfPosition(x, z);
  for (let px = center.px - 1; px <= center.px + 1; px += 1) {
    for (let pz = center.pz - 1; pz <= center.pz + 1; pz += 1) {
      const page = lookup(px, pz);
      if (!page) continue;
      const blocker = pageFootprints(page)
        .find((footprint) => accept(footprint) && overlaps(footprint, x, z, radius, physical));
      if (blocker) return blocker;
    }
  }
  return null;
}
