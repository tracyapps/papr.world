// Scenes: places you can be that are not the open surface (design in
// docs/scenes-and-interiors.md). Renderer-free.
//
// A scene id is a short string. The surface is bare, so every page id, save
// and shared-room record that exists today stays valid and the server, which
// already treats `page` as a free string, needs no change:
//
//   3,-2                surface page (every id that exists today)
//   under:3,-2          underground page (not built yet)
//   in:home:0,0         a page of the player's home interior

import { pageId } from './types';

export const SURFACE_SCENE = 'surface';
/** The player's own home. One dwelling per account, so one interior tree. */
export const HOME_INTERIOR_SCENE = 'in:home';

export type SceneId = string;
export type SceneAddress = { scene: SceneId; px: number; pz: number };

/** Scene ids that can be entered today. */
export const KNOWN_SCENES: readonly SceneId[] = [SURFACE_SCENE, HOME_INTERIOR_SCENE];

const SCENE_PATTERN = /^(surface|under|in:[a-z0-9-]{1,16})$/;

export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && SCENE_PATTERN.test(value);
}

export function isInteriorScene(scene: SceneId): boolean {
  return scene.startsWith('in:');
}

/** A saved scene id, or the surface when it is missing, unknown or unbuilt. */
export function sanitizeScene(raw: unknown): SceneId {
  return typeof raw === 'string' && KNOWN_SCENES.includes(raw) ? raw : SURFACE_SCENE;
}

/** The page id for an address. The surface case is exactly today's `"px,pz"`. */
export function formatSceneAddress(address: SceneAddress): string {
  const page = pageId(address.px, address.pz);
  return address.scene === SURFACE_SCENE ? page : `${address.scene}:${page}`;
}

export function parseSceneAddress(id: string): SceneAddress | null {
  const cut = id.lastIndexOf(':');
  const scene = cut === -1 ? SURFACE_SCENE : id.slice(0, cut);
  const page = cut === -1 ? id : id.slice(cut + 1);
  const match = /^(-?\d+),(-?\d+)$/.exec(page);
  if (!match || !isSceneId(scene)) return null;
  return { scene, px: Number(match[1]), pz: Number(match[2]) };
}

export function sceneOfPageId(id: string): SceneId {
  return parseSceneAddress(id)?.scene ?? SURFACE_SCENE;
}
