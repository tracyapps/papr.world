import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultGameState, getGameState, setGameStateForTests, updateGameState } from '../sim/state';
import { allQuestDefs, getQuestDef, objectiveReach, questReachable } from '../sim/catalogs/quests';
import { pickTrinketDef } from '../sim/catalogs/trinkets';
import type { Critter } from './critterBehavior';
import {
  acceptQuest,
  completeQuest,
  hasTurnInReady,
  objectiveMeasure,
  refreshQuest,
  selectQuestFor,
} from './quests';

afterEach(() => setGameStateForTests(null));

function critter(id: string, species: Critter['species'] = 'raccoon'): Critter {
  return {
    id,
    species,
    params: { name: 'Bandit', personality: ['curious', 'bold'] },
  } as unknown as Critter;
}

const QUEST_ID = 'favor-first-shiny';

describe('quest catalog', () => {
  it('has unique ids and complete definitions', () => {
    const defs = allQuestDefs();
    expect(defs.length).toBeGreaterThan(20);
    const ids = defs.map((quest) => quest.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const quest of defs) {
      expect(quest.objectives.length).toBeGreaterThan(0);
      expect(['favor', 'errand', 'odyssey']).toContain(quest.tier);
      expect(['stranger', 'curious', 'friend', 'buddy', 'pet']).toContain(quest.minFriendship);
      expect(['found', 'natural', 'handmade', 'curious', 'seasonal', 'story']).toContain(quest.reward.trinketFamily);
      expect(quest.opening.length).toBeGreaterThan(0);
      expect(quest.progressOpening.length).toBeGreaterThan(0);
      expect(quest.turnInOpening.length).toBeGreaterThan(0);
      expect(quest.turnInReply.length).toBeGreaterThan(0);
    }
  });
});

describe('reachability — "never out of reach, always the next step"', () => {
  it('counts a hand-gatherable material as ready', () => {
    setGameStateForTests(createDefaultGameState());
    expect(objectiveReach({ kind: 'collect', resource: 'kraft-twigs', quantity: 4 }, getGameState())).toBe('ready');
  });

  it('counts the first rung of a ladder as ready when its plan is a starter plan', () => {
    setGameStateForTests(createDefaultGameState());
    expect(objectiveReach({ kind: 'craftTool', family: 'shovel', tier: 1 }, getGameState())).toBe('ready');
  });

  it('marks a deep-ladder goal far until its tree node is available', () => {
    setGameStateForTests(createDefaultGameState());
    // heavy-duty-shovel sits behind digging-3, which is locked on a fresh save.
    expect(objectiveReach({ kind: 'craftTool', family: 'shovel', tier: 3 }, getGameState())).toBe('far');
  });

  it('marks an already-done objective as done', () => {
    setGameStateForTests(createDefaultGameState());
    updateGameState((state) => { state.player.visitedBiomes.push('dunes'); });
    expect(objectiveReach({ kind: 'visitBiome', biome: 'dunes' }, getGameState())).toBe('done');
  });

  it('resolves a talk objective against a species, not only one named animal', () => {
    setGameStateForTests(createDefaultGameState());
    // "Tell a meerkat out in the dunes" — phrased as a species on purpose.
    expect(objectiveReach({ kind: 'talk', critterId: 'meerkat' }, getGameState())).toBe('ready');
    updateGameState((draft) => {
      draft.player.metCritters.push('4,1#meerkat');
      draft.player.metCritterSpecies['4,1#meerkat'] = 'meerkat';
    });
    expect(objectiveReach({ kind: 'talk', critterId: 'meerkat' }, getGameState())).toBe('done');
    expect(objectiveMeasure({ kind: 'talk', critterId: 'meerkat' }, getGameState())).toBe(1);
  });

  it('marks a deep dig far while its shovel is still behind a locked lesson', () => {
    setGameStateForTests(createDefaultGameState());
    // Layer 1 wants the flimsy shovel, whose plan is in the starter scrapbook.
    expect(objectiveReach({ kind: 'dig', layer: 1 }, getGameState())).toBe('next-step');
    // Layer 3 wants the heavy-duty shovel, which sits behind `digging-3`.
    expect(objectiveReach({ kind: 'dig', layer: 3 }, getGameState())).toBe('far');
  });

  it('counts only trims of the species that was actually asked for', () => {
    setGameStateForTests(createDefaultGameState());
    updateGameState((draft) => {
      draft.world.pages['0,0'] = {
        terrainEdits: {}, resourceDrops: {},
        treeGrowth: { 'pine-1': { growth: 1, trimmedAt: 0, trims: 2, species: 'pine' } },
        plantedCells: {}, placedEntities: {}, placedPieces: {}, buildSites: {},
      };
    });
    expect(objectiveMeasure({ kind: 'trim', species: 'redwood' }, getGameState())).toBe(0);
    expect(objectiveMeasure({ kind: 'trim', species: 'pine' }, getGameState())).toBe(2);
  });

  it('leaves the dune odyssey ungated so a player cannot lock themselves out of it', () => {
    const odyssey = getQuestDef('odyssey-word-to-the-sentry')!;
    expect(odyssey.requiresQuests ?? []).toHaveLength(0);
  });

  it('refuses to offer a quest with an unreachable objective', () => {
    setGameStateForTests(createDefaultGameState());
    const far = {
      ...getQuestDef('favor-first-shiny')!,
      objectives: [{ kind: 'craftTool', family: 'shovel', tier: 3 } as const],
    };
    expect(questReachable(far, getGameState())).toBe(false);
  });
});

