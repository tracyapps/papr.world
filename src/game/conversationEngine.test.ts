import { afterEach, describe, expect, it } from 'vitest';
import { BIOME_IDS, type Biome } from '../sim/catalogs/biomes';
import { RESOURCE_CORE_DEFS } from '../sim/catalogs/resources';
import { SEED_DEFS, formatGrowthTime, plantHarvest } from '../sim/catalogs/seeds';
import { createDefaultGameState, setGameStateForTests } from '../sim/state';
import type { Critter } from './critterBehavior';
import { getConversationMemory } from './conversationMemory';
import {
  pickConversationLine,
  placeKnowledgeFollowUps,
  placeKnowledgeReplies,
  resolveConversationChoice,
  type ConversationContext,
} from './conversationEngine';

afterEach(() => setGameStateForTests(null));

function placeContext(
  biome: Biome,
  x = 0,
  z = 0,
): ConversationContext {
  return {
    pageId: `${Math.round(x / 50)},${Math.round(z / 50)}`,
    biome,
    biomeLabel: biome === 'dunes' ? 'desert' : biome,
    regionName: `Test ${biome}`,
    x,
    z,
  };
}

describe('conversation line selection', () => {
  const lines = ['one', 'two', 'three', 'four'];

  it('cycles by default', () => {
    expect(pickConversationLine(lines, 0)).toBe('one');
    expect(pickConversationLine(lines, 4)).toBe('one');
  });

  it('makes random-mode picks reproducible for the same interaction', () => {
    const first = pickConversationLine(lines, 7, 'random', 'critter:scene:pet');
    const repeated = pickConversationLine(lines, 7, 'random', 'critter:scene:pet');

    expect(lines).toContain(first);
    expect(repeated).toBe(first);
  });

  it('uses the response count when randomizing repeat interactions', () => {
    const picks = Array.from({ length: 8 }, (_, index) => (
      pickConversationLine(lines, index, 'random', 'critter:scene:pet')
    ));

    expect(new Set(picks).size).toBeGreaterThan(1);
  });
});

describe('place knowledge', () => {
  it('has repeatable useful coverage for every live biome', () => {
    for (const biome of BIOME_IDS) {
      const replies = placeKnowledgeReplies(placeContext(biome), 'curious');
      expect(replies.length).toBeGreaterThanOrEqual(4);
      expect(replies.every((reply) => !reply.includes('{{'))).toBe(true);
    }
  });

  it('changes which kind leads by personality without hiding any facts', () => {
    const context = placeContext('meadow');
    const curious = placeKnowledgeReplies(context, 'curious');
    const bold = placeKnowledgeReplies(context, 'bold');

    expect(curious[0]).not.toBe(bold[0]);
    expect([...curious].sort()).toEqual([...bold].sort());
  });

  it('quotes the seed growth and yield catalogs instead of copying their numbers', () => {
    const seedId = 'raspberry-bush-seeds';
    const harvest = plantHarvest(seedId);
    const replies = placeKnowledgeReplies(placeContext('meadow'), 'gentle');
    const raspberry = replies.find((reply) => reply.includes(SEED_DEFS[seedId].name));

    expect(harvest).not.toBeNull();
    expect(raspberry).toContain(formatGrowthTime(seedId));
    expect(raspberry).toContain(`${harvest?.quantity} ${RESOURCE_CORE_DEFS[harvest!.resource].shortLabel}`);
  });

  it('keeps wayfinding nearby and admits when no registered place is close', () => {
    const nearHome = placeKnowledgeReplies(placeContext('clearing'), 'bold');
    const remote = placeKnowledgeReplies(placeContext('meadow', 5_000, 5_000), 'bold');

    expect(nearHome.some((reply) => /is (?:north|south|east|west)/.test(reply))).toBe(true);
    expect(nearHome.some((reply) => /One paper page (?:north|south|east|west)/.test(reply))).toBe(true);
    expect(remote).toContain('“No named landmark is close enough for a short walk from here. Save this place in your scrapbook before you wander farther.”');
  });

  it('opens four repeatable knowledge threads and a route back to everyday chat', () => {
    for (const biome of BIOME_IDS) {
      const choices = placeKnowledgeFollowUps(placeContext(biome), 'curious');
      expect(choices.map((choice) => choice.id)).toEqual([
        'materials', 'harvest', 'wayfinding', 'fun', 'back',
      ]);
      expect(choices.slice(0, -1).every((choice) => choice.replies.length > 0)).toBe(true);
      expect(choices.at(-1)?.returnToEveryday).toBe(true);
    }
  });

  it('keeps the conversation open and remembers exact facts without closing a topic', () => {
    setGameStateForTests(createDefaultGameState());
    const critter = { id: 'thread-test-critter' } as Critter;
    const followUps = placeKnowledgeFollowUps(placeContext('forest'), 'gentle');
    const root = {
      id: 'place',
      label: 'Tell me about this place',
      replies: ['A first local fact.'],
      followUps,
    };
    const opened = resolveConversationChoice(critter, {
      id: 'everyday', opening: 'Hello.', choices: [root],
    }, root);

    expect(opened.endsScene).toBe(false);
    expect(opened.nextScene?.choices).toBe(followUps);

    const materials = opened.nextScene!.choices.find((choice) => choice.id === 'materials')!;
    const first = resolveConversationChoice(critter, opened.nextScene!, materials);
    const second = resolveConversationChoice(critter, opened.nextScene!, materials);
    const flags = getConversationMemory(critter.id).flags;

    expect(first.endsScene).toBe(false);
    expect(second.endsScene).toBe(false);
    expect(first.reply).not.toBe(second.reply);
    expect(flags.filter((flag) => flag.startsWith('place:0,0:materials:'))).toHaveLength(2);
  });
});
