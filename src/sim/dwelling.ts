import type { CommandResult } from './commands';
import type { ActivityEntry, DwellingProjectState, GameState } from './state';
import {
  MAX_DWELLING_PROJECTS,
  costOf,
  ledgerTotal,
  remainingCost,
} from './dwellingState';
import { hasAbility } from './catalogs/recipes';
import { TECH_DEFS, techNodeTeachingAbility } from './catalogs/techTree';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import {
  dwellingPartDef,
  DWELLING_PART_IDS,
  DWELLING_REFUND_LOSS_PERCENT,
  describeDwellingCost,
  isDwellingPartId,
  refundQuantity,
  type DwellingCostLine,
  type DwellingPartId,
  type DwellingRefundKind,
} from './catalogs/dwellings';

/**
 * The dwelling's rules, as pure functions over game state (design in
 * `docs/house-and-home.md`). Renderer-free and clock-free: every function that
 * cares about time is handed `now`, and a build's finish is a *timestamp*, so
 * it runs while the player is away, the same time-derived way plants do.
 */

export { MAX_DWELLING_PROJECTS, remainingCost };

export type DwellingCommand =
  /** Put materials in. With no `resource`, everything the part still needs that the bag can cover. */
  | { type: 'contributeToProject'; partId: DwellingPartId; resource?: ResourceId; quantity?: number; now: number }
  /** Take a project's materials back out (100% before the build, 95% once it began). */
  | { type: 'refundProject'; partId: DwellingPartId; now: number }
  /** Take a finished part down again (90% back). */
  | { type: 'dismantlePart'; partId: DwellingPartId; now: number }
  /** Pay the whole old house back, for a move (90% back on parts). */
  | { type: 'dismantleDwelling'; now: number }
  /** Finish any build whose time has come. Safe to call every tick. */
  | { type: 'settleDwelling'; now: number };

export type LogActivity = (state: GameState, entry: ActivityEntry) => boolean;

const label = (resource: ResourceId) => RESOURCE_CORE_DEFS[resource].label;

function orderedParts(parts: Iterable<DwellingPartId>): DwellingPartId[] {
  const set = new Set(parts);
  return DWELLING_PART_IDS.filter((id) => set.has(id));
}

/** Whole-percent progress through the collecting stage. */
export function collectingPercent(partId: DwellingPartId, project: DwellingProjectState | undefined): number {
  const cost = costOf(partId);
  const total = cost.reduce((sum, line) => sum + line.quantity, 0);
  const paid = cost.reduce((sum, line) => sum + Math.min(line.quantity, project?.paid[line.resource] ?? 0), 0);
  return total === 0 ? 100 : Math.floor((paid / total) * 100);
}

export type PartStatus =
  | 'finished'
  /** All materials in, the timer is running. */
  | 'building'
  /** Some or no materials in; collecting. */
  | 'collecting'
  /** Nothing yet, but nothing in the way. */
  | 'available'
  | 'needs-know-how'
  | 'needs-parts';

export function partStatus(state: Readonly<GameState>, partId: DwellingPartId): PartStatus {
  const dwelling = state.world.dwelling;
  if (dwelling.parts.includes(partId)) return 'finished';
  const project = dwelling.projects[partId];
  if (project?.startedAt != null) return 'building';
  if (project) return 'collecting';
  const def = dwellingPartDef(partId);
  if (!def.requiresParts.every((required) => dwelling.parts.includes(required))) return 'needs-parts';
  if (!hasAbility(state.player.plans, def.requiresAbility)) return 'needs-know-how';
  return 'available';
}

/** Parts still standing that need this one, finished or in progress. */
function dependentsOf(state: Readonly<GameState>, partId: DwellingPartId): DwellingPartId[] {
  const dwelling = state.world.dwelling;
  return DWELLING_PART_IDS.filter((other) => (
    (dwelling.parts.includes(other) || dwelling.projects[other])
    && (dwellingPartDef(other).requiresParts as readonly DwellingPartId[]).includes(partId)
  ));
}

/** Finish every build whose time has come. Returns the parts finished, in build order. */
export function settleDwelling(state: GameState, now: number, log?: LogActivity): DwellingPartId[] {
  const dwelling = state.world.dwelling;
  const finished: DwellingPartId[] = [];
  for (const partId of DWELLING_PART_IDS) {
    const project = dwelling.projects[partId];
    if (!project || project.completesAt == null || now < project.completesAt) continue;
    delete dwelling.projects[partId];
    if (!dwelling.parts.includes(partId)) dwelling.parts = orderedParts([...dwelling.parts, partId]);
    finished.push(partId);
    log?.(state, {
      id: `dwelling:${partId}:done:${project.completesAt}`,
      kind: 'building',
      message: `Your ${dwellingPartDef(partId).label.toLowerCase()} is finished.`,
      at: project.completesAt,
    });
  }
  return finished;
}

