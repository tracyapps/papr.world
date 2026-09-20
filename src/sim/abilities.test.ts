import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGameCommand, craftBlockers, describeCraftBlocker } from './commands';
import { createDefaultGameState, initializeGameState, setGameStateForTests, SAVE_STORAGE_KEY } from './state';
import { ABILITY_DEFS, type AbilityId } from './catalogs/abilities';
import {
  RECIPE_DEFS,
  STARTER_PLAN_IDS,
  abilityPlanId,
  hasAbility,
  isCraftableRecipe,
  isKnowledgeOutput,
  looseRecipes,
  type RecipeId,
} from './catalogs/recipes';
import { TECH_DEFS, TECH_NODE_ORDER, techNodeStatus, techNodeTeachingAbility } from './catalogs/techTree';

beforeEach(() => setGameStateForTests(null));
afterEach(() => setGameStateForTests(null));

const ABILITY_IDS = Object.keys(ABILITY_DEFS) as AbilityId[];
const ABILITY_PLAN_IDS = (Object.keys(RECIPE_DEFS) as RecipeId[])
  .filter((id) => RECIPE_DEFS[id].output.kind === 'ability');

describe('abilities — catalog shape', () => {
  it('pairs every ability with exactly one plan, and every ability plan with a real ability', () => {
    expect(ABILITY_IDS.length).toBeGreaterThan(0);
    for (const abilityId of ABILITY_IDS) {
      const planId = abilityPlanId(abilityId);
      expect(planId, abilityId).not.toBeNull();
      expect(ABILITY_PLAN_IDS.filter((id) => {
        const output = RECIPE_DEFS[id].output;
        return output.kind === 'ability' && output.abilityId === abilityId;
      })).toHaveLength(1);
    }
    for (const planId of ABILITY_PLAN_IDS) {
      const output = RECIPE_DEFS[planId].output;
      expect(output.kind === 'ability' && output.abilityId in ABILITY_DEFS).toBe(true);
    }
  });

  it('is only ever learned from the tree — nobody starts knowing one', () => {
    for (const planId of ABILITY_PLAN_IDS) {
      expect(RECIPE_DEFS[planId].planSource).toBe('knowledge-tree');
      expect(STARTER_PLAN_IDS).not.toContain(planId);
    }
  });

  it('has a real, ready lesson for every ability, reachable from ready nodes alone', () => {
    for (const abilityId of ABILITY_IDS) {
      const lessonId = techNodeTeachingAbility(abilityId);
      expect(lessonId, abilityId).not.toBeNull();
      const lesson = TECH_DEFS[lessonId!];
      expect(lesson.readiness).toBe('ready');
      for (const required of lesson.requires) {
        expect(TECH_DEFS[required as keyof typeof TECH_DEFS].readiness).toBe('ready');
      }
    }
  });

  it('gives every knowledge-plan lesson real work to do, not only tools it already has', () => {
    // An own-tool task is true the moment you hold the tool, so a lesson made
    // only of those pays out in full as soon as it starts. Making or refining
    // something new is work that has to actually be done.
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      const teachesKnowledge = node.grants.some((id) => isKnowledgeOutput(RECIPE_DEFS[id].output));
      if (!teachesKnowledge) continue;
      expect(node.tasks.some((task) => task.kind !== 'own-tool'), nodeId).toBe(true);
    }
  });
});

describe('abilities — never a crafting surface', () => {
  it('is not craftable and not a loose recipe', () => {
    for (const planId of ABILITY_PLAN_IDS) {
      expect(isCraftableRecipe(planId)).toBe(false);
      expect(looseRecipes()).not.toContain(planId);
    }
  });

  it('explains itself at the Thing Maker instead of offering a craft', () => {
    const state = createDefaultGameState();
    state.player.plans.push('shallow-water-planting');
    const blockers = craftBlockers(state, 'shallow-water-planting');
    expect(blockers).toContainEqual({ kind: 'know-how' });
    expect(describeCraftBlocker({ kind: 'know-how' })).toMatch(/know-how/);
  });

  it('can never come off the tray', () => {
    const state = createDefaultGameState();
    state.world.thingMaker.trayOutputs.push('shallow-water-planting');
    const result = applyGameCommand(state, { type: 'collectOutput', index: 0 });
    expect(result.ok).toBe(false);
    expect(state.world.thingMaker.trayOutputs).toHaveLength(1);
  });
});

describe('abilities — knowing one', () => {
  it('reads from the plan list and nowhere else', () => {
    const state = createDefaultGameState();
    expect(hasAbility(state.player.plans, 'shallow-water-planting')).toBe(false);
    state.player.plans.push('shallow-water-planting');
    expect(hasAbility(state.player.plans, 'shallow-water-planting')).toBe(true);
  });

  it('marks its lesson owned once known, and opens it from Gardening 2', () => {
    const state = createDefaultGameState();
    expect(techNodeStatus('wetland-growing', state)).toBe('locked');
    state.player.plans.push('tending-hoe');
    expect(techNodeStatus('wetland-growing', state)).toBe('available');
    state.player.plans.push('shallow-water-planting');
    expect(techNodeStatus('wetland-growing', state)).toBe('owned');
  });

  it('survives save normalization alongside ordinary plans', () => {
    const map = new Map<string, string>([[SAVE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      player: { plans: ['shallow-water-planting', 'garden-arbor', 'not-a-plan'] },
      world: {},
    })]]);
    const state = initializeGameState({
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
    });
    expect(state.player.plans).toContain('shallow-water-planting');
    expect(state.player.plans).toContain('garden-arbor');
    expect(state.player.plans).not.toContain('not-a-plan');
  });
});