describe('rewards', () => {
  it('pays a distinct trinket every time, for every quest in the catalog', () => {
    for (const quest of allQuestDefs()) {
      const owned = new Set<string>();
      const picked = new Set<string>();
      for (let draw = 0; draw < 8; draw += 1) {
        const def = pickTrinketDef(
          { family: quest.reward.trinketFamily, shapes: quest.reward.trinketShapes, tag: quest.reward.trinketTag },
          owned,
          draw * 7919 + quest.id.length,
        );
        if (draw === 0) expect(def.family).toBe(quest.reward.trinketFamily);
        owned.add(def.id);
        picked.add(def.id);
      }
      expect(picked.size, `quest ${quest.id} repeated a reward`).toBe(8);
    }
  });
});

describe('offering a quest', () => {
  it('never asks a stranger for anything', () => {
    setGameStateForTests(createDefaultGameState());
    expect(selectQuestFor(critter('0,0#raccoon'), 'clearing')).toBeNull();
  });

  it('will ask a friend', () => {
    setGameStateForTests(createDefaultGameState());
    updateGameState((state) => { state.player.friendships['0,0#raccoon'] = 100; });
    const offered = selectQuestFor(critter('0,0#raccoon'), 'clearing');
    // Some quest may be filtered, but at least one must be offerable for a
    // fully-friendly raccoon standing in the clearing.
    expect(offered).not.toBeNull();
    expect(offered && questReachable(offered, getGameState())).toBe(true);
  });

  it('does not re-offer a quest it is already holding', () => {
    setGameStateForTests(createDefaultGameState());
    updateGameState((state) => { state.player.friendships['0,0#raccoon'] = 100; });
    expect(acceptQuest('0,0#raccoon', QUEST_ID)).toBe(true);
    expect(selectQuestFor(critter('0,0#raccoon'), 'clearing')).toBeNull();
  });
});

describe('running a quest to completion', () => {
  it('measures progress, latches satisfaction, then pays out a unique trinket', () => {
    setGameStateForTests(createDefaultGameState());
    const state = getGameState();
    updateGameState((draft) => { draft.player.friendships['0,0#raccoon'] = 100; });

    expect(acceptQuest('0,0#raccoon', QUEST_ID)).toBe(true);
    const quest = getQuestDef(QUEST_ID)!;
    expect(objectiveMeasure(quest.objectives[0], getGameState())).toBe(0);

    // Not done yet.
    refreshQuest('0,0#raccoon');
    expect(hasTurnInReady('0,0#raccoon')).toBe(false);

    // Gather the three confetti stones.
    updateGameState((draft) => { draft.player.inventory['confetti-stones'] = 3; });
    refreshQuest('0,0#raccoon');
    expect(hasTurnInReady('0,0#raccoon')).toBe(true);

    const before = getGameState().player.trinkets.length;
    const result = completeQuest('0,0#raccoon');
    expect(result).not.toBeNull();
    expect(result!.quest.id).toBe(QUEST_ID);

    const after = getGameState();
    expect(after.player.trinkets.length).toBe(before + 1);
    expect(after.player.quests.active['0,0#raccoon']).toBeUndefined();
    expect(after.player.quests.completed).toContain(QUEST_ID);
    expect(after.player.trinkets[0].placed).toBeNull();
    void state;
  });

  it('keeps a satisfied objective satisfied even after the materials are spent', () => {
    setGameStateForTests(createDefaultGameState());
    updateGameState((draft) => { draft.player.friendships['0,0#raccoon'] = 100; });
    acceptQuest('0,0#raccoon', QUEST_ID);
    updateGameState((draft) => { draft.player.inventory['confetti-stones'] = 5; });
    refreshQuest('0,0#raccoon');
    expect(hasTurnInReady('0,0#raccoon')).toBe(true);
    // Spend them all — the favour is already earned.
    updateGameState((draft) => { draft.player.inventory['confetti-stones'] = 0; });
    refreshQuest('0,0#raccoon');
    expect(hasTurnInReady('0,0#raccoon')).toBe(true);
  });
});
