import * as THREE from 'three';
import type { CritterParts } from './critterRigs';
import type { CritterSpecies } from './critterVariation';

// Idle actions.
//
// The problem this solves: standing still near a critter used to put it into
// `curious`, where it turned to face the player and then simply held that
// pose. A clearing full of animals silently staring at you is unsettling
// rather than cozy.
//
// Critters now run a rotation of small, natural actions whether or not
// anyone is watching. Noticing the player changes *which* actions are likely
// and how often they glance over — it no longer freezes them.
//
// Poses are driven through the rig's shared `parts` handles rather than
// per-species animation code, so one action reads correctly on a squirrel, a
// cat, and a woodchuck. Species character comes from which actions each one
// draws from and how heavily they are weighted.

export type IdleActionId =
  | 'settle'
  | 'look-around'
  | 'glance-at-player'
  | 'attentive'
  | 'ear-swivel'
  | 'sniff-ground'
  | 'groom'
  | 'stretch'
  | 'perk-up'
  | 'shake-off';

type IdleActionDefinition = {
  /** Seconds; an actual duration is drawn from this range. */
  duration: [number, number];
  /**
   * Pose the critter. `progress` runs 0..1 across the action, `t` is elapsed
   * world time for continuous wobble, `lookAt` is the yaw offset toward the
   * player in the critter's local space (already wrapped to ±π).
   */
  apply: (parts: CritterParts, progress: number, t: number, offset: number, lookAt: number) => void;
};

/** Ease in and back out again, so actions start and end at the rest pose. */
function arc(progress: number) {
  return Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI);
}

function setHead(parts: CritterParts, x: number, y: number, z: number) {
  if (!parts.head) return;
  const rest = parts.rest.head;
  parts.head.rotation.set(rest.x + x, rest.y + y, rest.z + z);
}

/**
 * Scale the body relative to its rest scale. Bodies are non-uniformly scaled
 * to shape each animal, so assigning an absolute 1.0 here would reshape the
 * creature rather than make it breathe.
 */
function breathe(parts: CritterParts, amount: number) {
  if (!parts.body) return;
  const rest = parts.rest.body;
  parts.body.scale.set(rest.scaleX, rest.scaleY * (1 + amount), rest.scaleZ);
}

function setEars(parts: CritterParts, apply: (index: number) => { x?: number; z?: number }) {
  parts.ears.forEach((ear, index) => {
    const rest = parts.rest.ears[index] ?? { x: 0, y: 0, z: 0 };
    const delta = apply(index);
    ear.rotation.x = rest.x + (delta.x ?? 0);
    ear.rotation.z = rest.z + (delta.z ?? 0);
  });
}

