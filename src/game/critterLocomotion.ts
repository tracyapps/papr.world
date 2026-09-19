import type { CritterSpecies } from './critterVariation';

// Locomotion profiles: HOW a species moves, as data.
//
// The movement stack is split by question, and a new animal should only ever
// need to answer the ones that are new about it:
//
//   critterRigs.ts       what it looks like (limbs, gait animation)
//   critterLocomotion.ts how it gets about on the ground (this file)
//   critterCanopy.ts     where tree-dwellers live and how they climb
//   critterBehavior.ts   the shared state machine that drives them all
//
// So a frog is a rig plus `{ water: 'wade', hop: { height: 0.5, rate: 2.1 } }`;
// a fish is a rig plus `{ water: 'swim' }`. Neither touches the walker.
//
// Anything a profile leaves unset is the plain walker default, which is why
// the table below only lists the species that deviate.

/** How the ground walker treats water. */
export type WaterPolicy = 'avoid' | 'wade' | 'swim';

/**
 * - `avoid` — never chooses a destination in water and won't cross deep
 *   water (today's default: squirrels do not swim).
 * - `wade` — may choose shallow-water destinations and cross ponds; deep
 *   water still blocks (a frog paddles across, it does not submarine).
 * - `swim` — fully aquatic: destinations are chosen *in* water, dry ground
 *   is never targeted, and the body settles submerged (a fish).
 */
export type HopProfile = {
  /** Peak hop height in unscaled body units. */
  height: number;
  /** Leg cycles per unit of distance travelled. */
  rate: number;
};

export type LocomotionProfile = {
  water: WaterPolicy;
  /** Hop locomotion; absent means the species walks. */
  hop?: HopProfile;
};

const WALKER: LocomotionProfile = { water: 'avoid' };

const hop = (height: number, rate = 5.2): LocomotionProfile => ({ water: 'avoid', hop: { height, rate } });

/**
 * Species that move differently from the plain walker. Everyone not listed
 * walks, avoids water, and needs no entry — adding one is opting *into*
 * deviance, not registering for existence.
 */
export const LOCOMOTION: Partial<Record<CritterSpecies, LocomotionProfile>> = {
  bunny: hop(0.2),
  bird: hop(0.12),
  parrot: hop(0.12),
  toucan: hop(0.1),
};

/**
 * The locomotion profile for a species; walkers get the shared default.
 *
 * Deliberately not cached: a tiny merge, called a handful of times per
 * critter per frame, and a live view of the table keeps it trivially
 * testable (and future runtime tweakable).
 */
export function locomotionOf(species: CritterSpecies): LocomotionProfile {
  return { ...WALKER, ...LOCOMOTION[species] };
}