function knowHowBlocker(state: GameState, partId: DwellingPartId): string | null {
  const def = dwellingPartDef(partId);
  if (hasAbility(state.player.plans, def.requiresAbility)) return null;
  const lessonId = techNodeTeachingAbility(def.requiresAbility);
  const lesson = lessonId ? TECH_DEFS[lessonId].name : 'the right lesson';
  return `Learn ${lesson} with the Professor before you start the ${def.label.toLowerCase()}.`;
}

function describeWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export { describeWait as describeDwellingWait };

function payBack(state: GameState, paid: Partial<Record<ResourceId, number>>, kind: DwellingRefundKind): {
  returned: Partial<Record<ResourceId, number>>;
  lost: number;
} {
  const loss = DWELLING_REFUND_LOSS_PERCENT[kind];
  const returned: Partial<Record<ResourceId, number>> = {};
  let lost = 0;
  for (const [resource, amount] of Object.entries(paid) as Array<[ResourceId, number]>) {
    if (!amount || amount <= 0) continue;
    const back = refundQuantity(amount, loss);
    lost += amount - back;
    if (back > 0) {
      returned[resource] = back;
      state.player.inventory[resource] = (state.player.inventory[resource] ?? 0) + back;
    }
  }
  return { returned, lost };
}

function sayReturned(returned: Partial<Record<ResourceId, number>>): string {
  const lines = (Object.entries(returned) as Array<[ResourceId, number]>)
    .map(([resource, amount]) => `${amount} ${label(resource)}`);
  return lines.length ? lines.join(', ') : 'nothing';
}

function sayLoss(lost: number, kind: DwellingRefundKind): string {
  const percent = DWELLING_REFUND_LOSS_PERCENT[kind];
  if (percent === 0) return 'Nothing was lost.';
  return lost > 0
    ? `${percent}% stayed behind, ${lost} piece${lost === 1 ? '' : 's'} in all.`
    : `${percent}% stayed behind, but with so few pieces none went missing.`;
}

