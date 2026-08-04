export type ToolVerb = 'bind' | 'dig' | 'peel' | 'plant' | 'polish' | 'stamp' | 'trim';

export const TOOL_DEFS = {
  'flimsy-shovel': {
    id: 'flimsy-shovel',
    name: 'Flimsy Shovel',
    description: 'A hopeful folded scoop for shallow paper soil.',
    iconKey: 'tool.flimsy-shovel',
    tier: 1,
    verb: 'dig',
  },
  'creased-hoe': {
    id: 'creased-hoe',
    name: 'Creased Hoe',
    // The split of labour: the shovel takes ground apart, the hoe puts it
    // back together. Everything that isn't breaking new soil lives here —
    // sowing, lifting a plant back out, and raking a hole closed.
    description: 'A folded blade for sowing, lifting, and raking soil back.',
    iconKey: 'tool.creased-hoe',
    tier: 1,
    verb: 'plant',
  },
  // --- Awaiting the tree growth system -------------------------------------
  // Defined and craftable so their artwork and progression are settled, but
  // the `trim` verb has no world interaction yet: trees have no growth,
  // stages, or regrowth (see docs/tool-and-supply-progression.md, "Renewable
  // Tree Model"). `TRIM_TOOLS_READY` gates them out of the rail until that
  // lands, so a player can never equip a tool that does nothing.
  'kids-scissors': {
    id: 'kids-scissors',
    name: 'Kids Scissors',
    description: 'Rounded safety scissors. Snips shoots and soft new growth.',
    iconKey: 'tool.kids-scissors',
    tier: 1,
    verb: 'trim',
  },
  'sturdy-scissors': {
    id: 'sturdy-scissors',
    name: 'Sturdy Scissors',
    description: 'Heavier shears for bark curls and structural branches.',
    iconKey: 'tool.sturdy-scissors',
    tier: 2,
    verb: 'trim',
  },
} as const satisfies Record<string, {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  tier: 1 | 2 | 3;
  verb: ToolVerb;
}>;

export type ToolId = keyof typeof TOOL_DEFS;

/**
 * Flip to true when trees gain growth stages and the `trim` interaction
 * exists. Until then the scissors stay out of the tool rail and the Thing
 * Maker's plan list, so nothing craftable is also unusable.
 *
 * A single flag rather than commenting the tools out: their definitions,
 * artwork, and tier progression are settled work that should stay visible in
 * the catalog and keep typechecking.
 */
export const TRIM_TOOLS_READY = false;

