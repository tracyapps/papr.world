import { describe, expect, it } from 'vitest';
import { applyGameCommand } from './commands';
import { createDefaultGameState, type GameState } from './state';
import { abilityPlanId } from './catalogs/recipes';
import { ABILITY_DEFS, type AbilityId } from './catalogs/abilities';
import { TECH_DEFS, techNodeTeachingAbility } from './catalogs/techTree';
import { RESOURCE_CORE_DEFS } from './catalogs/resources';
import {
  DWELLING_PART_DEFS,
  DWELLING_PART_IDS,
  DWELLING_REFUND_LOSS_PERCENT,
  dwellingPartDef,
  dwellingStage,
  refundQuantity,
  type DwellingPartId,
} from './catalogs/dwellings';
import { collectingPercent, partStatus, remainingCost, settleDwelling } from './dwelling';
import { sanitizeDwelling } from './dwellingState';

const T0 = 1_000_000;

function know(state: GameState, ...abilities: AbilityId[]) {
  for (const ability of abilities) {
    const plan = abilityPlanId(ability);
    if (plan && !state.player.plans.includes(plan)) state.player.plans.push(plan);
  }
}

function stock(state: GameState, partId: DwellingPartId, times = 1) {
  for (const line of dwellingPartDef(partId).cost) {
    state.player.inventory[line.resource] = (state.player.inventory[line.resource] ?? 0) + line.quantity * times;
  }
}

function give(state: GameState, partId: DwellingPartId, now = T0) {
  return applyGameCommand(state, { type: 'contributeToProject', partId, now });
}

/** A house with the floor finished, ready for the next lesson. */
function withFloor(): GameState {
  const state = createDefaultGameState();
  know(state, 'house-floors');
  stock(state, 'floor');
  expect(give(state, 'floor').ok).toBe(true);
  applyGameCommand(state, { type: 'settleDwelling', now: T0 + 10_000_000 });
  expect(state.world.dwelling.parts).toEqual(['floor']);
  return state;
}

describe('the dwelling catalog', () => {
  it('starts every player in a tent, with nothing built', () => {
    const state = createDefaultGameState();
    expect(state.world.dwelling).toEqual({ parts: [], projects: {} });
    expect(dwellingStage(state.world.dwelling.parts)).toBe('tent');
  });

  it('lists parts so that every requirement comes earlier, and never requires itself', () => {
    DWELLING_PART_IDS.forEach((id, index) => {
      for (const required of dwellingPartDef(id).requiresParts) {
        expect(DWELLING_PART_IDS.indexOf(required), `${id} requires ${required}`).toBeLessThan(index);
      }
    });
  });

  it('costs only real, refined materials, in whole positive amounts', () => {
    for (const id of DWELLING_PART_IDS) {
      const def = dwellingPartDef(id);
      expect(def.cost.length).toBeGreaterThan(0);
      for (const line of def.cost) {
        expect(Number.isInteger(line.quantity) && line.quantity > 0, `${id} ${line.resource}`).toBe(true);
        expect(RESOURCE_CORE_DEFS[line.resource].category, `${id} ${line.resource}`).toBe('refined');
      }
    }
  });

  it('asks for structural class 3 materials only for the upper storey', () => {
    for (const id of DWELLING_PART_IDS) {
      const classes = dwellingPartDef(id).cost.map((line) => RESOURCE_CORE_DEFS[line.resource].structuralClass);
      const highest = Math.max(...classes);
      expect(highest, id).toBe(id === 'upstairs' ? 3 : Math.min(highest, 2));
    }
  });

  it('waits on know-how that a ready lesson really teaches', () => {
    for (const id of DWELLING_PART_IDS) {
      const ability = dwellingPartDef(id).requiresAbility;
      expect(ability in ABILITY_DEFS).toBe(true);
      const lessonId = techNodeTeachingAbility(ability);
      expect(lessonId, ability).not.toBeNull();
      expect(TECH_DEFS[lessonId!].readiness).toBe('ready');
    }
  });

  it('says the exterior stage from the parts standing', () => {
    expect(dwellingStage(['floor'])).toBe('shell');
    expect(dwellingStage(['floor', 'walls'])).toBe('shell');
    expect(dwellingStage(['floor', 'walls', 'roof'])).toBe('cottage');
    expect(dwellingStage(['floor', 'walls', 'roof', 'upstairs'])).toBe('house');
  });
});

