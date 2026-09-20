import type { AbilityId } from './abilities';
import type { ResourceId } from './resources';

/**
 * The dwelling: what a player's home is made of, and what it costs to grow it.
 *
 * Design in `docs/house-and-home.md`. Everyone begins with a tent-like house
 * under construction (stage 0, implicit, never in the part list). Every later
 * step is a **part**, added by a **project**: pay the materials whenever you
 * like, then wait out a real-time build. One mechanism covers a floor, a roof,
 * an upper storey and, later, tower floors: they differ only in the numbers
 * here. Costs and waits are data on purpose, so they can be tuned in play
 * without touching any code.
 *
 * Renderer-free. The exterior draws itself from the finished part list.
 */

export const DWELLING_PART_IDS = ['floor', 'walls', 'roof', 'upstairs', 'room-1', 'room-2'] as const;
export type DwellingPartId = (typeof DWELLING_PART_IDS)[number];

export type DwellingCostLine = { resource: ResourceId; quantity: number };

export type DwellingPartDef = {
  id: DwellingPartId;
  label: string;
  /** One line, in the player's terms. */
  summary: string;
  /** The know-how from the tree that unlocks this part. */
  requiresAbility: AbilityId;
  /** Parts that must already be finished. */
  requiresParts: readonly DwellingPartId[];
  /** Everything it costs, in exact refined materials. */
  cost: readonly DwellingCostLine[];
  /** Real seconds of building once the last material is in. 0 = instant. */
  buildSeconds: number;
  /** What this part retires from the tent stage, if anything. */
  replaces?: 'tent-roof';
};

/**
 * First-pass numbers: minutes, not hours, so the mechanism can be felt in play.
 * The real waits ("starting out in hours, longer each floor up") are tuned here
 * once there is something to tune against. Class 2 materials for the cottage,
 * class 3 for an upper storey (`materials-and-resources-v1.md`, gate table).
 */
export const DWELLING_PART_DEFS = {
  floor: {
    id: 'floor',
    label: 'Floor',
    summary: 'A real floor under the tent, so home stops being bare ground.',
    requiresAbility: 'house-floors',
    requiresParts: [],
    cost: [
      { resource: 'layerboard', quantity: 4 },
      { resource: 'binding-cord', quantity: 2 },
    ],
    buildSeconds: 120,
  },
  walls: {
    id: 'walls',
    label: 'Walls',
    summary: 'Layerboard and brick walls around the floor.',
    requiresAbility: 'house-walls',
    requiresParts: ['floor'],
    cost: [
      { resource: 'layerboard', quantity: 6 },
      { resource: 'red-brick', quantity: 4 },
      { resource: 'binding-cord', quantity: 2 },
    ],
    buildSeconds: 240,
  },
  roof: {
    id: 'roof',
    label: 'Roof',
    summary: 'A proper roof, in place of the tent roof.',
    requiresAbility: 'house-roofs',
    requiresParts: ['walls'],
    cost: [
      { resource: 'layerboard', quantity: 8 },
      { resource: 'binding-cord', quantity: 4 },
      { resource: 'paper-mortar', quantity: 2 },
    ],
    buildSeconds: 360,
    replaces: 'tent-roof',
  },
  upstairs: {
    id: 'upstairs',
    label: 'Stairs and upper floor',
    summary: 'A stair and a second storey, on structural timber and faced masonry.',
    requiresAbility: 'house-stairs',
    requiresParts: ['roof'],
    cost: [
      { resource: 'crossbound-timber', quantity: 6 },
      { resource: 'faced-masonry', quantity: 4 },
      { resource: 'binding-cord', quantity: 4 },
    ],
    buildSeconds: 900,
  },
  'room-1': {
    id: 'room-1',
    label: 'Extra room',
    summary: 'A second room off the first.',
    requiresAbility: 'house-rooms',
    requiresParts: ['walls'],
    cost: [
      { resource: 'layerboard', quantity: 8 },
      { resource: 'red-brick', quantity: 6 },
      { resource: 'binding-cord', quantity: 3 },
      { resource: 'paper-mortar', quantity: 2 },
    ],
    buildSeconds: 480,
  },
  'room-2': {
    id: 'room-2',
    label: 'Another room',
    summary: 'A third room, for whatever the house turns out to need.',
    requiresAbility: 'house-rooms',
    requiresParts: ['room-1'],
    cost: [
      { resource: 'layerboard', quantity: 10 },
      { resource: 'red-brick', quantity: 8 },
      { resource: 'binding-cord', quantity: 4 },
      { resource: 'paper-mortar', quantity: 3 },
    ],
    buildSeconds: 600,
  },
} as const satisfies Record<DwellingPartId, DwellingPartDef>;

export function dwellingPartDef(id: DwellingPartId): DwellingPartDef {
  return DWELLING_PART_DEFS[id];
}

export function isDwellingPartId(value: unknown): value is DwellingPartId {
  return typeof value === 'string' && (DWELLING_PART_IDS as readonly string[]).includes(value);
}

/**
 * Taking materials back out of the dwelling, as a percentage lost. Decided
 * 2026-09-20: nothing is lost before the build starts, a little once it has,
 * and a little more for a part that was already finished.
 */
export const DWELLING_REFUND_LOSS_PERCENT = {
  /** A project whose build has not started. */
  beforeBuild: 0,
  /** A project whose build timer was already running. */
  building: 5,
  /** A finished part taken down again. */
  finished: 10,
  /** The whole old house, paid back when you move. */
  move: 10,
} as const;

export type DwellingRefundKind = keyof typeof DWELLING_REFUND_LOSS_PERCENT;

/**
 * What is paid back for `quantity` pieces, rounded to the nearest whole piece
 * (halves round up) so a small stack loses almost nothing.
 */
export function refundQuantity(quantity: number, lossPercent: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return Math.round((quantity * (100 - lossPercent)) / 100);
}

/** The exterior stage, for drawing and for saying in words. */
export type DwellingStage = 'tent' | 'shell' | 'cottage' | 'house';

export function dwellingStage(parts: readonly DwellingPartId[]): DwellingStage {
  const has = (id: DwellingPartId) => parts.includes(id);
  if (has('upstairs')) return 'house';
  if (has('roof')) return 'cottage';
  if (has('floor') || has('walls')) return 'shell';
  return 'tent';
}

export function describeDwellingCost(cost: readonly DwellingCostLine[], labelOf: (resource: ResourceId) => string): string {
  return cost.map((line) => `${line.quantity} ${labelOf(line.resource)}`).join(', ');
}
