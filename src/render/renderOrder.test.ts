import { describe, expect, it } from 'vitest';
import { RENDER_ORDER } from './renderOrder';

// Draw-order invariants.
//
// The bug these guard: biome ground overlays were given `renderOrder = 1..3`,
// which put them *after* the avatar in the transparent pass. The avatar is
// `transparent: true, depthWrite: false` (it has to be, so it can fade out in
// first person), so it writes no depth — and flat sheets lying on the ground
// painted straight over the paper potato.
//
// The rule is positional, not aesthetic, so it can be checked mechanically.

/** Everything that lies flat on the ground and must never cover the player. */
const GROUND_BAND = [
  RENDER_ORDER.biomeOverlay,
  RENDER_ORDER.water,
  RENDER_ORDER.ripple,
  RENDER_ORDER.gardenRing,
] as const;

/** Scenery that must stay behind the world. */
const BACKGROUND = [
  RENDER_ORDER.sky,
  RENDER_ORDER.backdropFar,
  RENDER_ORDER.backdropMid,
  RENDER_ORDER.backdropNear,
  RENDER_ORDER.cloudsHigh,
  RENDER_ORDER.cloudsLow,
] as const;

// Vite's raw glob rather than node:fs, so the test needs no Node type
// definitions and runs the same way the app is bundled.
const SOURCES = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('render order', () => {
  it('keeps every ground-plane layer below the world', () => {
    // The avatar and critters sit at the default 0. Anything flat on the
    // ground must be strictly below that or it draws over them.
    for (const order of GROUND_BAND) {
      expect(order).toBeLessThan(RENDER_ORDER.world);
    }
  });

  it('leaves room for a biome overlay stack without reaching the world', () => {
    // Overlays use `biomeOverlay + layer` for up to three extra biomes.
    expect(RENDER_ORDER.biomeOverlay + 3).toBeLessThan(RENDER_ORDER.world);
  });

  it('orders the ground band from the ground upward', () => {
    // Soil under water, water under its own ripples.
    expect(RENDER_ORDER.biomeOverlay).toBeLessThan(RENDER_ORDER.water);
    expect(RENDER_ORDER.water).toBeLessThan(RENDER_ORDER.ripple);
  });

  it('keeps background scenery behind everything on the ground', () => {
    for (const order of BACKGROUND) {
      expect(order).toBeLessThan(Math.min(...GROUND_BAND));
    }
    expect(RENDER_ORDER.sky).toBeLessThan(Math.min(...BACKGROUND.slice(1)));
  });

  it('puts celebratory effects above the world', () => {
    expect(RENDER_ORDER.hearts).toBeGreaterThan(RENDER_ORDER.world);
  });

  it('routes every renderOrder assignment through RENDER_ORDER', () => {
    // Every assignment must go through RENDER_ORDER, otherwise the constants
    // above describe a convention nothing actually follows — which is how the
    // overlay bug happened in the first place.
    //
    // Note: an earlier version of this check only matched numeric literals
    // (`renderOrder = 3`). It passed when the original bug was reintroduced,
    // because that bug assigned a *variable* (`renderOrder = layer`). Match
    // the assignment, then require RENDER_ORDER on the right-hand side —
    // never try to enumerate the wrong shapes.
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      if (file.endsWith('.test.ts') || file.endsWith('renderOrder.ts')) continue;
      for (const [index, line] of source.split('\n').entries()) {
        const code = line.split('//')[0];
        // `renderOrder: number` in a type is a declaration, not an assignment.
        if (/renderOrder\??\s*:\s*number/.test(code)) continue;

        const assignment = code.match(/renderOrder\s*[=:]\s*([^,;]+)/);
        if (!assignment) continue;
        const value = assignment[1].trim();
        if (value.includes('RENDER_ORDER')) continue;
        // Pass-throughs are fine: a helper taking a `renderOrder` parameter,
        // or reading `spec.renderOrder` off a config object. The value came
        // from a call site, and that call site is checked by this same rule.
        if (/^[\w.]*\brenderOrder$/.test(value)) continue;
        offenders.push(`${file}:${index + 1} ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
