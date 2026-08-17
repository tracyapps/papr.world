// Design → SVG string. Pure string building, no DOM — so the same function
// serves the editor preview, the wardrobe thumbnails, later the player card,
// and (Phase B) rasterization to the in-world avatar texture via an <img>.
//
// Layer order, bottom to top:
//   1. "behind" stamps — arms, legs, hair: separate pieces of paper glued
//      behind the cutout, NOT clipped, each with its own cut edge. This is
//      the only layer allowed outside the silhouette.
//   2. the cut edge — the silhouette stroked in a lighter tint of the paper,
//      the blade line that sells "scissored out"
//   3. clipped to the silhouette: paper fill, paper pattern, then the "on"
//      stamps and the DRAWING interleaved — the drawing is a layer with a
//      position in the stack (design.drawingIndex), so a face can sit over
//      your scribbles or under them.
//
// Known trade-off (accepted 2026-08-15): the card's soft drop shadow follows
// the cutout only, so a waving arm casts nothing on a player card. In-world
// it does, because `applyAlphaShadow` derives the cast shadow from the
// rasterized texture's alpha, which includes everything.

import {
  DESIGN_SHEET,
  type AvatarDesign,
  type DesignStamp,
  type DesignStroke,
} from '../../../shared/src/index';
import { findPaperColor, findSilhouette, findStamp } from './catalog';
import type { StampLayer, StampTemplate } from './stampTypes';

/** Lighten a #rrggbb toward white; the cut edge is paper, just unshadowed. */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const v = (n >> shift) & 0xff;
    return Math.round(v + (255 - v) * amount);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((n >> shift) & 0xff) * (1 - amount));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}

/**
 * The cutout path for a design: the player's own drawn outline when
 * silhouette === 'custom' (closed automatically), otherwise the template.
 */
export function silhouettePathFor(design: AvatarDesign): string {
  if (design.silhouette === 'custom' && design.customOutline && design.customOutline.length >= 6) {
    const pts = design.customOutline;
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i + 1 < pts.length; i += 2) d += ` L${pts[i]} ${pts[i + 1]}`;
    return `${d} Z`;
  }
  return findSilhouette(design.silhouette).path;
}

/**
 * One stroke → SVG, in whichever medium it was drawn.
 *
 * Crayon is opaque. Watercolour and spray are translucent and deliberately
 * *not* merged into one path: each stroke is its own element, so passing over
 * the same place twice really does deepen it, exactly like the real thing —
 * and because they never reach full opacity, the paper's pattern keeps showing
 * through underneath.
 *
 * @param sprayFilter id of the noise filter in <defs>, shared by every spray
 *   stroke on the sheet (one filter, not one per stroke).
 */
function strokeToPolyline(stroke: DesignStroke, sprayFilter: string): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < stroke.points.length; i += 2) {
    pts.push(`${stroke.points[i]},${stroke.points[i + 1]}`);
  }
  const medium = stroke.medium ?? 'crayon';
  const shape =
    medium === 'watercolor'
      ? { width: stroke.width * 2.6, opacity: 0.3, extra: '' }
      : medium === 'spray'
        ? { width: stroke.width * 3.4, opacity: 0.55, extra: ` filter="url(#${sprayFilter})"` }
        : { width: stroke.width, opacity: 1, extra: '' };

  return (
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${stroke.color}" ` +
    `stroke-width="${shape.width.toFixed(2)}" stroke-opacity="${shape.opacity}" ` +
    `stroke-linecap="round" stroke-linejoin="round"${shape.extra}/>`
  );
}

/**
 * The speckle that makes spray paint read as spray paint.
 *
 * Fractal noise, thresholded hard so it becomes scattered dots rather than a
 * grey haze, then used as the alpha of whatever it is applied to. It is a
 * filter rather than a tiled dot pattern because a pattern would visibly
 * repeat along a stroke, and because a filter travels through the same
 * SVG-to-texture rasterization everything else uses.
 */
function sprayFilterDefs(id: string): string {
  return (
    `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="noise"/>` +
    `<feColorMatrix in="noise" type="matrix" ` +
    `values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.35" result="speckle"/>` +
    `<feComposite in="SourceGraphic" in2="speckle" operator="in"/>` +
    `</filter>`
  );
}

