import { describe, expect, test } from 'vitest';
import {
  getResourceArt,
  resourceArtVariant,
  type ResourceArt,
} from './resourcePresentation';

describe('resource presentation', () => {
  test('reads compiled loose variants from the generated art', () => {
    const art = getResourceArt('terracotta-pebbles');
    expect(art?.sourceUrl).toBe('/assets/runtime/resources/terracotta-pebbles/loose-01.png');
    expect(art?.variants).toHaveLength(6);
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