export const IDLE_ACTIONS: Record<IdleActionId, IdleActionDefinition> = {
  /** Doing nothing, but breathing while doing it. */
  settle: {
    duration: [1.8, 4.2],
    apply: (parts, _progress, t, offset) => {
      setHead(parts, Math.sin(t * 0.9 + offset) * 0.03, Math.sin(t * 0.6 + offset) * 0.05, 0);
      breathe(parts, Math.sin(t * 1.6 + offset) * 0.012);
    },
  },

  /** A slow sweep left and right, the way a small animal checks its patch. */
  'look-around': {
    duration: [2.2, 3.6],
    apply: (parts, progress, t, offset) => {
      // Two deliberate turns with a pause between, not a continuous swivel.
      const sweep = Math.sin(progress * Math.PI * 2) * 0.55;
      setHead(parts, Math.sin(t * 1.1 + offset) * 0.04, sweep, sweep * 0.12);
    },
  },

  /** Checks on the player, then goes back to what it was doing. */
  'glance-at-player': {
    duration: [1.1, 2.2],
    apply: (parts, progress, _t, _offset, lookAt) => {
      const hold = arc(progress);
      setHead(parts, -0.06 * hold, lookAt * 0.7 * hold, 0.1 * hold);
    },
  },

  /**
   * Listening to you. Held for as long as a conversation is open.
   *
   * Unlike every other action here, this one ignores `progress` — it has no
   * beginning or end, because it lasts exactly as long as the player is
   * talking. Using an `arc` would make the critter drift out of attention
   * mid-sentence and back in again.
   *
   * Still not perfectly still: a small breath and the occasional tilt, so it
   * reads as listening rather than paused.
   */
  attentive: {
    duration: [999, 999],
    apply: (parts, _progress, t, offset) => {
      const sway = Math.sin(t * 0.8 + offset) * 0.05;
      const tilt = Math.sin(t * 0.37 + offset * 1.7);
      setHead(
        parts,
        -0.05 + Math.sin(t * 1.1 + offset) * 0.02,
        sway,
        // An occasional curious head-tilt, rather than a constant wobble.
        tilt > 0.86 ? (tilt - 0.86) * 1.4 : 0,
      );
      breathe(parts, Math.sin(t * 1.5 + offset) * 0.014);
      setEars(parts, () => ({ x: -0.1 }));
    },
  },

  /** Ears track something behind; head barely moves. */
  'ear-swivel': {
    duration: [1.0, 2.0],
    apply: (parts, progress, t, offset) => {
      const flick = arc(progress);
      setEars(parts, (index) => ({
        z: (index === 0 ? 1 : -1) * 0.34 * flick,
        x: -0.18 * flick * (index === 0 ? 1 : 0.4),
      }));
      setHead(parts, 0.04 * flick, Math.sin(t * 3 + offset) * 0.05 * flick, 0);
    },
  },

  /** Nose down to the paper, snuffling. */
  'sniff-ground': {
    duration: [1.8, 3.4],
    apply: (parts, progress, t, offset) => {
      const dip = arc(progress);
      const snuffle = Math.sin(t * 11 + offset) * 0.03 * dip;
      setHead(parts, 0.62 * dip + snuffle, Math.sin(t * 1.9 + offset) * 0.16 * dip, 0);
    },
  },

  /** Turns to work at its own shoulder. */
  groom: {
    duration: [2.4, 4.0],
    apply: (parts, progress, t, offset) => {
      const into = arc(progress);
      const nibble = Math.sin(t * 13 + offset) * 0.07 * into;
      const side = offset > Math.PI ? 1 : -1;
      setHead(parts, 0.34 * into + nibble, side * 0.85 * into, side * 0.3 * into);
    },
  },

  /** A long luxurious stretch, front end down. */
  stretch: {
    duration: [1.8, 2.8],
    apply: (parts, progress, _t, _offset) => {
      const push = arc(progress);
      setHead(parts, -0.3 * push, 0, 0);
      if (parts.body) {
        const rest = parts.rest.body;
        parts.body.rotation.x = rest.rotationX + 0.22 * push;
        parts.body.scale.z = rest.scaleZ * (1 + 0.07 * push);
      }
    },
  },

  /** Head up, alert, holding still — but only briefly. */
  'perk-up': {
    duration: [0.9, 1.8],
    apply: (parts, progress, t, offset) => {
      const up = arc(progress);
      setHead(parts, -0.36 * up, Math.sin(t * 2.2 + offset) * 0.08, 0);
      setEars(parts, () => ({ x: -0.22 * up }));
    },
  },

  /** A quick full-body shiver, the way an animal resets itself. */
  'shake-off': {
    duration: [0.7, 1.1],
    apply: (parts, progress, t, _offset) => {
      const shake = arc(progress);
      setHead(parts, 0, Math.sin(t * 34) * 0.3 * shake, Math.sin(t * 31) * 0.16 * shake);
      if (parts.body) parts.body.rotation.z = Math.sin(t * 32) * 0.09 * shake;
      breathe(parts, 0);
      setEars(parts, (index) => ({ z: Math.sin(t * 36 + index) * 0.3 * shake }));
    },
  },
};

type WeightedAction = { id: IdleActionId; weight: number };

/**
 * Per-species action pools. Weights are relative within a species, so a cat
 * grooms constantly while a bird almost never does.
 *
 * Flyers are absent on purpose: the butterfly's whole body is its animation,
 * and a hovering insect that stops to groom reads as a bug in the physics.
 */