describe('putting materials in', () => {
  it('refuses until the lesson is learned, and names the lesson', () => {
    const state = createDefaultGameState();
    stock(state, 'floor');
    const result = give(state, 'floor');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Floors');
    expect(partStatus(state, 'floor')).toBe('needs-know-how');
    expect(state.world.dwelling.projects).toEqual({});
  });

  it('refuses a part whose earlier part is not built', () => {
    const state = createDefaultGameState();
    know(state, 'house-walls');
    stock(state, 'walls');
    const result = give(state, 'walls');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('floor');
    expect(partStatus(state, 'walls')).toBe('needs-parts');
  });

  it('takes what it can and says what is still needed, in words', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    state.player.inventory.layerboard = 3;
    const result = give(state, 'floor');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toContain('Still needed');
      expect(result.message).toContain('%');
    }
    expect(state.player.inventory.layerboard).toBe(0);
    expect(partStatus(state, 'floor')).toBe('collecting');
    expect(remainingCost('floor', state.world.dwelling.projects.floor)).toEqual([
      { resource: 'layerboard', quantity: 1 },
      { resource: 'binding-cord', quantity: 2 },
    ]);
    expect(collectingPercent('floor', state.world.dwelling.projects.floor)).toBe(Math.floor((3 / 6) * 100));
  });

  it('can be topped up over several visits, one material at a time', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    state.player.inventory.layerboard = 10;
    state.player.inventory['binding-cord'] = 5;
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', resource: 'layerboard', quantity: 2, now: T0 }).ok).toBe(true);
    expect(state.player.inventory.layerboard).toBe(8);
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', resource: 'binding-cord', now: T0 }).ok).toBe(true);
    expect(state.player.inventory['binding-cord']).toBe(3);
    expect(partStatus(state, 'floor')).toBe('collecting');
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', now: T0 }).ok).toBe(true);
    // Never takes more than the part needs.
    expect(state.player.inventory.layerboard).toBe(6);
    expect(partStatus(state, 'floor')).toBe('building');
  });

  it('refuses with a clear reason when the bag has none of it', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    const result = give(state, 'floor');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Layerboard');
  });

  it('rejects nonsense amounts and materials the part does not use', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    state.player.inventory.layerboard = 5;
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', quantity: 0, now: T0 }).ok).toBe(false);
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', quantity: 1.5, now: T0 }).ok).toBe(false);
    expect(applyGameCommand(state, { type: 'contributeToProject', partId: 'floor', resource: 'red-brick', now: T0 }).ok).toBe(false);
    expect(state.player.inventory.layerboard).toBe(5);
  });

  it('starts the build the moment the last material is in, and does not take more', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    stock(state, 'floor');
    const result = give(state, 'floor');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain('minute');
    const project = state.world.dwelling.projects.floor!;
    expect(project.startedAt).toBe(T0);
    expect(project.completesAt).toBe(T0 + dwellingPartDef('floor').buildSeconds * 1000);
    expect(partStatus(state, 'floor')).toBe('building');
    const again = give(state, 'floor', T0 + 1000);
    expect(again.ok).toBe(false);
  });

  it('allows at most two projects at once', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors', 'house-walls', 'house-rooms');
    state.world.dwelling.parts = ['floor'];
    state.player.inventory.layerboard = 50;
    state.player.inventory['red-brick'] = 50;
    state.player.inventory['binding-cord'] = 50;
    state.player.inventory['paper-mortar'] = 50;
    expect(give(state, 'walls').ok).toBe(true);
    state.world.dwelling.parts = ['floor', 'walls'];
    expect(give(state, 'room-1').ok).toBe(true);
    // Third: nothing else is unlocked, so fake a second one already in the ledger.
    state.world.dwelling.projects['room-2'] = { paid: { layerboard: 1 }, startedAt: null, completesAt: null };
    const third = give(state, 'roof');
    expect(third.ok).toBe(false);
  });
});

