import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyGameCommand } from './commands';
import { createDefaultGameState } from './state';
import { RESOURCE_CORE_DEFS } from './catalogs/resources';
import {
  MILL_MAIL,
  MILL_REFINEMENTS,
  affordableMillBatches,
  rawResourcesWithTag,
  resolveMillAllocation,
  resourcesForTagInput,
  type MillRefinement,
} from './catalogs/millRefining';
import { obtainRoutesFor } from './catalogs/obtaining';
import { mailAttachment } from './mail';

afterEach(() => vi.useRealTimers());

const REFINEMENTS = MILL_REFINEMENTS as readonly MillRefinement[];

function stateWith(inventory: Record<string, number>, chips = 0) {
  const state = createDefaultGameState();
  state.player.inventory = { ...state.player.inventory, ...inventory };
  state.player.chips = chips;
  return state;
}

describe('the refining board', () => {
  it('only ever turns lower-stage stock into higher-stage material', () => {
    for (const refinement of REFINEMENTS) {
      const output = RESOURCE_CORE_DEFS[refinement.output];
      expect(output.category, refinement.id).toBe('refined');
      expect(output.processStage, refinement.id).toBeGreaterThan(0);
      for (const input of refinement.inputs) {
        const candidates = input.kind === 'exact' ? [input.resource] : resourcesForTagInput(input);
        expect(candidates.length, `${refinement.id} has an input nothing can fill`).toBeGreaterThan(0);
        // Strictly lower for every candidate, so no trade can be fed its own
        // output, directly or through a tag slot.
        for (const id of candidates) {
          expect(RESOURCE_CORE_DEFS[id].processStage, `${refinement.id} ← ${id}`).toBeLessThan(output.processStage);
        }
      }
    }
  });

  it('keeps the first rung to raw stock, which is what makes it the first rung', () => {
    for (const refinement of REFINEMENTS) {
      if (RESOURCE_CORE_DEFS[refinement.output].processStage !== 1) continue;
      expect(refinement.requiresAbility, refinement.id).toBeUndefined();
      for (const input of refinement.inputs) {
        const candidates = input.kind === 'exact' ? [input.resource] : resourcesForTagInput(input);
        for (const id of candidates) expect(RESOURCE_CORE_DEFS[id].processStage, `${refinement.id} ← ${id}`).toBe(0);
      }
    }
  });

  it('tells the obtain table about the mill, so critters and the reference page can say so', () => {
    for (const refinement of REFINEMENTS) {
      expect(obtainRoutesFor(refinement.output)).toContainEqual(
        expect.objectContaining({ kind: 'refined', refinement: refinement.id }),
      );
    }
  });

  it('fills "any" slots from whatever the player has most of', () => {
    const allocation = resolveMillAllocation(
      { 'confetti-stones': 1, 'bluefold-pebbles': 5 },
      [{ kind: 'tag', tag: 'stone', quantity: 3, label: 'any stone' }],
    );
    expect(allocation).toEqual({ 'bluefold-pebbles': 3 });
    expect(resolveMillAllocation({ 'confetti-stones': 2 }, [{ kind: 'tag', tag: 'stone', quantity: 3, label: 'any stone' }])).toBeNull();
  });
});

describe('at the counter', () => {
  it('takes raw stock and hands refined back on the spot', () => {
    const state = stateWith({ 'kraft-twigs': 8, 'palm-fiber': 2 });
    const result = applyGameCommand(state, {
      type: 'refineAtMill', refinementId: 'bound-lumber', batches: 2, delivery: 'counter', now: 1000,
    });
    expect(result.ok).toBe(true);
    expect(state.player.inventory['bound-lumber']).toBe(4);
    expect(state.player.inventory['kraft-twigs']).toBe(0);
    expect(state.player.inventory['palm-fiber']).toBe(0);
    expect(state.player.refinedCounts['bound-lumber']).toBe(4);
  });

  it('says what is missing instead of silently refusing', () => {
    const state = stateWith({ 'kraft-twigs': 2 });
    const result = applyGameCommand(state, {
      type: 'refineAtMill', refinementId: 'bound-lumber', batches: 1, delivery: 'counter', now: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Kraft twigs');
  });
});

describe('by mail', () => {
  it('charges the chip fee, posts a parcel, and holds it until it arrives', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const state = stateWith({ 'mossy-paper-fiber': 3 }, MILL_MAIL.feeChips);
    const ordered = applyGameCommand(state, {
      type: 'refineAtMill', refinementId: 'soft-pulp', batches: 1, delivery: 'mail', payment: 'chips', now: 10_000,
    });
    expect(ordered.ok).toBe(true);
    expect(state.player.chips).toBe(0);
    expect(state.player.inventory['soft-pulp'] ?? 0).toBe(0);
    const parcel = state.player.mailbox.find((mail) => mail.id.startsWith('mill-order:'))!;
    expect(mailAttachment(parcel)).toMatchObject({ kind: 'resource', resource: 'soft-pulp', quantity: 2 });

    const early = applyGameCommand(state, { type: 'collectMail', mailId: parcel.id });
    expect(early.ok).toBe(false);

    vi.setSystemTime(10_000 + MILL_MAIL.deliveryMs + 1);
    const later = applyGameCommand(state, { type: 'collectMail', mailId: parcel.id });
    expect(later.ok).toBe(true);
    expect(state.player.inventory['soft-pulp']).toBe(2);
  });

  it('can be paid for in a little extra stock instead of chips', () => {
    const state = stateWith({ 'confetti-stones': 4 }, 0);
    const soft = REFINEMENTS.find((entry) => entry.id === 'stone-aggregate')!;
    expect(affordableMillBatches(state.player.inventory, soft, true)).toBe(1);
    const result = applyGameCommand(state, {
      type: 'refineAtMill', refinementId: 'stone-aggregate', batches: 1, delivery: 'mail', payment: 'materials', now: 5,
    });
    expect(result.ok).toBe(true);
    expect(state.player.inventory['confetti-stones']).toBe(0);
    expect(state.player.chips).toBe(0);
  });

  it('refuses the chip fee when the pouch is short, and says there is another way', () => {
    const state = stateWith({ 'mossy-paper-fiber': 3 }, 0);
    const result = applyGameCommand(state, {
      type: 'refineAtMill', refinementId: 'soft-pulp', batches: 1, delivery: 'mail', payment: 'chips', now: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('extra stock');
  });
});
