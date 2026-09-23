/** Saved paper and paint choices for the four home surfaces. */
export const HOME_SURFACES = ['outsideWalls', 'outsideRoof', 'insideWalls', 'insideFloor'] as const;
export type HomeSurfaceId = typeof HOME_SURFACES[number];
export const HOME_DESIGNS = ['paper.notebook', 'paper.plaid', 'paper.cork', 'paper.orangewrap', 'paper.salmon', 'wall.siding1', 'wall.siding2', 'roof.shingle1', 'roof.shingle2'] as const;
export type HomeDesignId = typeof HOME_DESIGNS[number];
export type HomeSurfaceLook = { design: HomeDesignId; color: string };
export type HomeLook = Record<HomeSurfaceId, HomeSurfaceLook>;

export function createHomeLook(): HomeLook {
  return {
    outsideWalls: { design: 'paper.notebook', color: '#ffffff' },
    outsideRoof: { design: 'paper.salmon', color: '#ffffff' },
    insideWalls: { design: 'paper.notebook', color: '#ffffff' },
    insideFloor: { design: 'paper.cork', color: '#ffffff' },
  };
}

export function sanitizeHomeLook(raw: unknown): HomeLook {
  const defaults = createHomeLook();
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  for (const key of HOME_SURFACES) {
    const value = source[key];
    if (!value || typeof value !== 'object') continue;
    const surface = value as Record<string, unknown>;
    if (typeof surface.design === 'string' && HOME_DESIGNS.includes(surface.design as HomeDesignId)) {
      defaults[key].design = surface.design as HomeDesignId;
    }
    if (typeof surface.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(surface.color)) {
      defaults[key].color = surface.color.toLowerCase();
    }
  }
  return defaults;
}