export function applyDwellingCommand(state: GameState, command: DwellingCommand, log?: LogActivity): CommandResult {
  const dwelling = state.world.dwelling;
  const finishedNow = settleDwelling(state, command.now, log);
  const settledNote = finishedNow.length
    ? ` ${finishedNow.map((id) => dwellingPartDef(id).label).join(' and ')} finished while you were away.`
    : '';

  switch (command.type) {
    case 'settleDwelling': {
      return { ok: true, message: finishedNow.length ? settledNote.trim() : 'Nothing has finished yet.' };
    }

    case 'contributeToProject': {
      const partId = command.partId;
      if (!isDwellingPartId(partId)) return { ok: false, reason: 'That is not a part of the house.' };
      const def = dwellingPartDef(partId);
      if (dwelling.parts.includes(partId)) return { ok: false, reason: `The ${def.label.toLowerCase()} is already built.` };
      const missingPart = def.requiresParts.find((required) => !dwelling.parts.includes(required));
      if (missingPart) {
        return { ok: false, reason: `Finish the ${dwellingPartDef(missingPart).label.toLowerCase()} first.` };
      }
      const knowHow = knowHowBlocker(state, partId);
      if (knowHow) return { ok: false, reason: knowHow };
      const existing = dwelling.projects[partId];
      if (existing?.startedAt != null) {
        return { ok: false, reason: `The ${def.label.toLowerCase()} is already being built.` };
      }
      if (!existing && Object.keys(dwelling.projects).length >= MAX_DWELLING_PROJECTS) {
        return {
          ok: false,
          reason: `You already have ${MAX_DWELLING_PROJECTS} projects going. Finish one, or take the materials back out of one, first.`,
        };
      }
      if (command.quantity !== undefined && (!Number.isSafeInteger(command.quantity) || command.quantity < 1)) {
        return { ok: false, reason: 'Choose a whole number of pieces.' };
      }
      const wanted = remainingCost(partId, existing)
        .filter((line) => command.resource === undefined || line.resource === command.resource);
      if (command.resource !== undefined && wanted.length === 0) {
        return { ok: false, reason: `The ${def.label.toLowerCase()} does not need any more ${label(command.resource).toLowerCase()}.` };
      }

      const gave: Partial<Record<ResourceId, number>> = {};
      for (const line of wanted) {
        const have = state.player.inventory[line.resource] ?? 0;
        const cap = command.quantity ?? line.quantity;
        const amount = Math.min(line.quantity, have, cap);
        if (amount > 0) gave[line.resource] = amount;
      }
      if (Object.keys(gave).length === 0) {
        return {
          ok: false,
          reason: `You have none of what the ${def.label.toLowerCase()} still needs: ${describeDwellingCost(remainingCost(partId, existing), label)}.`,
        };
      }

      const project: DwellingProjectState = existing ?? { paid: {}, startedAt: null, completesAt: null };
      for (const [resource, amount] of Object.entries(gave) as Array<[ResourceId, number]>) {
        state.player.inventory[resource] = (state.player.inventory[resource] ?? 0) - amount;
        project.paid[resource] = (project.paid[resource] ?? 0) + amount;
      }
      dwelling.projects[partId] = project;

      const putIn = sayReturned(gave);
      const still = remainingCost(partId, project);
      if (still.length > 0) {
        return {
          ok: true,
          grants: undefined,
          message: `Put ${putIn} into the ${def.label.toLowerCase()}. Still needed: ${describeDwellingCost(still, label)}. ${collectingPercent(partId, project)}% collected.${settledNote}`,
        };
      }

      project.startedAt = command.now;
      project.completesAt = command.now + def.buildSeconds * 1000;
      if (def.buildSeconds === 0) {
        settleDwelling(state, command.now, log);
        return { ok: true, message: `Put ${putIn} in. The ${def.label.toLowerCase()} is built.${settledNote}` };
      }
      return {
        ok: true,
        message: `Put ${putIn} in. Everything is here. The ${def.label.toLowerCase()} will take ${describeWait(def.buildSeconds)}.${settledNote}`,
      };
    }

    case 'refundProject': {
      const partId = command.partId;
      if (!isDwellingPartId(partId)) return { ok: false, reason: 'That is not a part of the house.' };
      const project = dwelling.projects[partId];
      if (!project || ledgerTotal(project) === 0) {
        return { ok: false, reason: 'Nothing has been put into that part.' };
      }
      const kind: DwellingRefundKind = project.startedAt != null ? 'building' : 'beforeBuild';
      const { returned, lost } = payBack(state, project.paid, kind);
      delete dwelling.projects[partId];
      const name = dwellingPartDef(partId).label.toLowerCase();
      return {
        ok: true,
        grants: returned,
        message: `Took the ${name} materials back: ${sayReturned(returned)}. ${sayLoss(lost, kind)}${settledNote}`,
      };
    }

    case 'dismantlePart': {
      const partId = command.partId;
      if (!isDwellingPartId(partId)) return { ok: false, reason: 'That is not a part of the house.' };
      const def = dwellingPartDef(partId);
      if (!dwelling.parts.includes(partId)) return { ok: false, reason: `The ${def.label.toLowerCase()} is not built.` };
      const blockers = dependentsOf(state, partId);
      if (blockers.length > 0) {
        return {
          ok: false,
          reason: `Take down the ${blockers.map((id) => dwellingPartDef(id).label.toLowerCase()).join(' and ')} first; it rests on the ${def.label.toLowerCase()}.`,
        };
      }
      const paid = Object.fromEntries(def.cost.map((line) => [line.resource, line.quantity])) as Partial<Record<ResourceId, number>>;
      const { returned, lost } = payBack(state, paid, 'finished');
      dwelling.parts = dwelling.parts.filter((id) => id !== partId);
      log?.(state, {
        id: `dwelling:${partId}:down:${command.now}`,
        kind: 'building',
        message: `You took down the ${def.label.toLowerCase()}.`,
        at: command.now,
      });
      return {
        ok: true,
        grants: returned,
        message: `Took down the ${def.label.toLowerCase()} and got back ${sayReturned(returned)}. ${sayLoss(lost, 'finished')}${settledNote}`,
      };
    }

    case 'dismantleDwelling': {
      const total: Partial<Record<ResourceId, number>> = {};
      let lost = 0;
      const add = (returned: Partial<Record<ResourceId, number>>) => {
        for (const [resource, amount] of Object.entries(returned) as Array<[ResourceId, number]>) {
          total[resource] = (total[resource] ?? 0) + amount;
        }
      };
      for (const partId of dwelling.parts) {
        const paid = Object.fromEntries(costOf(partId).map((line) => [line.resource, line.quantity])) as Partial<Record<ResourceId, number>>;
        const result = payBack(state, paid, 'move');
        add(result.returned);
        lost += result.lost;
      }
      for (const [partId, project] of Object.entries(dwelling.projects) as Array<[DwellingPartId, DwellingProjectState]>) {
        const kind: DwellingRefundKind = project.startedAt != null ? 'building' : 'beforeBuild';
        const result = payBack(state, project.paid, kind);
        add(result.returned);
        lost += result.lost;
        void partId;
      }
      const hadAnything = dwelling.parts.length > 0 || Object.keys(dwelling.projects).length > 0;
      dwelling.parts = [];
      dwelling.projects = {};
      if (!hadAnything) return { ok: true, grants: {}, message: 'There was nothing built to take down.' };
      return {
        ok: true,
        grants: total,
        message: `The old house came down for the move. You got back ${sayReturned(total)}; about ${DWELLING_REFUND_LOSS_PERCENT.move}% of what was built stayed behind.${settledNote}`,
      };
    }
  }
}