const SPECIES_IDLE: Record<CritterSpecies, WeightedAction[]> = {
  squirrel: [
    { id: 'settle', weight: 2 },
    { id: 'look-around', weight: 4 },
    { id: 'sniff-ground', weight: 3 },
    { id: 'perk-up', weight: 4 },
    { id: 'ear-swivel', weight: 2 },
    { id: 'groom', weight: 2 },
    { id: 'shake-off', weight: 1 },
  ],
  raccoon: [
    { id: 'settle', weight: 2 },
    { id: 'sniff-ground', weight: 5 },
    { id: 'look-around', weight: 3 },
    { id: 'groom', weight: 3 },
    { id: 'perk-up', weight: 2 },
    { id: 'shake-off', weight: 1 },
  ],
  bunny: [
    { id: 'settle', weight: 4 },
    { id: 'ear-swivel', weight: 5 },
    { id: 'perk-up', weight: 4 },
    { id: 'sniff-ground', weight: 3 },
    { id: 'groom', weight: 2 },
    { id: 'look-around', weight: 2 },
  ],
  bird: [
    // Birds move in sharp discrete beats — lots of little glances, no lounging.
    { id: 'look-around', weight: 5 },
    { id: 'sniff-ground', weight: 4 },
    { id: 'perk-up', weight: 4 },
    { id: 'shake-off', weight: 3 },
    { id: 'settle', weight: 1 },
  ],
  cat: [
    { id: 'groom', weight: 6 },
    { id: 'settle', weight: 5 },
    { id: 'stretch', weight: 3 },
    { id: 'look-around', weight: 2 },
    { id: 'ear-swivel', weight: 3 },
  ],
  woodchuck: [
    { id: 'settle', weight: 4 },
    { id: 'sniff-ground', weight: 4 },
    { id: 'look-around', weight: 3 },
    { id: 'stretch', weight: 2 },
    { id: 'groom', weight: 2 },
  ],
  butterfly: [{ id: 'settle', weight: 1 }],
  // Heavy on perk-up on purpose: a meerkat checking things out is not a
  // special occasion, it is the species' entire personality.
  meerkat: [
    { id: 'perk-up', weight: 6 },
    { id: 'look-around', weight: 4 },
    { id: 'sniff-ground', weight: 4 },
    { id: 'ear-swivel', weight: 3 },
    { id: 'settle', weight: 2 },
    { id: 'stretch', weight: 1 },
  ],
};

/**
 * Choose the next idle action.
 *
 * When the player is nearby, a glance is mixed in rather than replacing the
 * critter's own behaviour — that is the difference between an animal that
 * acknowledges you and one that stares. Friendlier critters glance more
 * often, which reads as being comfortable with you around.
 */
export function pickIdleAction(
  species: CritterSpecies,
  rng: () => number,
  options: { playerNearby: boolean; friendship: number },
): IdleActionId {
  if (options.playerNearby) {
    const glanceChance = 0.22 + options.friendship * 0.25;
    if (rng() < glanceChance) return 'glance-at-player';
  }

  const pool = SPECIES_IDLE[species];
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll <= 0) return entry.id;
  }
  return pool[0].id;
}

export function idleActionDuration(id: IdleActionId, rng: () => number): number {
  const [min, max] = IDLE_ACTIONS[id].duration;
  return min + rng() * (max - min);
}

export function applyIdleAction(
  id: IdleActionId,
  parts: CritterParts,
  progress: number,
  t: number,
  offset: number,
  lookAt: number,
) {
  IDLE_ACTIONS[id].apply(parts, progress, t, offset, lookAt);
}

/** Ease every driven part back to its rest pose (used when walking starts). */
export function relaxToRest(parts: CritterParts, rate: number) {
  if (parts.head) {
    const rest = parts.rest.head;
    parts.head.rotation.x = THREE.MathUtils.lerp(parts.head.rotation.x, rest.x, rate);
    parts.head.rotation.y = THREE.MathUtils.lerp(parts.head.rotation.y, rest.y, rate);
    parts.head.rotation.z = THREE.MathUtils.lerp(parts.head.rotation.z, rest.z, rate);
  }
  parts.ears.forEach((ear, index) => {
    const rest = parts.rest.ears[index] ?? { x: 0, y: 0, z: 0 };
    ear.rotation.x = THREE.MathUtils.lerp(ear.rotation.x, rest.x, rate);
    ear.rotation.z = THREE.MathUtils.lerp(ear.rotation.z, rest.z, rate);
  });
  if (parts.body) {
    const rest = parts.rest.body;
    parts.body.rotation.x = THREE.MathUtils.lerp(parts.body.rotation.x, rest.rotationX, rate);
    parts.body.scale.y = THREE.MathUtils.lerp(parts.body.scale.y, rest.scaleY, rate);
    parts.body.scale.z = THREE.MathUtils.lerp(parts.body.scale.z, rest.scaleZ, rate);
  }
}
