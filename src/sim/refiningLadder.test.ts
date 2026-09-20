import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGameCommand } from './commands';
import { createDefaultGameState, setGameStateForTests, type GameState } from './state';
import { getLearningProgress, startTechLearningState } from './learning';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import {
  MILL_REFINEMENTS,
  affordableMillBatches,
  millRefinementFor,
  resourcesForTagInput,
  scaledMillInputs,
  type MillRefinement,
} from './catalogs/millRefining';
import { ABILITY_DEFS, type AbilityId } from './catalogs/abilities';
import { RECIPE_DEFS, abilityPlanId, type RecipeId } from './catalogs/recipes';
import { TECH_DEFS, TECH_NODE_ORDER, describeTechTask, techNodeTeachingAbility, type TechNodeId } from './catalogs/techTree';

beforeEach(() => setGameStateForTests(null));
afterEach(() => setGameStateForTests(null));

const REFINEMENTS = MILL_REFINEMENTS as readonly MillRefinement[];
const GATED = REFINEMENTS.filter((entry) => entry.requiresAbility);

function stocked(inventory: Partial<Record<ResourceId, number>>, ...plans: string[]): GameState {
  const state = createDefaultGameState();
  state.player.inventory = { ...state.player.inventory, ...inventory };
  state.player.plans.push(...(plans as RecipeId[]));
  return state;
}

function refine(state: GameState, refinementId: string, batches = 1, extra: object = {}) {
  return applyGameCommand(state, {
    type: 'refineAtMill', refinementId, batches, delivery: 'counter', now: 1000, ...extra,
  });
}

/** Every ability the player must already hold to be able to start a lesson. */
function abilitiesBefore(nodeId: TechNodeId, seen = new Set<TechNodeId>()): Set<AbilityId> {
  const abilities = new Set<AbilityId>();
  for (const required of TECH_DEFS[nodeId].requires as TechNodeId[]) {
    if (seen.has(required)) continue;
    seen.add(required);
    const node = TECH_DEFS[required];
    if (node.readiness === 'ready') {
      for (const recipeId of node.grants) {
        const output = RECIPE_DEFS[recipeId].output;
        if (output.kind === 'ability') abilities.add(output.abilityId);
      }
    }
    for (const inherited of abilitiesBefore(required, seen)) abilities.add(inherited);
  }
  return abilities;
}

describe('the structural rung — catalog shape', () => {
  it('has a mill trade for every stage 2 and 3 refined material, and nothing else makes them', () => {
    const upper = (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[])
      .filter((id) => RESOURCE_CORE_DEFS[id].category === 'refined' && RESOURCE_CORE_DEFS[id].processStage >= 2);
    expect(upper.length).toBeGreaterThan(0);
    for (const id of upper) expect(millRefinementFor(id), id).not.toBeNull();
  });

  it('gates every stage 2 and 3 trade behind know-how, and only those', () => {
    for (const entry of REFINEMENTS) {
      const stage = RESOURCE_CORE_DEFS[entry.output].processStage;
      if (stage >= 2) expect(entry.requiresAbility, entry.id).toBeDefined();
      else expect(entry.requiresAbility, entry.id).toBeUndefined();
    }
  });

  it('asks for heavier know-how the higher the stage', () => {
    const rank: Record<string, number> = { 'finer-refining': 2, 'heavy-refining': 3 };
    for (const entry of GATED) {
      expect(rank[entry.requiresAbility!], entry.id).toBe(RESOURCE_CORE_DEFS[entry.output].processStage);
    }
  });

  it('builds structural class up the ladder, so floors and upper storeys have something to ask for', () => {
    expect(RESOURCE_CORE_DEFS['layerboard'].structuralClass).toBeGreaterThanOrEqual(2);
    expect(RESOURCE_CORE_DEFS['red-brick'].structuralClass).toBeGreaterThanOrEqual(2);
    expect(RESOURCE_CORE_DEFS['crossbound-timber'].structuralClass).toBeGreaterThanOrEqual(3);
    expect(RESOURCE_CORE_DEFS['faced-masonry'].structuralClass).toBeGreaterThanOrEqual(3);
  });

  it('lets an "any brick" slot take a brick and never the masonry made from brick', () => {
    const masonry = REFINEMENTS.find((entry) => entry.id === 'faced-masonry')!;
    const slot = masonry.inputs.find((input) => input.kind === 'tag')!;
    expect(slot.kind === 'tag' && resourcesForTagInput(slot)).toEqual(['red-brick']);
  });
});

