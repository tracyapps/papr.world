import { afterEach, describe, expect, it } from 'vitest';
import { RECIPE_DEFS, recipeForTool, type RecipeId } from './recipes';
import { toolRequiredFor } from './obtaining';
import { TOOL_DEFS, type ToolId } from './tools';
import {
  TECH_BRANCHES,
  TECH_BRANCH_ORDER,
  TECH_DEFS,
  TECH_NODE_ORDER,
  describeTechTask,
  formatLearningDuration,
  isTechNodeOwned,
  missingTechPrerequisites,
  recipesUnlockedByTool,
  resourcesUnlockedByTool,
  techBranchLabel,
  techNodeColumn,
  techNodeGrantingRecipe,
  techNodeStatus,
  techNodeUnlocks,
  techNodesInBranch,
  techTreeColumnCount,
  type TechNodeId,
} from './techTree';
import { createDefaultGameState, setGameStateForTests, type GameState } from '../state';

afterEach(() => setGameStateForTests(null));

describe('tech tree catalog shape', () => {
  it('only references branches that exist', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      expect(TECH_BRANCH_ORDER).toContain(TECH_DEFS[nodeId].branch);
    }
  });

  it('groups every node under exactly one branch, agreeing with techNodesInBranch', () => {
    const grouped = TECH_BRANCH_ORDER.flatMap(techNodesInBranch);
    expect([...grouped].sort()).toEqual([...TECH_NODE_ORDER].sort());
  });

  it('gives every branch a label', () => {
    for (const branch of TECH_BRANCH_ORDER) {
      expect(techBranchLabel(branch)).toBeTruthy();
      expect(TECH_BRANCHES[branch].summary).toBeTruthy();
    }
  });

  it('has no prerequisite cycles', () => {
    const visiting = new Set<TechNodeId>();
    const done = new Set<TechNodeId>();
    function visit(id: TechNodeId) {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`cycle at ${id}`);
      visiting.add(id);
      for (const req of TECH_DEFS[id].requires) visit(req as TechNodeId);
      visiting.delete(id);
      done.add(id);
    }
    expect(() => { for (const id of TECH_NODE_ORDER) visit(id); }).not.toThrow();
  });

  it('only requires nodes that actually exist — catches a typo\'d id', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      for (const req of TECH_DEFS[nodeId].requires) {
        expect(TECH_DEFS[req as TechNodeId]).toBeDefined();
      }
    }
  });

  it('never lets a ready node depend on a concept node — that would be a permanent deadlock', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      for (const req of node.requires) {
        expect(TECH_DEFS[req as TechNodeId].readiness).toBe('ready');
      }
    }
  });

  it('never fakes a grant on a concept node — no ToolId or RecipeId exists for unbuilt content', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'concept') continue;
      expect('grants' in node).toBe(false);
      expect('tasks' in node).toBe(false);
      expect('learningHours' in node).toBe(false);
    }
  });

  it('gives every ready node at least one task and one grant, and a real tool for each', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      expect(node.tasks.length).toBeGreaterThan(0);
      expect(node.grants.length).toBeGreaterThan(0);
      for (const toolId of node.grants) expect(TOOL_DEFS[toolId as ToolId]).toBeDefined();
    }
  });

  it('maps every knowledge-tree plan back to exactly one real lesson', () => {
    for (const recipeId of Object.keys(RECIPE_DEFS) as RecipeId[]) {
      const recipe = RECIPE_DEFS[recipeId];
      if (recipe.planSource === 'knowledge-tree') {
        expect(techNodeGrantingRecipe(recipeId)).not.toBeNull();
      } else {
        expect(techNodeGrantingRecipe(recipeId)).toBeNull();
      }
    }
  });

  it('keeps a ready node\'s task list finite and small — never a farmable queue', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      expect(node.tasks.length).toBeLessThanOrEqual(4);
    }
  });

  it('never makes a lesson task depend on the tool that lesson grants', () => {
    const offenders: string[] = [];

    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      // Starter-plan nodes are already learned on every normalized save, so
      // their task metadata is never offered as a progression gate. The
      // deadlock invariant applies to lessons a player can actually start.
      const isStartableLesson = node.grants.some((toolId) => {
        const recipeId = recipeForTool(toolId as ToolId);
        return recipeId !== null && RECIPE_DEFS[recipeId].planSource === 'knowledge-tree';
      });
      if (!isStartableLesson) continue;

      for (const task of node.tasks) {
        if (task.kind === 'own-tool') {
          if ((node.grants as readonly ToolId[]).includes(task.toolId)) {
            offenders.push(`${nodeId} asks the player to own its own grant: ${task.toolId}`);
          }
          continue;
        }

        const taskRecipe = RECIPE_DEFS[task.recipeId];
        if (taskRecipe.output.kind === 'tool'
          && (node.grants as readonly ToolId[]).includes(taskRecipe.output.toolId)) {
          offenders.push(`${nodeId} asks the player to make its own grant: ${taskRecipe.output.toolId}`);
        }

        for (const ingredient of taskRecipe.ingredients) {
          if (ingredient.kind !== 'exact') continue;
          const requiredToolId = toolRequiredFor(ingredient.resource);
          if (!requiredToolId) continue;
          const requiredTool = TOOL_DEFS[requiredToolId];
          for (const grantId of node.grants) {
            const grant = TOOL_DEFS[grantId as ToolId];
            if (requiredTool.family === grant.family && requiredTool.tier >= grant.tier) {
              offenders.push(`${nodeId} task needs ${ingredient.resource}, gated behind ${requiredToolId}`);
            }
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('lists exactly the ready nodes backed by playable tool interactions', () => {
    const readyIds = TECH_NODE_ORDER.filter((id) => TECH_DEFS[id].readiness === 'ready');
    expect(readyIds.sort()).toEqual([
      'digging-1', 'digging-2', 'digging-3', 'gardening-1', 'trimming-1', 'trimming-2',
      'building-1', 'building-2', 'building-3',
    ].sort());
  });
});

describe('node status: reads only, never writes', () => {
  function withPlans(...toolIds: ToolId[]): GameState {
    const state = createDefaultGameState();
    state.player.plans = toolIds.map((toolId) => {
      const recipeId = recipeForTool(toolId);
      if (!recipeId) throw new Error(`no recipe for ${toolId}`);
      return recipeId;
    });
    return state;
  }

  it('reads a fresh save\'s starter plans as every ready tier-1 node already owned', () => {
    const state = createDefaultGameState();
    expect(techNodeStatus('digging-1', state)).toBe('owned');
    expect(techNodeStatus('gardening-1', state)).toBe('owned');
    expect(techNodeStatus('trimming-1', state)).toBe('owned');
    expect(techNodeStatus('building-1', state)).toBe('owned');
  });

  it('locks a tier-2 node until its tier-1 prerequisite is owned', () => {
    const state = withPlans();
    expect(techNodeStatus('digging-2', state)).toBe('locked');
    expect(missingTechPrerequisites('digging-2', state)).toEqual(['digging-1']);
  });

  it('opens a tier-2 node once its prerequisite is owned, without owning it', () => {
    const state = withPlans('flimsy-shovel');
    expect(techNodeStatus('digging-2', state)).toBe('available');
    expect(missingTechPrerequisites('digging-2', state)).toEqual([]);
  });

  it('reads owned once the plan for every granted tool is held', () => {
    const state = withPlans('flimsy-shovel', 'okayish-shovel');
    expect(techNodeStatus('digging-2', state)).toBe('owned');
    expect(isTechNodeOwned('digging-2', state)).toBe(true);
  });

  it('never mistakes owning the wrong branch\'s tool for owning a node', () => {
    const state = withPlans('creased-hoe');
    expect(techNodeStatus('digging-1', state)).toBe('available');
    expect(isTechNodeOwned('digging-1', state)).toBe(false);
  });

  it('reads every concept node as not-built, regardless of prerequisites or player state', () => {
    const state = createDefaultGameState(); // owns every tier-1 ready node already
    expect(techNodeStatus('gardening-2', state)).toBe('not-built');
    expect(techNodeStatus('rocket-science', state)).toBe('not-built');
    expect(isTechNodeOwned('gardening-2', state)).toBe(false);
  });

  it('never lets a concept prerequisite block a ready node\'s status computation', () => {
    // Sanity check on the invariant above: since no ready node requires a
    // concept node, missingTechPrerequisites never has to reason about one.
    for (const nodeId of TECH_NODE_ORDER) {
      if (TECH_DEFS[nodeId].readiness !== 'ready') continue;
      expect(() => missingTechPrerequisites(nodeId, createDefaultGameState())).not.toThrow();
    }
  });
});

describe('cross-branch prerequisites', () => {
  it('lets a node in one branch require a node from a different branch', () => {
    // materials-refinement-1 (materials) requires lumber-types
    // (building-construction).
    const node = TECH_DEFS['materials-refinement-1'];
    expect(node.branch).toBe('materials');
    expect(node.requires).toContain('lumber-types');
    expect(TECH_DEFS['lumber-types'].branch).toBe('building-construction');
  });

  it('converges two branches into cooking, and cooking back into farming automation', () => {
    expect(TECH_DEFS['cooking-basics'].requires).toContain('growing-food');
    expect(TECH_DEFS['growing-food'].branch).toBe('caring-for-the-land');
    expect(TECH_DEFS['cooking-basics'].branch).toBe('cooking');

    const scale = TECH_DEFS['advanced-cooking-at-scale'];
    expect(scale.requires).toContain('farming-equipment-automation');
    expect(scale.requires).toContain('cooking-for-others');
  });

  it('gates rocket science behind both transportation and building-construction', () => {
    const rocket = TECH_DEFS['rocket-science'];
    expect(rocket.requires).toContain('automotive');
    expect(rocket.requires).toContain('auto-cad');
    expect(TECH_DEFS['auto-cad'].branch).toBe('building-construction');
  });
});

describe('shared-timeline column position (techNodeColumn)', () => {
  it('puts every root node (no prerequisites) at column 0', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      if (TECH_DEFS[nodeId].requires.length === 0) {
        expect(techNodeColumn(nodeId)).toBe(0);
      }
    }
  });

  it('places a node exactly one column past its latest prerequisite', () => {
    expect(techNodeColumn('digging-1')).toBe(0);
    expect(techNodeColumn('digging-2')).toBe(1);
    expect(techNodeColumn('digging-3')).toBe(2);
  });

  it('takes the longest path when a node has more than one prerequisite', () => {
    // advanced-cooking-at-scale requires both cooking-for-others and
    // farming-equipment-automation — its column has to clear both chains,
    // not just whichever was listed first.
    const scaleColumn = techNodeColumn('advanced-cooking-at-scale');
    const otherColumn = techNodeColumn('cooking-for-others');
    const automationColumn = techNodeColumn('farming-equipment-automation');
    expect(scaleColumn).toBe(Math.max(otherColumn, automationColumn) + 1);
  });

  it('gives techTreeColumnCount one more than the deepest node in the tree', () => {
    const deepest = Math.max(...TECH_NODE_ORDER.map((id) => techNodeColumn(id)));
    expect(techTreeColumnCount()).toBe(deepest + 1);
  });
});

describe('derived unlock icons — never hand-authored', () => {
  it('gives sturdy scissors the exclusive redwood material that no dig or scatter reaches', () => {
    const resources = resourcesUnlockedByTool('sturdy-scissors');
    expect(resources).toContain('redwood-bark-curls');
  });

  it('gives kids scissors none of the redwood-exclusive material', () => {
    const resources = resourcesUnlockedByTool('kids-scissors');
    expect(resources).not.toContain('redwood-bark-curls');
  });

  it('rolls a ready node\'s resources and grants up into one unlock summary', () => {
    const unlocks = techNodeUnlocks('trimming-2');
    expect(unlocks.grants).toEqual(['sturdy-scissors']);
    expect(unlocks.resources).toEqual(resourcesUnlockedByTool('sturdy-scissors'));
  });

  it('gives a concept node nothing to unlock — there is nothing real to derive', () => {
    const unlocks = techNodeUnlocks('rocket-science');
    expect(unlocks).toEqual({ grants: [], resources: [], recipes: [] });
  });

  it('never lists a recipe that is not actually ready', () => {
    for (const nodeId of TECH_NODE_ORDER) {
      const node = TECH_DEFS[nodeId];
      if (node.readiness !== 'ready') continue;
      for (const toolId of node.grants) {
        for (const recipeId of recipesUnlockedByTool(toolId)) {
          expect(recipeId).toBeTruthy();
        }
      }
    }
  });
});

describe('tech task presentation', () => {
  it('does not add another s to an already plural tool name', () => {
    expect(describeTechTask(TECH_DEFS['trimming-2'].tasks[1])).toBe("Make 2 Kid's Scissors");
  });
});

describe('presentation text', () => {
  it('describes an own-tool task in terms of the tool\'s real name', () => {
    expect(describeTechTask({ kind: 'own-tool', toolId: 'flimsy-shovel', weight: 1 }))
      .toBe('Own a Flimsy Shovel');
  });

  it('describes a make task with the recipe\'s real output label, pluralized only above one', () => {
    expect(describeTechTask({ kind: 'make', recipeId: 'flimsy-shovel', quantity: 1, weight: 1 }))
      .toBe('Make 1 Flimsy Shovel');
    expect(describeTechTask({ kind: 'make', recipeId: 'flimsy-shovel', quantity: 2, weight: 2 }))
      .toBe('Make 2 Flimsy Shovels');
  });

  it('never shows a countdown — durations are coarse and worded', () => {
    expect(formatLearningDuration(1)).toBe('about an hour');
    expect(formatLearningDuration(6)).toMatch(/^about \d+ hours$/);
    expect(formatLearningDuration(30)).toBe('about a day');
    expect(formatLearningDuration(96)).toMatch(/^about \d+ days$/);
  });
});
