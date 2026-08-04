export type ToolVerb = 'bind' | 'dig' | 'peel' | 'plant' | 'polish' | 'stamp' | 'trim';

/**
 * Families group a tool with its own upgrade ladder.
 *
 * A family exists so the UI can show "Shovels" as one expandable entry with
 * its tiers inside, rather than four unrelated cards a player has to work out
 * are the same tool. Which family a tool belongs to, and where it sits in the
 * ladder, are **data** — never parsed from its name.
 *
 * That distinction is the whole point. Tool names are free-form flavour that
 * follow the artwork, and a future tool may want a tier word that has the
 * right *feel* without being "flimsy" or "sturdy". Nothing may ever infer
 * progression from a string, or renaming a drawing would silently reorder a
 * ladder.
 */
export type ToolFamilyId = 'shovel' | 'hoe' | 'scissors';

export const TOOL_FAMILIES = {
  shovel: {
    id: 'shovel',
    label: 'Shovels',
    verb: 'dig',
    summary: 'Break new ground, and reach the layers under it.',
  },
  hoe: {
    id: 'hoe',
    label: 'Hoes',
    verb: 'plant',
    summary: 'Sow, lift, and rake soil back into an open bed.',
  },
  scissors: {
    id: 'scissors',
    label: 'Scissors',
    verb: 'trim',
    summary: 'Cut renewable growth from trees without harming them.',
  },
} as const satisfies Record<string, {
  id: ToolFamilyId;
  label: string;
  verb: ToolVerb;
  summary: string;
}>;

export const TOOL_FAMILY_ORDER: ToolFamilyId[] = ['shovel', 'hoe', 'scissors'];

export const TOOL_DEFS = {
  'flimsy-shovel': {
    id: 'flimsy-shovel',
    name: 'Flimsy Shovel',
    description: 'A hopeful folded scoop for shallow paper soil.',
    // What this level can and cannot do, in the player's terms. The ladder
    // is only legible if each rung says what the next one buys you.
    limitation: 'Opens the surface layer only, and refuses folds steeper than a gentle bank.',
    iconKey: 'tool.flimsy-shovel',
    family: 'shovel',
    tier: 1,
    verb: 'dig',
  },
  'okayish-shovel': {
    id: 'okayish-shovel',
    name: 'Okayish Shovel',
    description: 'A second attempt, with a folded spine that holds its shape.',
    limitation: 'Reaches the compact layer by revisiting a bed you already dug, and handles steep ground.',
    iconKey: 'tool.okayish-shovel',
    family: 'shovel',
    tier: 2,
    verb: 'dig',
  },
  'heavy-duty-shovel': {
    id: 'heavy-duty-shovel',
    name: 'Heavy-duty Shovel',
    description: 'Layered board and a bound handle, built for real excavation.',
    limitation: 'Opens deep seams where the local geology has one. Nothing digs past this yet.',
    iconKey: 'tool.heavy-duty-shovel',
    family: 'shovel',
    tier: 3,
    verb: 'dig',
  },
  'creased-hoe': {
    id: 'creased-hoe',
    name: 'Creased Hoe',
    // The split of labour: the shovel takes ground apart, the hoe puts it
    // back together. Everything that isn't breaking new soil lives here —
    // sowing, lifting a plant back out, and raking a hole closed.
    description: 'A folded blade for sowing, lifting, and raking soil back.',
    limitation: 'Fills shallow scuffs for nothing; deeper holes cost soil from your scrapbook.',
    iconKey: 'tool.creased-hoe',
    family: 'hoe',
    tier: 1,
    verb: 'plant',
  },
  'kids-scissors': {
    id: 'kids-scissors',
    name: 'Kids Scissors',
    description: 'Rounded safety scissors. Snips shoots and soft new growth.',
    limitation: 'Takes a small cut from ordinary trees. Will not get through redwood bark.',
    iconKey: 'tool.kids-scissors',
    family: 'scissors',
    tier: 1,
    verb: 'trim',
  },
  'sturdy-scissors': {
    id: 'sturdy-scissors',
    name: 'Sturdy Scissors',
    description: 'Heavier shears for bark curls and structural branches.',
    limitation: 'Cuts roughly half again as much per snip, and is the only pair that works on redwoods.',
    iconKey: 'tool.sturdy-scissors',
    family: 'scissors',
    tier: 2,
    verb: 'trim',
  },
} as const satisfies Record<string, {
  id: string;
  name: string;
  description: string;
  limitation: string;
  iconKey: string;
  family: ToolFamilyId;
  tier: 1 | 2 | 3;
  verb: ToolVerb;
}>;

export type ToolId = keyof typeof TOOL_DEFS;

/**
 * A family's tools, weakest first.
 *
 * Sorted on `tier`, so the ladder's order survives any renaming and any
 * reordering of the definitions above.
 */
export function toolsInFamily(family: ToolFamilyId): ToolId[] {
  return (Object.keys(TOOL_DEFS) as ToolId[])
    .filter((toolId) => TOOL_DEFS[toolId].family === family)
    .sort((a, b) => TOOL_DEFS[a].tier - TOOL_DEFS[b].tier);
}

/**
 * Kept as the single switch that takes trimming back out of a build without
 * unpicking the catalog, the recipes, and the toolbar. Trees have growth
 * stages and the `trim` interaction exists, so it is on.
 */
export const TRIM_TOOLS_READY = true;