/** The pattern layer for a paper kind, drawn across the whole sheet. */
function patternLayer(pattern: string, inkColor: string): string {
  const { width, height } = DESIGN_SHEET;
  const parts: string[] = [];
  if (pattern === 'lined') {
    for (let y = 14; y < height; y += 12) {
      parts.push(
        `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${inkColor}" stroke-width="0.6" opacity="0.5"/>`,
      );
    }
  } else if (pattern === 'graph') {
    for (let y = 0; y <= height; y += 10) {
      parts.push(
        `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${inkColor}" stroke-width="0.45" opacity="0.45"/>`,
      );
    }
    for (let x = 0; x <= width; x += 10) {
      parts.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${inkColor}" stroke-width="0.45" opacity="0.45"/>`,
      );
    }
  } else if (pattern === 'dot-grid') {
    for (let y = 6; y < height; y += 10) {
      for (let x = 6; x < width; x += 10) {
        parts.push(`<circle cx="${x}" cy="${y}" r="0.7" fill="${inkColor}" opacity="0.5"/>`);
      }
    }
  }
  // "plain" and "torn-edge" add nothing here; torn-edge changes the cut edge.
  return parts.join('');
}

/** The three role colours a stamp is painted in, for one design. */
export type StampPalette = { paper: string; shadow: string };

/**
 * One placed stamp → SVG.
 *
 * Placement is a wrapper transform (translate · rotate · scale), unlike
 * silhouettes whose fit is baked at compile time — a stamp's position is the
 * player's, so it cannot be baked. That means stroke widths inside the group
 * would scale with it, which is why the cut edge divides by the scale: a
 * shrunk arm gets a thin blade line otherwise, and a huge one a fat one.
 */
function stampToSvg(
  stamp: DesignStamp,
  template: StampTemplate,
  palette: StampPalette,
  cutEdge: string | null,
  index: number,
): string {
  const scale = stamp.scale * template.defaultScale;
  const flip = stamp.flip ? -1 : 1;
  const transform =
    `translate(${stamp.x} ${stamp.y}) rotate(${stamp.rotation}) ` +
    `scale(${(scale * flip).toFixed(4)} ${scale.toFixed(4)})`;

  const fillFor = (role: string) =>
    role === 'paper' ? palette.paper : role === 'shadow' ? palette.shadow : stamp.color;

  // A glued-on piece of paper shows its own blade line, drawn behind the
  // parts so it reads as an edge rather than an outline.
  //
  // Two widths, both divided by the scale so the blade line reads the same on
  // a tiny eye and a huge arm: the outer pass is the pale cut edge, the inner
  // pass is the paper itself. A backed stamp gets a fatter pair — that is the
  // die cut, the little paper island a sticker is punched out of, and it is
  // what lets a face sit over a hole in the cutout without losing half of
  // itself.
  const edgeWidth = stamp.backing ? 9 : 2.4;
  const edge =
    cutEdge === null && !stamp.backing
      ? ''
      : template.parts
          .map((part) => {
            const outer =
              `<path d="${part.path}" fill="${cutEdge ?? palette.paper}" ` +
              `stroke="${cutEdge ?? palette.paper}" ` +
              `stroke-width="${(edgeWidth / Math.max(scale, 0.01)).toFixed(3)}" ` +
              `stroke-linejoin="round" stroke-linecap="round"/>`;
            if (!stamp.backing) return outer;
            return (
              outer +
              `<path d="${part.path}" fill="${palette.paper}" stroke="${palette.paper}" ` +
              `stroke-width="${((edgeWidth - 2.6) / Math.max(scale, 0.01)).toFixed(3)}" ` +
              `stroke-linejoin="round" stroke-linecap="round"/>`
            );
          })
          .join('');

  const parts = template.parts
    .map((part) => `<path d="${part.path}" fill="${fillFor(part.role)}"/>`)
    .join('');

  // `data-stamp` is how the editor finds a stamp to select and drag. It costs
  // nothing anywhere else — a data attribute is inert when the SVG is
  // rasterized for the world or shown on a card.
  return `<g data-stamp="${index}" transform="${transform}">${edge}${parts}</g>`;
}

/**
 * All stamps of one pass, in paint order, skipping keys this build lacks.
 *
 * There are three passes, not two: `behind`, then the clipped `on` stamps,
 * then the backed `on` stamps *above* the clip. A backed stamp has its own
 * paper under it, so clipping it to the cutout would defeat the point.
 */
function stampLayer(
  design: AvatarDesign,
  layer: StampLayer,
  palette: StampPalette,
  cutEdge: string | null,
  backed?: boolean,
): string {
  if (!design.stamps || design.stamps.length === 0) return '';
  return design.stamps
    .map((stamp, index) => {
      const template = findStamp(stamp.key);
      if (!template || template.layer !== layer) return '';
      if (stamp.hidden) return '';
      if (backed !== undefined && (stamp.backing === true) !== backed) return '';
      return stampToSvg(stamp, template, palette, cutEdge, index);
    })
    .join('');
}