describe('the lessons that open it', () => {
  it('teaches each gating ability from a ready lesson', () => {
    for (const entry of GATED) {
      const lessonId = techNodeTeachingAbility(entry.requiresAbility!);
      expect(lessonId, entry.id).not.toBeNull();
      expect(TECH_DEFS[lessonId!].readiness).toBe('ready');
    }
  });

  it('never asks a lesson to refine something only its own grant unlocks, or something no earlier lesson unlocks', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      const before = abilitiesBefore(nodeId);
      for (const task of node.tasks) {
        if (task.kind !== 'refine') continue;
        const gate = millRefinementFor(task.resource)?.requiresAbility;
        if (gate) expect(before.has(gate), `${nodeId} needs ${task.resource} before it can teach anything`).toBe(true);
      }
    }
  });

  it('gives every lesson its ability, and every ability a lesson', () => {
    for (const abilityId of Object.keys(ABILITY_DEFS) as AbilityId[]) {
      expect(abilityPlanId(abilityId), abilityId).not.toBeNull();
      expect(techNodeTeachingAbility(abilityId), abilityId).not.toBeNull();
    }
  });

  it('counts refine tasks in pieces, from the moment the lesson starts', () => {
    const state = stocked({ 'kraft-twigs': 8, 'palm-fiber': 3 }, 'sturdy-scissors');
    state.player.refinedCounts['bound-lumber'] = 6; // refined before the lesson began
    state.player.plans.push('kids-scissors');
    const started = startTechLearningState(state, 'materials-refinement-1', 1000);
    expect(started.ok).toBe(true);

    let progress = getLearningProgress(state, 1000)!;
    expect(progress.tasks[0]).toMatchObject({ current: 0, target: 2, completed: false });

    expect(refine(state, 'bound-lumber', 1).ok).toBe(true); // ×2 pieces
    progress = getLearningProgress(state, 1000)!;
    expect(progress.tasks[0]).toMatchObject({ current: 2, target: 2, completed: true });
    expect(progress.tasks[1].current).toBe(0);
  });

  it('describes a refine task in plain words', () => {
    expect(describeTechTask({ kind: 'refine', resource: 'bound-lumber', quantity: 2, weight: 1 }))
      .toBe('Have Chisel refine 2 Bound lumber');
  });
});

describe('at the counter — the gate', () => {
  const layerboardStock = { 'bound-lumber': 2, 'ribbonwood-sticks': 2, 'binding-cord': 1 } as const;

  it('turns down a later trade until the lesson is learned, and keeps the stock', () => {
    const state = stocked({ ...layerboardStock });
    const result = refine(state, 'layerboard');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Materials & Refinement 1/);
    expect(state.player.inventory['bound-lumber']).toBe(2);
    expect(state.player.inventory['layerboard'] ?? 0).toBe(0);
    expect(state.player.refinedCounts['layerboard'] ?? 0).toBe(0);
  });

  it('turns down the same trade by mail', () => {
    const state = stocked({ ...layerboardStock });
    state.player.chips = 10;
    const result = refine(state, 'layerboard', 1, { delivery: 'mail', payment: 'chips' });
    expect(result.ok).toBe(false);
    expect(state.player.chips).toBe(10);
    expect(state.player.mailbox.some((mail) => mail.id.startsWith('mill-order:'))).toBe(false);
  });

  it('runs the trade once the lesson is learned', () => {
    const state = stocked({ ...layerboardStock }, 'finer-refining');
    const result = refine(state, 'layerboard');
    expect(result.ok).toBe(true);
    expect(state.player.inventory['layerboard']).toBe(2);
    expect(state.player.inventory['bound-lumber']).toBe(0);
    expect(state.player.inventory['binding-cord']).toBe(0);
    expect(state.player.inventory['ribbonwood-sticks']).toBe(0);
  });

  it('leaves the first rung open to a player who has learned nothing', () => {
    const state = stocked({ 'kraft-twigs': 4, 'palm-fiber': 1 });
    expect(refine(state, 'bound-lumber').ok).toBe(true);
  });

  it('cannot skip a rung: heavy refining still needs the finer material', () => {
    const state = stocked({ 'ribbonwood-sticks': 2, 'binding-cord': 1 }, 'finer-refining', 'heavy-refining');
    const result = refine(state, 'crossbound-timber');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Layerboard/);
  });

  it('faces masonry from bricks and cord, and takes no other stone in their place', () => {
    const state = stocked({ 'red-brick': 2, 'binding-cord': 1 }, 'finer-refining', 'heavy-refining');
    expect(refine(state, 'faced-masonry').ok).toBe(true);
    expect(state.player.inventory['faced-masonry']).toBe(1);

    const wrongStone = stocked({ 'stone-aggregate': 4, 'binding-cord': 1 }, 'heavy-refining');
    expect(refine(wrongStone, 'faced-masonry').ok).toBe(false);
  });

  it('charges the mail fee in a little of each material the trade takes, refined or not', () => {
    const masonry = REFINEMENTS.find((entry) => entry.id === 'faced-masonry')!;
    const inputs = scaledMillInputs(masonry, 1, true);
    expect(inputs.map((input) => input.quantity)).toEqual([3, 2]);
    expect(affordableMillBatches({ 'red-brick': 2, 'binding-cord': 1 }, masonry, true)).toBe(0);
    expect(affordableMillBatches({ 'red-brick': 3, 'binding-cord': 2 }, masonry, true)).toBe(1);
  });
});
