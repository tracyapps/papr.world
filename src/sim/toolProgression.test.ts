import { afterEach, describe, expect, it } from 'vitest';
import {
  RECIPE_DEFS,
  STARTER_PLAN_IDS,
  isRecipeAvailable,
  previousTierTool,
  recipeForTool,
  recipesInFamily,
  type RecipeId,
} from './catalogs/recipes';
import { TOOL_DEFS, TOOL_FAMILY_ORDER, toolsInFamily, type ToolId } from './catalogs/tools';
import { craftBlockers } from './commands';
import { createDefaultGameState, setGameStateForTests, type GameState } from './state';

afterEach(() => setGameStateForTests(null));

function stocked(): GameState {
  const state = createDefaultGameState();
  // Enough of everything that materials are never the blocker under test.
  for (const resource of Object.keys(state.player.inventory)) delete state.player.inventory[resource as never];
  for (const resource of ['kraft-twigs', 'ribbonwood-sticks', 'mossy-paper-fiber', 'confetti-stones',
    'graphite-cardstone', 'bluefold-pebbles', 'sunbaked-cardboard', 'ochre-paperclay', 'carbon-soil'] as const) {
    state.player.inventory[resource] = 99;
  }
  state.world.thingMaker.level = 3;
  return state;
}

function kinds(state: GameState, recipeId: RecipeId) {
  return craftBlockers(state, recipeId).map((blocker) => blocker.kind);
}

describe('tool ladders', () => {
  it('orders every family by tier, not by name or definition order', () => {
    for (const family of TOOL_FAMILY_ORDER) {
      const tiers = toolsInFamily(family).map((toolId) => TOOL_DEFS[toolId].tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    }
  });

  it('puts every tool in exactly one family ladder', () => {
    const laddered = TOOL_FAMILY_ORDER.flatMap(toolsInFamily);
    expect([...laddered].sort()).toEqual((Object.keys(TOOL_DEFS) as ToolId[]).sort());
    expect(new Set(laddered).size).toBe(laddered.length);
  });

  it('gives every ready tool recipe a plan and every tool a recipe', () => {
    for (const toolId of Object.keys(TOOL_DEFS) as ToolId[]) {
      expect(recipeForTool(toolId)).not.toBeNull();
    }
  });

  it('starts the player with the first rung of every ladder and nothing more', () => {
    for (const family of TOOL_FAMILY_ORDER) {
      const [first, ...rest] = recipesInFamily(family);
      expect(STARTER_PLAN_IDS).toContain(first);
      for (const higher of rest) expect(STARTER_PLAN_IDS).not.toContain(higher);
    }
  });

  it('includes the scissors, which is what made them invisible before', () => {
    // Regression: `TRIM_TOOLS_READY` was flipped on while the starter plan
    // list was still hand-written, so the recipe was available and the plan
    // was unobtainable. Deriving the list is the fix; this guards it.
    expect(STARTER_PLAN_IDS).toContain('kids-scissors');
  });

  it('never offers a plan for something that is not playable', () => {
    for (const recipeId of STARTER_PLAN_IDS) expect(isRecipeAvailable(recipeId)).toBe(true);
  });

  it('hides unimplemented recipes from every family ladder', () => {
    const listed = TOOL_FAMILY_ORDER.flatMap(recipesInFamily);
    for (const recipeId of listed) expect(RECIPE_DEFS[recipeId].status).toBe('ready');
  });
});

describe('climbing one rung at a time', () => {
  it('names the rung below as the blocker when you have not made it', () => {
    const state = stocked();
    state.player.plans.push('okayish-shovel');
    expect(kinds(state, 'okayish-shovel')).toContain('previous-tier');
  });

  it('clears once you own the rung below', () => {
    const state = stocked();
    state.player.plans.push('okayish-shovel');
    state.player.tools['flimsy-shovel'] = 1;
    expect(kinds(state, 'okayish-shovel')).not.toContain('previous-tier');
  });

  it('still blocks a two-rung skip even with the plan and the materials', () => {
    const state = stocked();
    state.player.plans.push('heavy-duty-shovel');
    state.player.tools['flimsy-shovel'] = 1;
    // Owning tier 1 does not unlock tier 3; only tier 2 does.
    expect(kinds(state, 'heavy-duty-shovel')).toContain('previous-tier');
    state.player.tools['okayish-shovel'] = 1;
    expect(kinds(state, 'heavy-duty-shovel')).not.toContain('previous-tier');
  });

  it('never blocks the first rung on a predecessor', () => {
    const state = stocked();
    for (const family of TOOL_FAMILY_ORDER) {
      const first = recipesInFamily(family)[0];
      const output = RECIPE_DEFS[first].output;
      if (output.kind !== 'tool') continue;
      expect(previousTierTool(output.toolId)).toBeNull();
      expect(kinds(state, first)).not.toContain('previous-tier');
    }
  });

  it('reports a missing plan rather than silently offering the craft', () => {
    const state = stocked();
    state.player.tools['flimsy-shovel'] = 1;
    expect(kinds(state, 'okayish-shovel')).toContain('no-plan');
  });

  it('lets a fully qualified craft through', () => {
    const state = stocked();
    expect(craftBlockers(state, 'kids-scissors')).toEqual([]);
  });

  it('allows remaking something you already own', () => {
    // Spares exist to be given away; owning one is not a blocker. The second
    // press that guards it is UI intent, not a rule.
    const state = stocked();
    state.player.tools['kids-scissors'] = 1;
    expect(craftBlockers(state, 'kids-scissors')).toEqual([]);
  });
});