/**
 * The clipped pass: unbacked "on" stamps and the drawing, interleaved.
 *
 * The drawing is one layer with a position in the stack rather than something
 * that belongs to a stamp — so a face can sit over your scribbles or under
 * them, and moving it is the same gesture as moving anything else.
 * `drawingIndex` counts how many of those stamps are painted before it;
 * undefined means last, i.e. on top.
 */
function clippedPass(
  design: AvatarDesign,
  palette: StampPalette,
  sprayFilter: string,
): string {
  const eligible = (design.stamps ?? [])
    .map((stamp, index) => ({ stamp, index }))
    .filter(({ stamp }) => {
      const template = findStamp(stamp.key);
      return !!template && template.layer === 'on' && !stamp.hidden && stamp.backing !== true;
    });

  const drawing = design.drawingHidden
    ? ''
    : design.strokes.map((stroke) => strokeToPolyline(stroke, sprayFilter)).join('');
  const cut = Math.min(design.drawingIndex ?? eligible.length, eligible.length);

  const paint = (from: number, to: number) =>
    eligible
      .slice(from, to)
      .map(({ stamp, index }) =>
        stampToSvg(stamp, findStamp(stamp.key)!, palette, null, index),
      )
      .join('');

  return paint(0, cut) + drawing + paint(cut, eligible.length);
}

export type DesignSvgOptions = {
  /** Include the soft paper drop shadow behind the cutout (cards/previews). */
  shadow?: boolean;
};

/**
 * Render a (sanitized!) design to a standalone SVG string.
 *
 * Trust note: strokes/keys are expected to have passed sanitizeAvatarDesign —
 * colors matched #rrggbb, keys matched [a-z0-9-], numbers are finite. Nothing
 * user-typed is interpolated here, so the output cannot carry markup.
 */
export function designToSvg(design: AvatarDesign, options: DesignSvgOptions = {}): string {
  const { width, height } = DESIGN_SHEET;
  const cutPath = silhouettePathFor(design);
  const paper = findPaperColor(design.paper.color);
  const safeId = design.id.replace(/[^a-zA-Z0-9-]/g, '');
  const clipId = `cut-${safeId}`;
  const sprayId = `spray-${safeId}`;

  const patternInk = darken(paper.fill, 0.25);
  const cutEdge = lighten(paper.fill, 0.55);
  const torn = design.paper.pattern === 'torn-edge';

  const shadow = options.shadow
    ? `<path d="${cutPath}" transform="translate(2.5 3.5)" fill="#3d352d" opacity="0.18"/>`
    : '';

  // A stamp's "paper" role is the pale cut-edge tint, NOT the stock colour:
  // an eye white painted in the same colour as the cutout it sits on is
  // invisible. Pale reads as what it is — a second piece of paper on top.
  const palette: StampPalette = { paper: cutEdge, shadow: darken(paper.fill, 0.22) };

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img">` +
    `<defs><clipPath id="${clipId}"><path d="${cutPath}"/></clipPath>` +
    sprayFilterDefs(sprayId) +
    `</defs>` +
    // Arms, legs, hair: separate pieces of paper glued BEHIND the cutout, so
    // they are drawn first, unclipped, each with its own blade line. This is
    // the layer that can hang outside the silhouette.
    stampLayer(design, 'behind', palette, cutEdge) +
    shadow +
    // Cut edge: slightly wider silhouette behind everything, in pale paper.
    `<path d="${cutPath}" fill="${cutEdge}" stroke="${cutEdge}" ` +
    `stroke-width="${torn ? 4 : 2.4}" stroke-linejoin="round" ${torn ? 'stroke-dasharray="3 1.6"' : ''}/>` +
    `<g clip-path="url(#${clipId})">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${paper.fill}"/>` +
    patternLayer(design.paper.pattern, patternInk) +
    // Faces sit on the paper and under the crayon: a stamp is stuck down
    // first, and you can draw over it afterwards.
    clippedPass(design, palette, sprayId) +
    `</g>` +
    // Backed faces sit outside the clip, on their own scrap of paper, so a
    // hole in the silhouette cannot eat them.
    stampLayer(design, 'on', palette, cutEdge, true) +
    `</svg>`
  );
}

/** Data URL form, for <img> use and Phase B rasterization. */
export function designToDataUrl(design: AvatarDesign, options?: DesignSvgOptions): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(designToSvg(design, options))}`;
}
