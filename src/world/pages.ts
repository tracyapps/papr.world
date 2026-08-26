import { getAuthoredPage } from './authored';
import { generatePage } from './generate';
import { pageId, type PageData } from './types';
import { withWaterways } from './waterways';

// Page registry: authored pages win, everything else is generated on demand.
// Page data is cached so terrain sampling and streaming agree forever.

const pageCache = new Map<string, PageData>();

export function getPage(px: number, pz: number): PageData {
  const id = pageId(px, pz);
  let page = pageCache.get(id);
  if (!page) {
    page = withWaterways(getAuthoredPage(px, pz) ?? generatePage(px, pz));
    pageCache.set(id, page);
  }
  return page;
}

/**
 * The page at these coordinates *only if it already exists*.
 *
 * `getPage` generates on demand, which is right for streaming and for anything
 * answering a question about somewhere the player is going. It is wrong for
 * per-frame queries: a critter asking "is there a wall a few steps ahead?" near
 * a page seam would trigger full procedural generation of the neighbouring
 * pages, mid-frame, and go on doing it as it wandered — building world nobody
 * had arrived at yet.
 *
 * For those callers an unloaded page is correctly treated as empty: nothing has
 * been built there, nothing is drawn there, and nothing can obstruct anyone.
 */
export function peekPage(px: number, pz: number): PageData | null {
  return pageCache.get(pageId(px, pz)) ?? null;
}