describe('the wait', () => {
  it('finishes a part only once its time has come, and only once', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    stock(state, 'floor');
    give(state, 'floor');
    const done = T0 + dwellingPartDef('floor').buildSeconds * 1000;
    expect(settleDwelling(state, done - 1)).toEqual([]);
    expect(state.world.dwelling.parts).toEqual([]);
    expect(settleDwelling(state, done)).toEqual(['floor']);
    expect(state.world.dwelling.parts).toEqual(['floor']);
    expect(state.world.dwelling.projects.floor).toBeUndefined();
    expect(settleDwelling(state, done + 999_999)).toEqual([]);
    expect(state.world.dwelling.parts).toEqual(['floor']);
  });

  it('runs while the player is away: any later command settles it, and says so', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    stock(state, 'floor');
    give(state, 'floor');
    const later = applyGameCommand(state, { type: 'settleDwelling', now: T0 + 86_400_000 });
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.message).toContain('Floor');
    expect(state.world.dwelling.parts).toEqual(['floor']);
  });

  it('logs the finished part once, however often it is settled', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    stock(state, 'floor');
    give(state, 'floor');
    const at = T0 + 10_000_000;
    applyGameCommand(state, { type: 'settleDwelling', now: at });
    applyGameCommand(state, { type: 'settleDwelling', now: at + 5 });
    expect(state.player.activityLog.filter((entry) => entry.id.startsWith('dwelling:floor:done'))).toHaveLength(1);
  });

  it('keeps finished parts in build order', () => {
    const state = createDefaultGameState();
    state.world.dwelling.parts = ['floor'];
    state.world.dwelling.projects.walls = { paid: { layerboard: 6, 'red-brick': 4, 'binding-cord': 2 }, startedAt: 0, completesAt: 5 };
    settleDwelling(state, 10);
    expect(state.world.dwelling.parts).toEqual(['floor', 'walls']);
  });
});

