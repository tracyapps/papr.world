import { describe, expect, it, vi } from 'vitest';

vi.mock('../render/context', () => ({ textureLoader: { load: () => ({}) } }));

const { findDigFootprintBlocker, findSolidBlocker, isSolidAt } = await import('./footprints');
const { getPage } = await import('./pages');

// The clearing has to be loaded before movement queries can see it.
//
// This is the point of the split: `findDigFootprintBlocker` generates pages on
// demand, because a hover or a click must be answered correctly even about a
// page that hasn't streamed in. `findSolidBlocker` only looks at pages that
// already exist, because it runs every frame for every nearby critter and a
// walking animal must never trigger world generation.
getPage(0, 0);

// The clearing's authored obstructions, from CLEARING_DETAIL_FOOTPRINTS.
const THING_MAKER = { x: -0.12, z: -3.22 };
const HOUSE = { x: 2.7, z: 0.35 };
const POND = { x: -5.2, z: 4.7 };
const OPEN_GROUND = { x: -8.5, z: -1.2 };

describe('footprints', () => {
  it('separates "cannot dig here" from "cannot walk here"', () => {
    // The distinction the `solid` flag exists for. Conflating the two would
    // either let critters walk through the Thing Maker or make them refuse to
    // cross a scattered twig.
    expect(findSolidBlocker(THING_MAKER.x, THING_MAKER.z, 0)?.label).toBe('the Thing Maker');
    expect(findDigFootprintBlocker(THING_MAKER.x, THING_MAKER.z, 0)?.label).toBe('the Thing Maker');
  });

  it('lets things walk over the pond and loose material', () => {
    // Water blocks digging, but critters wade rather than bouncing off it —
    // avoidance lives in the water registry, not here.
    expect(findDigFootprintBlocker(POND.x, POND.z, 0)).not.toBeNull();
    expect(findSolidBlocker(POND.x, POND.z, 0)).toBeNull();
  });

  it('blocks the buildings a cat kept walking into', () => {
    expect(isSolidAt(THING_MAKER.x, THING_MAKER.z)).toBe(true);
    expect(isSolidAt(HOUSE.x, HOUSE.z)).toBe(true);
  });

  it('leaves open ground open', () => {
    expect(isSolidAt(OPEN_GROUND.x, OPEN_GROUND.z)).toBe(false);
    expect(findSolidBlocker(OPEN_GROUND.x, OPEN_GROUND.z, 0.2)).toBeNull();
  });

  it('grows the blocked area with the mover’s body radius', () => {
    // Just outside the Thing Maker's footprint: free for a point, blocked for
    // something with a body. This is what stops a critter ending up half
    // inside a wall.
    const justOutside = { x: THING_MAKER.x + 1.4, z: THING_MAKER.z };
    expect(isSolidAt(justOutside.x, justOutside.z, 0)).toBe(false);
    expect(isSolidAt(justOutside.x, justOutside.z, 0.3)).toBe(true);
  });

  it('treats an unloaded page as empty for movement, but not for digging', () => {
    // Far from anything loaded. Nothing is drawn there, so nothing can obstruct
    // anyone — and asking must not build the place just to answer.
    const FAR = { x: 4000, z: 4000 };
    expect(findSolidBlocker(FAR.x, FAR.z, 0.2)).toBeNull();
    // Digging there still gets a real answer, generating the page if needed.
    expect(() => findDigFootprintBlocker(FAR.x, FAR.z, 0.2)).not.toThrow();
  });

  it('reports the blocker so refusals can name it', () => {
    const blocker = findSolidBlocker(HOUSE.x, HOUSE.z, 0);
    expect(blocker?.label).toBe('the house');
    expect(blocker?.id).toBe('starter-house');
  });
});

describe('a tree claims more ground than it physically occupies', () => {
  // The clearing's cozy treeline sits at known spots; roots block digging
  // out to 0.52, but the trunk you can actually see is 0.28.
  const [treeX, treeZ] = [-9.2, -7.2];
  const PLAYER = 0.22;

  it('refuses a dig against the roots', () => {
    expect(findDigFootprintBlocker(treeX + 0.6, treeZ, 0.425)?.label).toBe('a tree');
  });

  it('lets you walk closer than you can dig', () => {
    // The regression this guards: one radius served both, so the player
    // stopped 0.74 units from a trunk drawn at 0.28 — an invisible wall more
    // than twice the width of the tree, felt as a sticky treeline.
    expect(findSolidBlocker(treeX + 0.6, treeZ, PLAYER)).toBeNull();
    expect(findDigFootprintBlocker(treeX + 0.6, treeZ, PLAYER)).not.toBeNull();
  });

  it('still stops you at the trunk itself', () => {
    expect(findSolidBlocker(treeX + 0.2, treeZ, PLAYER)?.label).toBe('a tree');
    expect(isSolidAt(treeX, treeZ, PLAYER)).toBe(true);
  });

  it('keeps genuinely solid things solid to their full width', () => {
    // The Thing Maker declares no separate physical radius, so it blocks
    // movement exactly as far as it blocks digging. The default must not
    // quietly shrink everything that never opted in.
    expect(findSolidBlocker(-0.12 + 1.2, -3.22, PLAYER)?.label).toBe('the Thing Maker');
    expect(findDigFootprintBlocker(-0.12 + 1.2, -3.22, PLAYER)?.label).toBe('the Thing Maker');
  });
});
