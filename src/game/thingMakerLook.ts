// How the Thing Maker looks at each level. Renderer-free so it can be tested.
//
// The machine has always had levels 1 to 3 (`world.thingMaker.level`). The
// owner's direction (2026-09-20, with rough mockups): the machine does NOT just
// grow. It stays about the same height, the same friendly face and the same
// bell at every level, and *gains* parts: level 1 is a small brown box with a
// crank, a plan slot, a few buttons and a bell; level 2 adds a blue top, a
// gauge, a lever and a paper tray; level 3 is the full machine with its rollers,
// strands, plaid console and central column.
//
// Rule that keeps this honest: every part at level N is still there at N + 1.
//
// Accessibility: a plainer machine is never a harder one to use. The pointer
// target keeps the full machine's footprint (MAKER_HIT_BOX) at every level, the
// reach for the prompt is unchanged, and the tray holds the same things at the
// same size and place at every level.

export const MAX_MAKER_LEVEL = 3;

export type MakerPart =
  | 'bell'
  | 'crank'
  | 'slot'
  | 'buttons'
  | 'eyes'
  | 'tray'
  | 'topSheet'
  | 'gauge'
  | 'lever'
  | 'rollers'
  | 'strands'
  | 'console'
  | 'belly'
  | 'column';

/** New parts each level brings. Level 3 is today's full machine. */
const PARTS_ADDED: Readonly<Record<number, readonly MakerPart[]>> = {
  1: ['bell', 'crank', 'slot', 'buttons', 'eyes', 'tray'],
  2: ['topSheet', 'gauge', 'lever'],
  3: ['rollers', 'strands', 'console', 'belly', 'column'],
};

/** Body width, eye size and so on by level. Height is shared on purpose. */
const LEVEL_SHAPE: Readonly<Record<number, {
  bodyWidth: number;
  eyeRadius: number;
  eyeSpacing: number;
  bridgeWidth: number;
  crankRadius: number;
}>> = {
  1: { bodyWidth: 1.15, eyeRadius: 0.11, eyeSpacing: 0.17, bridgeWidth: 0.62, crankRadius: 0.26 },
  2: { bodyWidth: 1.55, eyeRadius: 0.14, eyeSpacing: 0.21, bridgeWidth: 0.76, crankRadius: 0.3 },
  3: { bodyWidth: 1.9, eyeRadius: 0.17, eyeSpacing: 0.24, bridgeWidth: 0.9, crankRadius: 0.34 },
};

/** Every level has the same body height and the same eye line. */
export const MAKER_BODY_HEIGHT = 0.72;
export const MAKER_EYE_Y = 1.25;

/** The full machine's footprint, used as the pointer target at every level. */
export const MAKER_HIT_BOX = { width: 2.3, height: 1.5, depth: 1.6, centerY: 0.75, centerZ: -0.35 } as const;

export function makerLookLevel(level: number): number {
  const whole = Math.round(Number.isFinite(level) ? level : 1);
  return Math.min(MAX_MAKER_LEVEL, Math.max(1, whole));
}

export type MakerLook = {
  level: number;
  parts: ReadonlySet<MakerPart>;
  bodyWidth: number;
  eyeRadius: number;
  eyeSpacing: number;
  bridgeWidth: number;
  crankRadius: number;
  /** Highest point of the model: the top of the eyes. */
  height: number;
};

export function makerLook(level: number): MakerLook {
  const clamped = makerLookLevel(level);
  const parts = new Set<MakerPart>();
  for (let step = 1; step <= clamped; step += 1) {
    for (const part of PARTS_ADDED[step]) parts.add(part);
  }
  const shape = LEVEL_SHAPE[clamped];
  return { level: clamped, parts, ...shape, height: MAKER_EYE_Y + shape.eyeRadius };
}
