import type { DwellingProjectState, DwellingState } from './state';
import type { ResourceId } from './catalogs/resources';
import {
  dwellingPartDef,
  DWELLING_PART_IDS,
  isDwellingPartId,
  type DwellingCostLine,
  type DwellingPartId,
} from './catalogs/dwellings';

// The dwelling's plain state-shape helpers. Kept apart from `dwelling.ts` so
// `state.ts` can build and clean a saved dwelling without pulling in the
// knowledge tree (which itself reads the game state).

/** Projects with materials in them at once (collecting or building). */
export const MAX_DWELLING_PROJECTS = 2;

export function createDwelling(): DwellingState {
  return { parts: [], projects: {} };
}

export function costOf(partId: DwellingPartId): readonly DwellingCostLine[] {
  return dwellingPartDef(partId).cost;
}

export function ledgerTotal(project: DwellingProjectState): number {
  return Object.values(project.paid).reduce((sum: number, amount) => sum + (amount ?? 0), 0);
}

/** How much of each material a project still needs. Empty when it is fully paid. */
export function remainingCost(partId: DwellingPartId, project: DwellingProjectState | undefined): DwellingCostLine[] {
  return costOf(partId).flatMap((line) => {
    const left = line.quantity - (project?.paid[line.resource] ?? 0);
    return left > 0 ? [{ resource: line.resource, quantity: left }] : [];
  });
}

/** Load-time cleanup: a save can only hold a house that could have been built. */
export function sanitizeDwelling(raw: unknown): DwellingState {
  const dwelling = createDwelling();
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

  const claimed = new Set(Array.isArray(value.parts) ? value.parts.filter(isDwellingPartId) : []);
  for (const partId of DWELLING_PART_IDS) {
    if (!claimed.has(partId)) continue;
    const def = dwellingPartDef(partId);
    if (def.requiresParts.every((required) => dwelling.parts.includes(required))) dwelling.parts.push(partId);
  }

  const rawProjects = value.projects && typeof value.projects === 'object' && !Array.isArray(value.projects)
    ? value.projects as Record<string, unknown> : {};
  for (const partId of DWELLING_PART_IDS) {
    if (dwelling.parts.includes(partId)) continue;
    if (Object.keys(dwelling.projects).length >= MAX_DWELLING_PROJECTS) break;
    const rawProject = rawProjects[partId];
    if (!rawProject || typeof rawProject !== 'object') continue;
    const project = rawProject as Record<string, unknown>;
    const rawPaid = project.paid && typeof project.paid === 'object' ? project.paid as Record<string, unknown> : {};
    const paid: Partial<Record<ResourceId, number>> = {};
    for (const line of costOf(partId)) {
      const amount = rawPaid[line.resource];
      if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0) {
        paid[line.resource] = Math.min(line.quantity, Math.floor(amount));
      }
    }
    const sanitized: DwellingProjectState = { paid, startedAt: null, completesAt: null };
    const complete = remainingCost(partId, sanitized).length === 0;
    if (
      complete
      && typeof project.startedAt === 'number' && Number.isFinite(project.startedAt)
      && typeof project.completesAt === 'number' && Number.isFinite(project.completesAt)
    ) {
      sanitized.startedAt = project.startedAt;
      sanitized.completesAt = project.completesAt;
    } else if (complete) {
      // Fully paid but the clock was lost: start it now-ish rather than strand the materials.
      sanitized.startedAt = 0;
      sanitized.completesAt = 0;
    }
    if (ledgerTotal(sanitized) > 0) dwelling.projects[partId] = sanitized;
  }
  return dwelling;
}
