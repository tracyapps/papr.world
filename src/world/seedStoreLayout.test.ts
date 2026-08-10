import { describe, expect, it } from 'vitest';
import { SEED_STORE } from '../sim/catalogs/shops';
import { SEED_DEFS } from '../sim/catalogs/seeds';
import { dominantBiomeAt } from './fields';
import { generatePage } from './generate';
import { findDigFootprintBlocker, isSolidAt } from './footprints';
import {
  GREENHOUSE_AISLE_HALF_WIDTH,
  GREENHOUSE_CLEAR_RADIUS,
  GREENHOUSE_PAGE,
  GREENHOUSE_PLANTERS,
  GREENHOUSE_POSITION,
  groundedLocalY,
} from './seedStoreLayout';

describe('Pip’s walk-through greenhouse layout', () => {
  it('lives on a nearby meadow page', () => {
    expect(GREENHOUSE_PAGE).toEqual({ px: 1, pz: 0 });
    expect(dominantBiomeAt(GREENHOUSE_POSITION.x, GREENHOUSE_POSITION.z)).toBe('meadow');
  });

  it('displays every stocked seed exactly once', () => {
    const displayed = GREENHOUSE_PLANTERS.map((planter) => planter.seedId);
    expect(displayed).toEqual(SEED_STORE.sells);
    expect(new Set(displayed).size).toBe(SEED_STORE.sells.length);
  });

  it('gives every grown plant a bed at least as large as its spacing diameter', () => {
    for (const planter of GREENHOUSE_PLANTERS) {
      const requiredDiameter = SEED_DEFS[planter.seedId].spacing * 2;
      expect(planter.width).toBeGreaterThanOrEqual(requiredDiameter);
      expect(planter.depth).toBeGreaterThanOrEqual(requiredDiameter);
    }
  });

  it('keeps the middle aisle clear from entrance to exit', () => {
    for (const planter of GREENHOUSE_PLANTERS) {
      expect(Math.abs(planter.z) - planter.depth / 2).toBeGreaterThanOrEqual(GREENHOUSE_AISLE_HALF_WIDTH);
    }
    // The greenhouse roof reserves its ground from digging, but the path
    // itself is deliberately not a physical wall.
    expect(findDigFootprintBlocker(GREENHOUSE_POSITION.x, GREENHOUSE_POSITION.z, 0.2)?.label).toBe('Pip’s greenhouse');
    expect(isSolidAt(GREENHOUSE_POSITION.x, GREENHOUSE_POSITION.z, 0.2)).toBe(false);
    const firstPlanter = GREENHOUSE_PLANTERS[0];
    expect(isSolidAt(
      GREENHOUSE_POSITION.x + firstPlanter.x,
      GREENHOUSE_POSITION.z + firstPlanter.z,
      0.2,
    )).toBe(true);
  });

  it('reserves a clean landmark clearing on the generated meadow page', () => {
    const page = generatePage(GREENHOUSE_PAGE.px, GREENHOUSE_PAGE.pz);
    expect(page.props).toContainEqual({ kind: 'unique', unique: 'seedStore' });
    const encroaching = page.props.filter((prop) => (
      'x' in prop && 'z' in prop
      && Math.hypot(prop.x - GREENHOUSE_POSITION.x, prop.z - GREENHOUSE_POSITION.z) < GREENHOUSE_CLEAR_RADIUS
      && !(prop.kind === 'sheet' && prop.map?.kind === 'path')
    ));
    expect(encroaching).toEqual([]);
  });
});

describe('grounded shopkeeper placement', () => {
  it('uses the terrain difference plus the rig’s foot offset, not counter height', () => {
    expect(groundedLocalY(1.45, 1.62, 0.03)).toBeCloseTo(0.2);
    expect(groundedLocalY(1.45, 1.28, 0.03)).toBeCloseTo(-0.14);
  });
});