describe('taking materials back', () => {
  it('rounds to the nearest piece, so small stacks lose almost nothing', () => {
    expect(refundQuantity(1, 10)).toBe(1);
    expect(refundQuantity(2, 5)).toBe(2);
    expect(refundQuantity(10, 10)).toBe(9);
    expect(refundQuantity(20, 5)).toBe(19);
    expect(refundQuantity(6, 0)).toBe(6);
    expect(refundQuantity(0, 10)).toBe(0);
    expect(refundQuantity(Number.NaN, 10)).toBe(0);
  });

  it('records the decided loss for each situation', () => {
    expect(DWELLING_REFUND_LOSS_PERCENT).toEqual({ beforeBuild: 0, building: 5, finished: 10, move: 10 });
  });

  it('gives everything back before the build has started', () => {
    const state = createDefaultGameState();
    know(state, 'house-floors');
    state.player.inventory.layerboard = 3;
    give(state, 'floor');
    const result = applyGameCommand(state, { type: 'refundProject', partId: 'floor', now: T0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain('Nothing was lost');
    expect(state.player.inventory.layerboard).toBe(3);
    expect(state.world.dwelling.projects.floor).toBeUndefined();
  });

  it('keeps 5% back once the build has started, and cancels it', () => {
    const state = createDefaultGameState();
    know(state, 'house-roofs', 'house-floors', 'house-walls');
    state.world.dwelling.parts = ['floor', 'walls'];
    stock(state, 'roof');
    give(state, 'roof');
    expect(partStatus(state, 'roof')).toBe('building');
    const result = applyGameCommand(state, { type: 'refundProject', partId: 'roof', now: T0 + 1000 });
    expect(result.ok).toBe(true);
    // 8 layerboard, 4 binding cord, 2 paper mortar at 95%, rounded.
    expect(state.player.inventory.layerboard).toBe(refundQuantity(8, 5));
    expect(state.player.inventory['binding-cord']).toBe(refundQuantity(4, 5));
    expect(state.player.inventory['paper-mortar']).toBe(refundQuantity(2, 5));
    expect(state.world.dwelling.projects.roof).toBeUndefined();
    expect(settleDwelling(state, T0 + 999_999_999)).toEqual([]);
  });

  it('refuses when nothing was put in', () => {
    const state = createDefaultGameState();
    expect(applyGameCommand(state, { type: 'refundProject', partId: 'floor', now: T0 }).ok).toBe(false);
  });

  it('takes a finished part down for 90% back', () => {
    const state = withFloor();
    const before = { ...state.player.inventory };
    const result = applyGameCommand(state, { type: 'dismantlePart', partId: 'floor', now: T0 + 20_000_000 });
    expect(result.ok).toBe(true);
    expect(state.world.dwelling.parts).toEqual([]);
    for (const line of dwellingPartDef('floor').cost) {
      const gained = (state.player.inventory[line.resource] ?? 0) - (before[line.resource] ?? 0);
      expect(gained).toBe(refundQuantity(line.quantity, 10));
    }
  });

  it('will not take down a part something else stands on', () => {
    const state = withFloor();
    state.world.dwelling.parts = ['floor', 'walls'];
    const result = applyGameCommand(state, { type: 'dismantlePart', partId: 'floor', now: T0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('walls');
    expect(state.world.dwelling.parts).toEqual(['floor', 'walls']);
    // A project that has begun counts too.
    state.world.dwelling.parts = ['floor'];
    state.world.dwelling.projects.walls = { paid: { layerboard: 1 }, startedAt: null, completesAt: null };
    expect(applyGameCommand(state, { type: 'dismantlePart', partId: 'floor', now: T0 }).ok).toBe(false);
  });

  it('pays the whole old house back for a move, at 90% on built parts', () => {
    const state = createDefaultGameState();
    state.world.dwelling.parts = ['floor', 'walls'];
    state.world.dwelling.projects.roof = { paid: { layerboard: 4 }, startedAt: null, completesAt: null };
    const result = applyGameCommand(state, { type: 'dismantleDwelling', now: T0 });
    expect(result.ok).toBe(true);
    expect(state.world.dwelling).toEqual({ parts: [], projects: {} });
    // layerboard: floor 4 + walls 6 built (each at 90%) plus 4 unbuilt (all back).
    const expected = refundQuantity(4, 10) + refundQuantity(6, 10) + 4;
    expect(state.player.inventory.layerboard).toBe(expected);
  });

  it('says so plainly when there is nothing to take down', () => {
    const state = createDefaultGameState();
    const result = applyGameCommand(state, { type: 'dismantleDwelling', now: T0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain('nothing');
  });
});

describe('a saved house', () => {
  it('survives garbage without inventing parts', () => {
    expect(sanitizeDwelling(undefined)).toEqual({ parts: [], projects: {} });
    expect(sanitizeDwelling('roof')).toEqual({ parts: [], projects: {} });
    expect(sanitizeDwelling({ parts: ['penthouse', 42], projects: { floor: 'lots' } })).toEqual({ parts: [], projects: {} });
  });

  it('drops a part whose foundation is missing, and unknown or oversize ledger lines', () => {
    const clean = sanitizeDwelling({
      parts: ['roof', 'floor'],
      projects: { walls: { paid: { layerboard: 999, 'red-brick': -3, foil: 4 }, startedAt: 5, completesAt: 9 } },
    });
    // Roof needs walls, which are absent; floor stands alone.
    expect(clean.parts).toEqual(['floor']);
    // Walls: layerboard clamped to the cost, nonsense lines dropped, and not complete so no clock.
    expect(clean.projects.walls).toEqual({ paid: { layerboard: 6 }, startedAt: null, completesAt: null });
  });

  it('keeps a running build\'s clock, and never strands fully paid materials', () => {
    const paid = { layerboard: 4, 'binding-cord': 2 };
    const keeps = sanitizeDwelling({ parts: [], projects: { floor: { paid, startedAt: 10, completesAt: 20 } } });
    expect(keeps.projects.floor).toEqual({ paid, startedAt: 10, completesAt: 20 });
    const lostClock = sanitizeDwelling({ parts: [], projects: { floor: { paid } } });
    expect(lostClock.projects.floor?.completesAt).toBe(0);
  });

  it('never exceeds the project limit', () => {
    const clean = sanitizeDwelling({
      parts: ['floor', 'walls'],
      projects: {
        roof: { paid: { layerboard: 1 } },
        'room-1': { paid: { layerboard: 1 } },
        upstairs: { paid: { 'crossbound-timber': 1 } },
      },
    });
    expect(Object.keys(clean.projects).length).toBeLessThanOrEqual(2);
  });
});

describe('the catalog agrees with itself', () => {
  it('labels every part', () => {
    for (const id of DWELLING_PART_IDS) {
      expect(DWELLING_PART_DEFS[id].label.length).toBeGreaterThan(0);
      expect(DWELLING_PART_DEFS[id].summary.length).toBeGreaterThan(0);
    }
  });
});
