// Keeping a talking animal in view.
//
// The conversation card sits along the bottom of the screen. When the animal
// you are talking to is behind it, the view slides up just far enough to bring
// the animal into the clear band above the card, and slides back when the
// conversation ends. Nothing about the card moves, so it stays where a hand
// (or a screen reader's reading order) already expects it.
//
// Pure arithmetic only: `critterDialogue.ts` measures the screen and applies
// the result to the camera.

export type Box = { left: number; right: number; top: number; bottom: number };

export type FramingInput = {
  /** The animal's box on screen, measured with no shift applied. */
  animal: Box;
  /** The card's box on screen. */
  card: Box;
  /** The screen's height, in pixels. */
  viewportHeight: number;
  /** The top of the band left clear for the animal (below the HUD buttons). */
  clearTop: number;
  /** Breathing room between the animal and the card, in pixels. */
  gap?: number;
};

/** The most the view will ever slide, as a share of the screen's height. */
export const MAX_SHIFT_SHARE = 0.6;

/**
 * How many pixels to slide the view up so the animal clears the card.
 * Zero when it already does: to one side of the card, or above it.
 */
export function framingShift(input: FramingInput): number {
  const { animal, card, viewportHeight, clearTop } = input;
  const gap = input.gap ?? 16;
  // Beside the card, not behind it: nothing to do.
  if (animal.right < card.left || animal.left > card.right) return 0;
  const clearBottom = card.top - gap;
  const need = animal.bottom - clearBottom;
  if (need <= 0) return 0;
  // Never slide the animal's head out of the clear band to save its feet.
  const room = Math.max(0, animal.top - clearTop);
  return Math.max(0, Math.min(need, room, viewportHeight * MAX_SHIFT_SHARE));
}

/** One step of easing toward `target`. Reduced motion snaps straight there. */
export function easeShift(current: number, target: number, deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return target;
  const next = current + (target - current) * (1 - Math.exp(-deltaSeconds * 9));
  return Math.abs(target - next) < 0.5 ? target : next;
}
