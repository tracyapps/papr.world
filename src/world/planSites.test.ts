import { describe, expect, it } from 'vitest';
import { obtainRoutesFor, toolRequiredFor } from '../sim/catalogs/obtaining';
import { RECIPE_DEFS, isRecipeAvailable, type RecipeId } from '../sim/catalogs/recipes';
import { TOOL_DEFS, toolsInFamily } from '../sim/catalogs/tools';
import { DETECTOR_BANDS, bandIntensity, detectorReadingAt } from './planDetector';
import {
  allPlanSites,
  clearPlanSiteCache,
  findablePlanIds,
  planExactIngredients,
  planIngredientBiomes,
  planSiteFor,
} from './planSites';

describe('findable plans', () => {
  it('excludes the plans you start with', () => {
    const findable = new Set(findablePlanIds());
    expect(findable.has('flimsy-shovel')).toBe(false);
    expect(findable.has('creased-hoe')).toBe(false);
    expect(findable.has('kids-scissors')).toBe(false);
  });

  it('never sites a tool plan — higher rungs come from the knowledge tree', () => {
    for (const recipeId of findablePlanIds()) {
      expect(RECIPE_DEFS[recipeId].output.kind).not.toBe('tool');
    }
    expect(findablePlanIds()).not.toContain('sturdy-scissors');
    expect(findablePlanIds()).not.toContain('okayish-shovel');
  });

  it('refuses a direct attempt to site a tool plan', () => {
    expect(() => planSiteFor('sturdy-scissors')).toThrow(/knowledge tree/);
  });

  it('never offers a plan the player could not then use', () => {
    for (const recipeId of findablePlanIds()) {
      expect(isRecipeAvailable(recipeId)).toBe(true);
    }
  });
});

