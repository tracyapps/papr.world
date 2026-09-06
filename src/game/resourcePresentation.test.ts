import { describe, expect, test } from 'vitest';
import {
  getResourceArt,
  resourceArtVariant,
  type ResourceArt,
} from './resourcePresentation';

describe('resource presentation', () => {
  test('keeps legacy art available while resources migrate to generated tiles', () => {
    const art = getResourceArt('terracotta-pebbles');
    expect(art?.sourceUrl).toBe('/assets/runtime/resources/terracotta-pebbles.png');
    expect(art?.variants).toHaveLength(1);
  });

  test('selects generated loose variants deterministically', () => {
    const art: ResourceArt = {
      sourceUrl: '/first.png',
      aspectRatio: 2,
      variants: [
        { sourceUrl: '/first.png', aspectRatio: 2 },
        { sourceUrl: '/second.png', aspectRatio: 1.5 },
        { sourceUrl: '/third.png', aspectRatio: 1 },
      ],
    };

    expect(resourceArtVariant(art, 4).sourceUrl).toBe('/second.png');
    expect(resourceArtVariant(art, 4)).toEqual(resourceArtVariant(art, 4));
    expect(resourceArtVariant(art, -1).sourceUrl).toBe('/second.png');
  });
});
