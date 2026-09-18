import type { MaterialTag } from './materials';
import { RESOURCE_CORE_DEFS, RESOURCE_IDS, type ResourceId } from './resources';

/**
 * Refining at the Wood Mill.
 *
 * Raw materials become refined ones by trade, not by crafting: you bring
 * Chisel the raw stock at the mill and he hands back the refined material.
 * (Refining used to be a Thing Maker recipe — `bound-lumber` — but the maker
 * is for *things*; the mill is where stock gets worked up.)
 *
 * The mill is one place on the map, so the same trades can also be ordered
 * from the mailbox for a delivery fee — a few chips, or a little extra of the
 * raw stock — and arrive as a parcel a short while later. See `MILL_MAIL`.
 *
 * Renderer-free: the Thing Maker panel, the mill counter, the mail-order form,
 * obtain routes, and a future server all read this one table.
 */

export type MillInput =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  /**
   * Any *raw* material carrying a tag (processStage 0). Refined materials
   * carry tags too — binding cord is `long-fiber` — and letting them count
   * here would let cord be refined from cord.
   */
  | { kind: 'tag'; tag: MaterialTag; quantity: number; label: string };

export type MillRefinement = {
  id: string;
  output: ResourceId;
  /** Refined pieces handed back per batch. */
  quantity: number;
  /** Raw stock taken per batch. */
  inputs: MillInput[];
  /** Chisel's one-line description, shown at the counter. */
  blurb: string;
};

export const MILL_REFINEMENTS = [
  {
    id: 'bound-lumber',
    output: 'bound-lumber',
    quantity: 2,
    // The materials plan's starter recipe: twigs plus any long fiber to bind
    // them. The old Thing Maker version wanted redwood bark curls, which need
    // upgraded scissors — too late for the first rung of the wood path.
    inputs: [
      { kind: 'exact', resource: 'kraft-twigs', quantity: 4 },
      { kind: 'tag', tag: 'long-fiber', quantity: 1, label: 'any long fiber' },
    ],
    blurb: 'Twigs bundled, bound, and pressed square under the big cutter.',
  },
  {
    id: 'binding-cord',
    output: 'binding-cord',
    quantity: 2,
    inputs: [{ kind: 'tag', tag: 'long-fiber', quantity: 3, label: 'any long fiber' }],
    blurb: 'Long strands twisted into cord that actually holds a knot.',
  },
  {
    id: 'soft-pulp',
    output: 'soft-pulp',
    quantity: 2,
    inputs: [{ kind: 'tag', tag: 'soft-fiber', quantity: 3, label: 'any soft fiber' }],
    blurb: 'Soft scraps soaked and beaten into a smooth, even pulp.',
  },
  {
    id: 'stone-aggregate',
    output: 'stone-aggregate',
    quantity: 2,
    inputs: [{ kind: 'tag', tag: 'stone', quantity: 3, label: 'any stone' }],
    blurb: 'Pebbles and chips crushed down to a sharp, packable grit.',
  },
  {
    id: 'paper-mortar',
    output: 'paper-mortar',
    quantity: 2,
    inputs: [
      { kind: 'tag', tag: 'clay', quantity: 2, label: 'any clay' },
      { kind: 'tag', tag: 'soft-fiber', quantity: 1, label: 'any soft fiber' },
    ],
    blurb: 'Clay worked with a little fiber into mortar that sets hard.',
  },
] as const satisfies readonly MillRefinement[];

export type MillRefinementId = (typeof MILL_REFINEMENTS)[number]['id'];

export function getMillRefinement(id: string): MillRefinement | null {
  return (MILL_REFINEMENTS as readonly MillRefinement[]).find((entry) => entry.id === id) ?? null;
}

/** The raw materials that can fill a tag slot, in catalog order. */
export function rawResourcesWithTag(tag: MaterialTag): ResourceId[] {
  return RESOURCE_IDS.filter((id) => {
    const def = RESOURCE_CORE_DEFS[id];
    return def.processStage === 0 && (def.tags as readonly MaterialTag[]).includes(tag);
  });
}