describe('plan siting', () => {
  it('is deterministic across cache clears', () => {
    const first = planSiteFor('tape-tapper');
    clearPlanSiteCache();
    const second = planSiteFor('tape-tapper');
    expect(second).toEqual(first);
  });

  it('gives every findable plan a site', () => {
    const sites = allPlanSites();
    expect(sites.length).toBe(findablePlanIds().length);
    for (const site of sites) {
      expect(Number.isFinite(site.x)).toBe(true);
      expect(Number.isFinite(site.z)).toBe(true);
    }
  });

  it('never puts two plans in the same place', () => {
    const keys = allPlanSites().map((site) => `${site.x},${site.z}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps plans away from the starting clearing', () => {
    // A plan a player trips over on their first walk is not found, it is
    // handed to them — and the tier ladder stops meaning anything.
    for (const site of allPlanSites()) {
      expect(Math.hypot(site.x, site.z)).toBeGreaterThan(150);
    }
  });

  it('keeps an everything-else plan in the default journey ring', () => {
    const site = planSiteFor('tape-tapper');
    expect(Math.hypot(site.x, site.z)).toBeGreaterThanOrEqual(220);
    expect(Math.hypot(site.x, site.z)).toBeLessThanOrEqual(620);
  });

  it('never has to fall back', () => {
    // `fallback` means a plan had a regional home and the tier ring could not
    // reach it. That is the one siting outcome worth investigating, so it is
    // asserted against rather than tolerated.
    for (const site of [planSiteFor('tape-tapper'), planSiteFor('crease-scout')]) {
      expect(site.siting).not.toBe('fallback');
    }
  });

  it('documents that no everything-else plan is playable yet', () => {
    // The siting machinery stays testable against planned world recipes, but
    // none should enter the live site list until its recipe is playable.
    expect(allPlanSites()).toEqual([]);
  });

  it('drops ingredients that are available everywhere', () => {
    // An ingredient found in every biome carries no signal. Counting it would
    // make the bias look like it worked while doing nothing.
    expect(planIngredientBiomes('tape-tapper')).toEqual([]);
  });
});

describe('a plan never requires the tool it unlocks', () => {
  // The one hard constraint from docs/plans-and-blueprints.md. Getting this
  // wrong produces a plan nobody can ever use, and nothing else in the game
  // would notice — the Thing Maker would happily show a recipe whose
  // ingredients are gated behind the tool that recipe makes.
  it('holds for every ready recipe', () => {
    const offenders: string[] = [];

    for (const recipeId of Object.keys(RECIPE_DEFS) as RecipeId[]) {
      if (!isRecipeAvailable(recipeId)) continue;
      const output = RECIPE_DEFS[recipeId].output;
      if (output.kind !== 'tool') continue;

      const madeTool = TOOL_DEFS[output.toolId];
      for (const resource of planExactIngredients(recipeId)) {
        const needed = toolRequiredFor(resource);
        if (!needed) continue;
        const neededTool = TOOL_DEFS[needed];
        const sameLadder = neededTool.family === madeTool.family;
        if (sameLadder && neededTool.tier >= madeTool.tier) {
          offenders.push(`${recipeId} needs ${resource}, gated behind ${needed}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('would catch a deadlock if one were introduced', () => {
    // Guards the guard: bark curls need tier-2 scissors, so a tier-2 scissors
    // recipe asking for them is exactly the bug above. If this stops being
    // true the test at the top has quietly become decorative.
    const needed = toolRequiredFor('redwood-bark-curls');
    expect(needed).not.toBeNull();
    expect(TOOL_DEFS[needed!].family).toBe('scissors');
    expect(TOOL_DEFS[needed!].tier).toBeGreaterThanOrEqual(2);
  });

  it('leaves hand-gathered materials unconstrained', () => {
    // Anything you can pick up needs no tool, so it can never deadlock.
    expect(toolRequiredFor('kraft-twigs')).toBeNull();
    expect(obtainRoutesFor('kraft-twigs').some((route) => route.kind === 'scattered')).toBe(true);
  });
});

describe('plan detector', () => {
  const site = planSiteFor('tape-tapper');

  it('reads "here" standing on the site', () => {
    const reading = detectorReadingAt('tape-tapper', site.x, site.z);
    expect(reading.band).toBe('here');
    expect(reading.atSite).toBe(true);
  });

  it('cools as you walk away', () => {
    const bands = [0, 40, 100, 300, 2000].map(
      (offset) => detectorReadingAt('tape-tapper', site.x + offset, site.z).band,
    );
    const intensities = bands.map(bandIntensity);
    for (let index = 1; index < intensities.length; index += 1) {
      expect(intensities[index]).toBeLessThan(intensities[index - 1]);
    }
  });

  it('reads the same in every direction at the same distance', () => {
    // The detector must not leak a bearing. Equal distance, equal reading —
    // otherwise a player could triangulate and the walk stops being the point.
    const radius = 100;
    const readings = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) =>
      detectorReadingAt(
        'tape-tapper',
        site.x + Math.cos(angle) * radius,
        site.z + Math.sin(angle) * radius,
      ).band,
    );
    expect(new Set(readings).size).toBe(1);
  });

  it('is coarse enough that small steps do not change the reading', () => {
    // A reading that changes every step is a compass with extra steps.
    const base = detectorReadingAt('tape-tapper', site.x + 200, site.z);
    const nudged = detectorReadingAt('tape-tapper', site.x + 205, site.z);
    expect(nudged.band).toBe(base.band);
  });

  it('goes cold far away', () => {
    expect(detectorReadingAt('tape-tapper', site.x + 5000, site.z).band).toBe('cold');
  });

  it('tunes to one plan at a time', () => {
    // Standing on one plan's site should not read hot for a different plan.
    const reading = detectorReadingAt('crease-scout', site.x, site.z);
    expect(reading.atSite).toBe(false);
  });

  it('exposes bands coldest first', () => {
    expect(DETECTOR_BANDS[0]).toBe('cold');
    expect(DETECTOR_BANDS[DETECTOR_BANDS.length - 1]).toBe('here');
  });
});

describe('tool ladder assumptions this file relies on', () => {
  it('still has scissors tiers 1 and 2', () => {
    const scissors = toolsInFamily('scissors');
    expect(scissors.map((id) => TOOL_DEFS[id].tier)).toEqual([1, 2]);
  });
});
