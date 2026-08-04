import type { ToolId } from '../sim/catalogs/tools';

/**
 * Artwork for tools that have it.
 *
 * Deliberately partial. A tool's existence in the game is a data decision;
 * its artwork arrives separately and often later. Requiring an entry here
 * would mean either blocking a mechanic on a drawing or checking in a
 * placeholder that quietly ships. Tools without art render as a plain
 * numbered slot — the same treatment an empty slot already uses — so a new
 * tool is playable the moment it is defined and simply gets better looking
 * when the art lands.
 *
 * Read through `getToolArt()`, never indexed directly.
 */
/**
 * How a tool's artwork is framed inside a rail slot.
 *
 * This lives with the art, not in CSS. Each drawing has its own proportions
 * and its own idea of where its interesting end is — a hoe is 3.5:1 and wants
 * to run diagonally with the blade high; scissors are nearly square. Framing
 * used to be per-slot CSS (`.tool-slot-2 .tool-slot-art { ... }`), which meant
 * every new tool needed a stylesheet edit and slot *numbers* were baked into
 * the presentation. Now a tool ships its own framing and can move slots
 * freely.
 *
 * Values are in the slot's own pixel space: the slot box is 184 × 140.
 */
export type ToolArtFrame = {
  /** Rendered width in slot pixels. May exceed the slot — art bleeds out. */
  width: number;
  left: number;
  top: number;
  /** Degrees. Negative lifts the right-hand end of the drawing. */
  rotate: number;
  /** Mirror horizontally, for art drawn facing the wrong way. */
  flipX?: boolean;
  /** How far the art rises when its slot is selected. */
  activeLift?: number;
  /** Matching lift for the number badge, so the two move together. */
  activeBadgeLift?: number;
};

export const TOOL_ART = {
  'flimsy-shovel': {
    aspectRatio: 493 / 169,
    sourceUrl: new URL('../../assets/source/tools/flimsy-shovel.svg', import.meta.url).href,
    frame: { width: 320, left: -42, top: 55, rotate: -11, flipX: true, activeLift: -62, activeBadgeLift: -24 },
  },
  'creased-hoe': {
    aspectRatio: 599 / 169,
    // The alt version lightens the metal so the blade reads against the
    // rail's near-black paper.
    sourceUrl: new URL('../../assets/source/tools/garden-hoe-alt.svg', import.meta.url).href,
    // Runs lower-left to upper-right with the blade high, so the head is the
    // part you see rather than a long crushed handle.
    frame: { width: 330, left: -52, top: 34, rotate: -24, activeLift: -48, activeBadgeLift: -18 },
  },
  'kids-scissors': {
    aspectRatio: 305 / 205,
    sourceUrl: new URL('../../assets/source/tools/kids-scissors.svg', import.meta.url).href,
    frame: { width: 168, left: 16, top: 2, rotate: -14 },
  },
  'sturdy-scissors': {
    aspectRatio: 500 / 321,
    sourceUrl: new URL('../../assets/source/tools/sturdy-scissors.svg', import.meta.url).href,
    frame: { width: 205, left: 6, top: -4, rotate: -18 },
  },
} as const satisfies Partial<Record<ToolId, {
  aspectRatio: number;
  sourceUrl: string;
  frame: ToolArtFrame;
}>>;

export type ToolArt = { aspectRatio: number; sourceUrl: string; frame: ToolArtFrame };

/** Artwork for a tool, or null when it has none yet. */
export function getToolArt(toolId: ToolId): ToolArt | null {
  return (TOOL_ART as Partial<Record<ToolId, ToolArt>>)[toolId] ?? null;
}

/** Framing as inline CSS custom properties for the rail slot. */
export function toolArtStyle(frame: ToolArtFrame): string {
  return [
    `--art-width:${frame.width}px`,
    `--art-left:${frame.left}px`,
    `--art-top:${frame.top}px`,
    `--art-rotate:${frame.rotate}deg`,
    `--art-flip:${frame.flipX ? -1 : 1}`,
    `--art-active-lift:${frame.activeLift ?? 0}px`,
    `--art-active-badge-lift:${frame.activeBadgeLift ?? 0}px`,
  ].join(';');
}

export const FUTURE_SHOVEL_ART = {
  okayish: new URL('../../assets/source/tools/okayish-shovel.svg', import.meta.url).href,
  heavyDuty: new URL('../../assets/source/tools/heavy-duty-shovel.svg', import.meta.url).href,
  fancy: new URL('../../assets/source/tools/fancy-shovel.svg', import.meta.url).href,
} as const;