/** Every raw material that can go into a refinement at all. */
export function millInputResources(refinement: MillRefinement): ResourceId[] {
  const resources = new Set<ResourceId>();
  for (const input of refinement.inputs) {
    if (input.kind === 'exact') resources.add(input.resource);
    else for (const id of rawResourcesWithTag(input.tag)) resources.add(id);
  }
  return [...resources];
}

/**
 * Mail order: the same trades, delivered.
 *
 * The fee is paid one of two ways, the player's choice:
 * - `chips`: a flat courier fee per order;
 * - `materials`: one extra of every input line per order ("a few extra of the
 *   source materials"), for players saving their chips.
 * Parcels arrive after `deliveryMs` — long enough to feel like post, short
 * enough that nobody forgets they ordered.
 */
export const MILL_MAIL = {
  feeChips: 3,
  extraPerInputLine: 1,
  deliveryMs: 90_000,
  maxBatches: 10,
} as const;

export type MillPayment = 'chips' | 'materials';

/** Input lines scaled for a number of batches, plus the mail fee if paying in materials. */
export function scaledMillInputs(
  refinement: MillRefinement,
  batches: number,
  materialsFee: boolean,
): MillInput[] {
  return refinement.inputs.map((input) => ({
    ...input,
    quantity: input.quantity * batches + (materialsFee ? MILL_MAIL.extraPerInputLine : 0),
  }));
}

export type MillAllocation = Partial<Record<ResourceId, number>>;

/**
 * Which exact raw pieces a trade would take, or null if the player is short.
 *
 * Exact inputs are taken first; tag slots then take from whichever eligible
 * material the player holds most of, so a trade never quietly eats the one
 * rare thing you were saving when a plentiful alternative would do.
 */
export function resolveMillAllocation(
  inventory: Readonly<Partial<Record<ResourceId, number>>>,
  inputs: readonly MillInput[],
): MillAllocation | null {
  const remaining: Partial<Record<ResourceId, number>> = { ...inventory };
  const allocation: MillAllocation = {};
  const take = (resource: ResourceId, amount: number) => {
    remaining[resource] = (remaining[resource] ?? 0) - amount;
    allocation[resource] = (allocation[resource] ?? 0) + amount;
  };
  for (const input of inputs) {
    if (input.kind !== 'exact') continue;
    if ((remaining[input.resource] ?? 0) < input.quantity) return null;
    take(input.resource, input.quantity);
  }
  for (const input of inputs) {
    if (input.kind !== 'tag') continue;
    let needed = input.quantity;
    const candidates = rawResourcesWithTag(input.tag)
      .sort((a, b) => (remaining[b] ?? 0) - (remaining[a] ?? 0) || a.localeCompare(b));
    for (const resource of candidates) {
      const spend = Math.min(needed, remaining[resource] ?? 0);
      if (spend <= 0) continue;
      take(resource, spend);
      needed -= spend;
      if (needed === 0) break;
    }
    if (needed > 0) return null;
  }
  return allocation;
}

/** How many batches the player could afford right now (0 if none). */
export function affordableMillBatches(
  inventory: Readonly<Partial<Record<ResourceId, number>>>,
  refinement: MillRefinement,
  materialsFee = false,
  cap: number = MILL_MAIL.maxBatches,
): number {
  let batches = 0;
  while (batches < cap && resolveMillAllocation(inventory, scaledMillInputs(refinement, batches + 1, materialsFee))) {
    batches += 1;
  }
  return batches;
}

/** "4 Kraft twigs + 1 any long fiber", for labels and hints. */
export function describeMillInputs(inputs: readonly MillInput[]): string {
  return inputs
    .map((input) => (input.kind === 'exact'
      ? `${input.quantity} ${RESOURCE_CORE_DEFS[input.resource].shortLabel}`
      : `${input.quantity} ${input.label}`))
    .join(' + ');
}
