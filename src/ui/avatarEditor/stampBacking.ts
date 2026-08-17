// Does this face stamp need its own scrap of paper?
//
// Many silhouettes have negative space inside their bounds — the gap between a
// frog's two eye humps, the wells in a cassette, the space under a raised arm.
// An `on` stamp is clipped to the silhouette, so a face that lands in one of
// those holes loses part of itself, and the player has no way to see why.
//
// The answer is decided HERE, in the editor, rather than in render.ts: only
// the DOM can hit-test a real path (`isPointInFill`), and render.ts is a pure
// string builder that also runs for the in-world texture. The decision is
// written onto the stamp (`backing: true`), so rendering stays a pure function
// of the design, the server can validate it in Phase D, and a future "no, I
// wanted it clipped" toggle is a one-line change rather than a rewrite.

import { DESIGN_SHEET, type AvatarDesign, type DesignStamp } from '../../../shared/src/index';
import { findStamp } from './catalog';
import { silhouettePathFor } from './render';
import type { StampTemplate } from './stampTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Coordinate pairs from a path — control points included, which is fine here:
 *  a control point outside the cutout means the curve is heading out too, and
 *  erring toward "give it paper" is the cheaper mistake. */
function pointsOf(path: string): Array<[number, number]> {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Array<[number, number]> = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!]);
  return points;
}

/** Place a local stamp point into sheet coordinates. */
function place(stamp: DesignStamp, template: StampTemplate, x: number, y: number): [number, number] {
  const scale = stamp.scale * template.defaultScale;
  const flipped = stamp.flip ? -x : x;
  const radians = (stamp.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const sx = flipped * scale;
  const sy = y * scale;
  return [stamp.x + sx * cos - sy * sin, stamp.y + sx * sin + sy * cos];
}

/**
 * True when any of the stamp's ink falls outside the cutout — off the edge, or
 * into a hole. Returns false in environments without SVG geometry support
 * (jsdom, older browsers): no backing is the pre-existing behaviour, so an
 * unsupported environment degrades to what it did before rather than
 * scattering paper islands everywhere.
 */
export function stampWouldCrop(design: AvatarDesign, stamp: DesignStamp): boolean {
  const template = findStamp(stamp.key);
  if (!template || template.layer !== 'on') return false;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${DESIGN_SHEET.width} ${DESIGN_SHEET.height}`);
  // Rendered off-screen but attached: an unattached path has no geometry.
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;opacity:0');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', silhouettePathFor(design));
  svg.appendChild(path);
  document.body.appendChild(svg);

  try {
    if (typeof path.isPointInFill !== 'function') return false;
    const point = svg.createSVGPoint?.();
    if (!point) return false;

    for (const part of template.parts) {
      for (const [localX, localY] of pointsOf(part.path)) {
        const [x, y] = place(stamp, template, localX, localY);
        point.x = x;
        point.y = y;
        if (!path.isPointInFill(point)) return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    svg.remove();
  }
}

/**
 * Set `backing` on one stamp from what it currently overlaps. Returns true if
 * the value changed, so callers can skip a redraw when nothing moved.
 */
export function refreshBacking(design: AvatarDesign, index: number): boolean {
  const stamp = design.stamps?.[index];
  if (!stamp) return false;
  const needed = stampWouldCrop(design, stamp);
  if (needed === (stamp.backing === true)) return false;
  if (needed) stamp.backing = true;
  else delete stamp.backing;
  return true;
}

/** Re-decide every stamp — after a paper or silhouette change. */
export function refreshAllBacking(design: AvatarDesign): boolean {
  let changed = false;
  design.stamps?.forEach((_, index) => {
    if (refreshBacking(design, index)) changed = true;
  });
  return changed;
}
