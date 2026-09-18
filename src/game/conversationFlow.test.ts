import { afterEach, describe, expect, it } from 'vitest';
import rawContent from '../content/conversations.json';
import { createDefaultGameState, setGameStateForTests } from '../sim/state';
import { dominantBiomeAt } from '../world/fields';
import { PAGE_SIZE } from '../world/types';
import type { Critter } from './critterBehavior';
import type { CritterSpecies, PersonalityTrait } from './critterVariation';
import {
  beginCritterConversation,
  everydayConversation,
  resolveConversationChoice,
  type ConversationChoice,
  type ConversationScene,
} from './conversationEngine';

// Conversation *flow*: every exchange must leave the player somewhere to go.
// Written after playtesting found scenes whose buttons never changed after
// answering, storylets with no way back to small talk, and every stranger in
// the jungle opening on the same tool-ladder lecture.

afterEach(() => setGameStateForTests(null));

type RawStorylet = { id: string; opening: string[]; choices: ConversationChoice[] };
const STORYLETS = (rawContent as unknown as { storylets: RawStorylet[] }).storylets;

function fakeCritter(id: string, species: CritterSpecies, x: number, z: number, trait: PersonalityTrait = 'curious'): Critter {
  return {
    id,
    species,
    params: { name: 'Tester', personality: [trait, 'gentle'] },
    rig: { group: { position: { x, y: 0, z } } },
  } as unknown as Critter;
}

function tropicalSpot(): [number, number] {
  for (let radius = 0; radius < 80; radius += 1) {
    for (let px = -radius; px <= radius; px += 1) {
      for (const pz of [-radius, radius]) {
        if (dominantBiomeAt(px * PAGE_SIZE, pz * PAGE_SIZE) === 'tropical') return [px * PAGE_SIZE, pz * PAGE_SIZE];
      }
    }
  }
  throw new Error('no tropical page found');
}

function expectWayForward(before: ConversationScene, after: ConversationScene | undefined, label: string) {
  expect(after, `${label}: no next scene`).toBeDefined();
  expect(after!.choices.length, `${label}: no choices left`).toBeGreaterThan(0);
  expect(
    after!.choices.some((choice) => choice.returnToEveryday || choice.endsScene || choice.followUps?.length),
    `${label}: no way out`,
  ).toBe(true);
  const beforeLabels = before.choices.map((choice) => choice.label).join('|');
  const afterLabels = after!.choices.map((choice) => choice.label).join('|');
  expect(afterLabels, `${label}: choices did not change after answering`).not.toBe(beforeLabels);
}

describe('no dead ends', () => {
  it('every open storylet question leads somewhere new, with a way out', () => {
    setGameStateForTests(createDefaultGameState());
    const critter = fakeCritter('flow#1', 'squirrel', 0, 0);
    for (const storylet of STORYLETS) {
      const scene: ConversationScene = { id: storylet.id, opening: storylet.opening[0], choices: storylet.choices };
      for (const choice of storylet.choices) {
        if (choice.endsScene) continue;
        const result = resolveConversationChoice(critter, scene, choice);
        const next = result.nextScene;
        expectWayForward(scene, next, `${storylet.id} → ${choice.id}`);
        // One more level: follow-up questions must also move on.
        for (const deeper of next!.choices) {
          if (deeper.endsScene || deeper.returnToEveryday) continue;
          expectWayForward(next!, resolveConversationChoice(critter, next!, deeper).nextScene, `${storylet.id} → ${choice.id} → ${deeper.id}`);
        }
      }
    }
  });

  it('the everyday menu changes after each answer, keeps a goodbye, and refreshes when used up', () => {
    setGameStateForTests(createDefaultGameState());
    const critter = fakeCritter('flow#2', 'parrot', 0, 0);
    let scene = everydayConversation(critter);
    expect(scene.choices.at(-1)?.action).toBe('goodbye');
    for (let step = 0; step < 20; step += 1) {
      const choice = scene.choices.find((candidate) => !candidate.followUps?.length && candidate.action !== 'goodbye');
      if (!choice) break;
      const result = resolveConversationChoice(critter, scene, choice);
      expect(result.nextScene, `step ${step}`).toBeDefined();
      expect(result.nextScene!.choices.some((candidate) => candidate.action === 'goodbye')).toBe(true);
      scene = result.nextScene!;
    }
  });
});

describe('first meetings', () => {
  it('vary between critters instead of all opening on one scene', () => {
    for (const [x, z] of [[0, 0], tropicalSpot()]) {
      setGameStateForTests(createDefaultGameState());
      const openings = new Set<string>();
      for (let index = 0; index < 24; index += 1) {
        const scene = beginCritterConversation(fakeCritter(`first#${x}:${index}`, 'toucan', x, z));
        openings.add(scene.id);
        // A tool lecture is not a hello.
        expect(scene.id.startsWith('ladder-'), scene.id).toBe(false);
      }
      expect(openings.size, [...openings].join(', ')).toBeGreaterThanOrEqual(3);
    }
  });
});
