/**
 * Abilities: things a player is *allowed to do*, learned from the knowledge
 * tree, rather than things they make or hold.
 *
 * Plans are knowledge (`docs/plans-and-blueprints.md`), and an ability is the
 * same kind of knowledge with a different payoff: instead of a tool or a
 * build piece it switches a rule on. They ride the plan machinery on purpose —
 * an ability is a recipe with an `ability` output (see `recipes.ts`), so it is
 * kept in `player.plans`, normalised on load, carried by the account tech
 * store, and read back by `techNodeStatus` with no second system to keep in
 * step. This file is only the ability's own words: what it is called and what
 * it lets you do.
 *
 * Add one only when something in the game actually checks it. A node that
 * grants an ability nothing reads would be a lesson that teaches nothing.
 */

export type AbilityDef = {
  id: string;
  label: string;
  /** One line, in the player's terms: what this lets them do. */
  summary: string;
};

export const ABILITY_DEFS = {
  'shallow-water-planting': {
    id: 'shallow-water-planting',
    label: 'Shallow-Water Planting',
    summary: 'Lotus and marsh reeds take root straight in shallow water, with no bed dug first.',
  },
  'finer-refining': {
    id: 'finer-refining',
    label: 'Finer Refining',
    summary: 'Chisel presses bound lumber into layerboard and packs terracotta into red brick.',
  },
  'heavy-refining': {
    id: 'heavy-refining',
    label: 'Heavy Refining',
    summary: 'Chisel cross-binds layerboard into structural timber and faces brick into masonry.',
  },
  // What a home's parts wait on (catalogs/dwellings.ts `requiresAbility`).
  'house-floors': {
    id: 'house-floors',
    label: 'House Floors',
    summary: 'Lay a real floor under your home, in place of bare ground.',
  },
  'house-walls': {
    id: 'house-walls',
    label: 'House Walls',
    summary: 'Raise walls around your floor.',
  },
  'house-roofs': {
    id: 'house-roofs',
    label: 'House Roofs',
    summary: 'Put a proper roof on your home, in place of the tent roof.',
  },
  'house-stairs': {
    id: 'house-stairs',
    label: 'Stairs and Upper Floors',
    summary: 'Build a stair and a second storey.',
  },
  'house-rooms': {
    id: 'house-rooms',
    label: 'Extra Rooms',
    summary: 'Add more rooms to your home.',
  },
} as const satisfies Record<string, AbilityDef>;

export type AbilityId = keyof typeof ABILITY_DEFS;
