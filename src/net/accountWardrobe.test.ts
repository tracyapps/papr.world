import { describe, expect, it } from 'vitest';
import type { AvatarDesign } from '../../shared/src/index';
import { accountApiBase, planWardrobeSync } from './accountWardrobe';

function look(id: string, updatedAt: number): AvatarDesign {
  return {
    version: 1,
    id,
    name: id,
    silhouette: 'round-pal',
    paper: { color: 'kraft', pattern: 'plain' },
    strokes: [],
    preset: 'medium',
    sharedOnCard: false,
    createdAt: 1,
    updatedAt,
  };
}

const ids = (designs: AvatarDesign[]) => designs.map((design) => design.id);

describe('planning a wardrobe sync', () => {
  it('lets the most recently changed copy of a look win', () => {
    const plan = planWardrobeSync(
      [look('edited-here', 20), look('edited-there', 10), look('same', 5)],
      [look('edited-here', 10), look('edited-there', 20), look('same', 5)],
      {}, [], null,
    );
    expect(ids(plan.push)).toEqual(['edited-here']);
    expect(ids(plan.pull)).toEqual(['edited-there']);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.deleteRemote).toEqual([]);
  });

  it('brings down looks made elsewhere and sends up looks made here', () => {
    const plan = planWardrobeSync([look('new-here', 3)], [look('made-at-desk', 4)], {}, [], null);
    expect(ids(plan.pull)).toEqual(['made-at-desk']);
    expect(ids(plan.push)).toEqual(['new-here']);
  });

  it('finishes a delete made here while offline instead of pulling it back', () => {
    const plan = planWardrobeSync([], [look('deleted-here', 4)], { 'deleted-here': 4 }, ['deleted-here'], null);
    expect(plan.deleteRemote).toEqual(['deleted-here']);
    expect(plan.pull).toEqual([]);
  });

  it('removes a synced, unchanged look that was deleted on another device', () => {
    const plan = planWardrobeSync([look('gone', 4)], [], { gone: 4 }, [], null);
    expect(plan.deleteLocal).toEqual(['gone']);
    expect(plan.push).toEqual([]);
  });

  it('never deletes work: an edited look, or the one being worn, is pushed instead', () => {
    const edited = planWardrobeSync([look('edited', 9)], [], { edited: 4 }, [], null);
    expect(ids(edited.push)).toEqual(['edited']);
    const worn = planWardrobeSync([look('worn', 4)], [], { worn: 4 }, [], 'worn');
    expect(ids(worn.push)).toEqual(['worn']);
    expect(worn.deleteLocal).toEqual([]);
  });
});

describe('finding the account service', () => {
  it('uses the neighborhood server over https', () => {
    expect(accountApiBase('wss://rooms.papr.world', false)).toBe('https://rooms.papr.world');
  });

  it('has no account service in a production build with no server set', () => {
    expect(accountApiBase(undefined, false)).toBeNull();
    expect(accountApiBase(undefined, true)).toBe('http://localhost:2567');
  });
});
