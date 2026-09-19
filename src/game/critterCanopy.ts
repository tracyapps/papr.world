import * as THREE from 'three';
import type { PageData } from '../world/types';
import { isSolidAt } from '../world/footprints';
import { isInWater } from '../world/water';
import type { CanopyPose } from './critterRigs';
import type { Critter } from './critterBehavior';
import type { CritterSpecies } from './critterVariation';
import { applyIdleAction, idleActionDuration, pickIdleAction, relaxToRest } from './critterIdle';

// Tree-dwelling critters: sloths, monkeys, and toucans.
//
// Every other critter lives on the ground plane (or hovers a fixed height
// above it). These three live *in* the canopy, so they need three things the
// ground walker cannot give them:
//
// 1. **Somewhere to be.** A tree cutout is a flat billboard with no branches,
//    so the canopy is described as data: per tree, a horizontal "branch line"
//    just under the leaves, the trunk running up to it, any vines hanging
//    from it, and a crown spot up in the leaves. All derived from the page's
//    own tree props — nothing to author, and every client derives the same.
// 2. **Ways to move between those places** — climbing a trunk, hanging and
//    shuffling along the branch line (sloth), swinging and leaping between
//    trees (monkey), flying perch to perch (toucan). Movement is a queue of
//    short *legs*, each a straight line with an optional arc and a pose.
// 3. **A way back to the ground and back up again**, handing over to the
//    ordinary ground walker (`updateGroundCritter`) while they are down there.
//
// Cheap on purpose: no world queries run per frame while aloft. The only
// footprint/water checks happen when a critter *decides* to come down, which
// is a few times a minute at most — see papr-world-frame-budget.

// --- Data -----------------------------------------------------------------

export type CanopyTree = {
  x: number;
  z: number;
  baseY: number;
  height: number;
  rotY: number;
  kind: 'jungle' | 'palm';
  /** Height above the base of the under-canopy "branch line". */
  lineY: number;
  /** Height above the base of the crown perch, up in the leaves. */
  crownY: number;
  /** Half the cutout's width, in world units. */
  halfWidth: number;
  /** How far along the branch line spots may sit, either side of the trunk. */
  reach: number;
  /** The trunk's solid radius (matches footprints.ts). */
  trunkRadius: number;
  vines: Array<{ offset: number; topY: number; bottomY: number }>;
};

/** Where on a tree a critter can rest. */
type Spot =
  | { kind: 'line'; offset: number }
  | { kind: 'crown'; offset: number }
  | { kind: 'vine'; vine: number };

type Leg = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  pose: CanopyPose;
  duration: number;
  /** Positive: a hop/flight bump. Negative: a swing dip. */
  arc: number;
  /** Fixed heading for the leg (climbing faces the trunk); null = face travel. */
  heading: number | null;
  /** Small up-and-down flutter, for flight. */
  flutter: number;
  /** The last leg of a trip down: arriving hands over to the ground walker. */
  landsOnGround: boolean;
  /**
   * A deliberate climb *down* the trunk. Only planDescend sets this: it
   * flips a sprawler nose-first (see poseRoll) and inverts the climb bob.
   * Merely moving to a lower spot is not a descent.
   */
  descend: boolean;
};

export type CanopyState = {
  profile: CanopyProfile;
  trees: CanopyTree[];
  mode: 'aloft' | 'ground';
  tree: number;
  spot: Spot;
  legs: Leg[];
  legTime: number;
  /** Where this critter is resting right now (group origin). */
  rest: THREE.Vector3;
  restPose: CanopyPose;
  pose: CanopyPose;
  groundTime: number;
  groundBudget: number;
  /** Walking back to a trunk to climb it. */
  returning: { tree: number; stepOff: THREE.Vector3 } | null;
  /**
   * Came down to see someone: stay close to this spot (their position at the
   * time) for a while instead of wandering off across the page.
   */
  visit: { x: number; z: number; until: number } | null;
};

export type CanopyProfile = {
  treeKinds: Array<CanopyTree['kind']>;
  /** Uses trunks and vines (sloth, monkey). Flyers never climb. */
  climbs: boolean;
  /** How it moves along and between trees while aloft. */
  travel: 'hang' | 'swing' | 'fly';
  /** Pose while resting on the branch line. */
  linePose: CanopyPose;
  /** Pose while resting on a vine. */
  vinePose: CanopyPose;
  usesVines: boolean;
  usesCrowns: boolean;
  aloftSpeed: number;
  climbSpeed: number;
  /**
   * How the body is held against the trunk while climbing.
   *
   * - `sprawl` (sloth): a horizontal quadruped pitched 90° nose-up, belly to
   *   the bark — and nose-down, rolled, on the way back down.
   * - `upright` (monkey): stays on its feet against the trunk and reaches
   *   with its arms. Pitching an upright climber the sprawler's 90° lays it
   *   on its back, sliding up the tree — the "levitating monkey" bug.
   */
  climbStyle: ClimbStyle;
  /** Climb pulls per second; each one is a visible surge of the body. */
  climbPulls: number;
  /** Height gained (or dropped) per pull, in scaled body units. */
  climbBob: number;
  /** Sideways yaw sway while climbing, radians. */
  climbSway: number;
  /**
   * How far the route pulls the group origin *into* the tree from the
   * standard climb depth, in scaled units. Sprawlers pitch around their
   * feet, which throws the body away from the trunk; insetting the route
   * is what puts the belly back against the bark.
   */
  climbInset: number;
  /** Group-origin height offset for the sitting rest pose (scaled units). */
  sitOffset: number;
  /** Furthest another tree may be for a direct aloft transfer. */
  treeHopRange: number;
  weights: { stay: number; shuffle: number; hopTree: number; descend: number };
  groundTime: [number, number];
  /** Idle actions run this many times slower (a sloth glances *slowly*). */
  idleSlowdown: number;
  /** For 'swing': how far the gripping hand sits above the group origin. */
  gripReach: number;
  /** Will it come down to a player who is nearby, all by itself? */
  comesToPlayer: number;
};

export type ClimbStyle = 'sprawl' | 'upright';

export const CANOPY_PROFILES: Partial<Record<CritterSpecies, CanopyProfile>> = {
  // Slow, upside down, and mostly staying exactly where it is. Comes down to
  // the ground rarely, and the trip is a whole event.
  sloth: {
    treeKinds: ['jungle'],
    climbs: true,
    travel: 'hang',
    linePose: 'hang',
    vinePose: 'climb',
    usesVines: true,
    usesCrowns: false,
    aloftSpeed: 0.85,
    climbSpeed: 0.75,
    climbStyle: 'sprawl',
    // One unhurried reach at a time — the climb visibly advances per reach
    // rather than gliding, at sloth tempo.
    climbPulls: 0.24,
    climbBob: 0.05,
    climbSway: 0.03,
    climbInset: 0.24,
    sitOffset: 0,
    // Sloths transfer where canopies actually meet; any further is a leap it
    // would never take.
    treeHopRange: 4.75,
    weights: { stay: 6, shuffle: 3, hopTree: 1.2, descend: 0.8 },
    groundTime: [22, 42],
    idleSlowdown: 2.6,
    gripReach: 0,
    comesToPlayer: 0,
  },
  // Never still for long: swings along the branches, leaps between trees,
  // drops down to see you, and scampers straight back up.
  monkey: {
    treeKinds: ['jungle', 'palm'],
    climbs: true,
    travel: 'swing',
    linePose: 'sit',
    vinePose: 'swing',
    usesVines: true,
    usesCrowns: true,
    aloftSpeed: 1.45,
    climbSpeed: 1.2,
    // Climbs upright against the trunk, arms doing the work — see
    // ClimbStyle for why this is not the sloth's pitch.
    climbStyle: 'upright',
    climbPulls: 1.5,
    climbBob: 0.07,
    climbSway: 0.07,
    climbInset: 0.02,
    // Sits with its weight on the branch, not hovering a body-height above
    // it: the rig's seat sits ~0.17 above the group origin.
    sitOffset: -0.17,
    treeHopRange: 9.5,
    weights: { stay: 3, shuffle: 1.6, hopTree: 4, descend: 2 },
    groundTime: [8, 20],
    idleSlowdown: 1,
    gripReach: 0.66,
    comesToPlayer: 0.55,
  },
  // Perches, flies, perches. Drops to the ground for a quick hop around and
  // is back up in the leaves before you have finished saying hello.
  toucan: {
    treeKinds: ['jungle', 'palm'],
    climbs: false,
    travel: 'fly',
    linePose: 'sit',
    vinePose: 'sit',
    usesVines: false,
    usesCrowns: true,
    aloftSpeed: 2.4,
    climbSpeed: 0,
    climbStyle: 'upright',
    climbPulls: 0,
    climbBob: 0,
    climbSway: 0,
    climbInset: 0,
    sitOffset: 0.02,
    treeHopRange: 16,
    weights: { stay: 4, shuffle: 0.7, hopTree: 3.5, descend: 1.4 },
    groundTime: [5, 12],
    idleSlowdown: 1,
    gripReach: 0,
    comesToPlayer: 0.35,
  },
};

export function isCanopySpecies(species: CritterSpecies) {
  return species in CANOPY_PROFILES;
}

/** Width-to-height of each tree cutout (matches TREE_DEFS in pageRuntime). */
const TREE_ASPECT: Record<string, number> = {
  'jungle-1': 900 / 1220,
  'jungle-2': 900 / 1220,
  'palm-1': 1101 / 1581,
  'palm-2': 1101 / 1581,
  'palm-3': 1101 / 1581,
  'palm-4': 1121 / 1115,
  'palm-5': 1007 / 1482,
};

/** In front of the tree plane, toward the usual camera side. */
const TRUNK_DEPTH = 0.14;
const LINE_DEPTH = 0.24;
const CROWN_DEPTH = 0.32;

/**
 * The climbable, perchable trees on a page. Pure data, derived from props.
 *
 * `heightAt` and `isWet` are passed in so this can run in tests without a
 * terrain or water registry.
 */
export function canopyTreesFromPage(
  page: PageData,
  heightAt: (x: number, z: number) => number,
  isWet: (x: number, z: number) => boolean,
): CanopyTree[] {
  const trees: CanopyTree[] = [];
  for (const prop of page.props) {
    if (prop.kind !== 'tree') continue;
    const jungle = prop.tree.startsWith('jungle');
    const palm = prop.tree.startsWith('palm');
    if (!jungle && !palm) continue;
    const height = prop.height ?? 0;
    if (height < (jungle ? 7 : 5.5)) continue;
    // Trees standing in water are not built at all (pageRuntime), so nothing
    // may perch on them either.
    if (isWet(prop.x, prop.z)) continue;
    const halfWidth = (height * (TREE_ASPECT[prop.tree] ?? 0.74)) / 2;
    trees.push({
      x: prop.x,
      z: prop.z,
      baseY: heightAt(prop.x, prop.z),
      height,
      rotY: prop.rotY ?? 0,
      kind: jungle ? 'jungle' : 'palm',
      // The broadleaf art's canopy underside is a little under half-way up;
      // a palm's fronds only start near the top.
      lineY: height * (jungle ? 0.44 : 0.76),
      crownY: height * (jungle ? 0.7 : 0.84),
      halfWidth,
      reach: halfWidth * (jungle ? 0.55 : 0.28),
      trunkRadius: height >= 14 ? 0.46 : 0.28,
      vines: (prop.vines ?? []).map((vine) => ({
        offset: vine.offset,
        topY: vine.topY,
        bottomY: vine.topY - vine.height,
      })),
    });
  }
  return trees;
}

// --- Geometry helpers -------------------------------------------------------

/** A point in a tree's own frame: along its width, up, and out of its plane. */
function treePoint(tree: CanopyTree, offset: number, up: number, depth: number, out = new THREE.Vector3()) {
  const rx = Math.cos(tree.rotY);
  const rz = -Math.sin(tree.rotY);
  const nx = Math.sin(tree.rotY);
  const nz = Math.cos(tree.rotY);
  return out.set(
    tree.x + rx * offset + nx * depth,
    tree.baseY + up,
    tree.z + rz * offset + nz * depth,
  );
}

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function headingToward(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

/** Heading that faces the tree trunk (used while climbing). */
function faceTree(tree: CanopyTree) {
  return tree.rotY;
}

/** Heading that faces out of the tree, toward the usual camera side. */
function faceOut(tree: CanopyTree) {
  return tree.rotY + Math.PI;
}

function scaleOf(critter: Critter) {
  return critter.params.scale;
}

/** Group-origin position for resting at a spot in a given pose. */
function spotOrigin(critter: Critter, tree: CanopyTree, spot: Spot, out = new THREE.Vector3()) {
  const profile = critter.canopy!.profile;
  if (spot.kind === 'crown') {
    const point = treePoint(tree, spot.offset, tree.crownY, CROWN_DEPTH, out);
    // Crowns rest in the leaves, but a sitter still puts its weight in
    // them rather than hovering a body-height above.
    if (profile.linePose === 'sit') point.y += profile.sitOffset * scaleOf(critter);
    return point;
  }
  if (spot.kind === 'vine') {
    const vine = tree.vines[spot.vine];
    const gripY = vine.bottomY + (vine.topY - vine.bottomY) * 0.38;
    const point = treePoint(tree, vine.offset, gripY, LINE_DEPTH - 0.06, out);
    if (profile.vinePose === 'swing') point.y -= profile.gripReach * scaleOf(critter);
    return point;
  }
  const point = treePoint(tree, spot.offset, tree.lineY, LINE_DEPTH, out);
  if (profile.linePose === 'sit') point.y += profile.sitOffset * scaleOf(critter);
  return point;
}

/**
 * A point on the trunk to climb through. The raw trunk depth suits an
 * upright climber's feet; a sprawler's route is inset so the pitched-over
 * body ends up against the bark instead of floating a body-length clear of
 * it (see `climbInset`).
 */
function climbPoint(critter: Critter, tree: CanopyTree, up: number, out = new THREE.Vector3()) {
  const { climbStyle, climbInset } = critter.canopy!.profile;
  const inset = (climbStyle === 'sprawl' ? climbInset : climbInset * 0.5) * scaleOf(critter);
  return treePoint(tree, 0, up, TRUNK_DEPTH - inset, out);
}

function spotPose(profile: CanopyProfile, spot: Spot): CanopyPose {
  if (spot.kind === 'vine') return profile.vinePose;
  return profile.linePose;
}

function randomSpot(critter: Critter, tree: CanopyTree): Spot {
  const { profile } = critter.canopy!;
  const rng = critter.rng;
  const options: Array<() => Spot> = [() => ({ kind: 'line', offset: (rng() * 2 - 1) * tree.reach })];
  if (profile.usesCrowns) options.push(() => ({ kind: 'crown', offset: (rng() * 2 - 1) * tree.reach * 0.8 }));
  if (profile.usesVines && tree.vines.length > 0) {
    options.push(() => ({ kind: 'vine', vine: Math.floor(rng() * tree.vines.length) }));
  }
  return options[Math.floor(rng() * options.length)]();
}

function legDuration(from: THREE.Vector3, to: THREE.Vector3, speed: number) {
  return Math.max(0.35, from.distanceTo(to) / Math.max(0.05, speed));
}

function pushLeg(
  state: CanopyState,
  from: THREE.Vector3,
  to: THREE.Vector3,
  pose: CanopyPose,
  speed: number,
  options: { arc?: number; heading?: number | null; flutter?: number; landsOnGround?: boolean; descend?: boolean } = {},
) {
  state.legs.push({
    landsOnGround: options.landsOnGround ?? false,
    descend: options.descend ?? false,
    from: from.clone(),
    to: to.clone(),
    pose,
    duration: legDuration(from, to, speed),
    arc: options.arc ?? 0,
    heading: options.heading ?? null,
    flutter: options.flutter ?? 0,
  });
}

// --- Route planning ---------------------------------------------------------

/** Where the path from a spot meets the branch line (for climbers). */
function lineAccess(critter: Critter, tree: CanopyTree, spot: Spot, out = new THREE.Vector3()) {
  const offset = spot.kind === 'vine' ? tree.vines[spot.vine].offset : spot.offset;
  return treePoint(tree, offset, tree.lineY, LINE_DEPTH, out);
}

/**
 * Legs from the current spot to the branch line on the same tree, for a
 * climber sitting on a vine or up in the crown.
 */
function legsToLine(critter: Critter, state: CanopyState, tree: CanopyTree, from: THREE.Vector3) {
  const { profile, spot } = state;
  const access = lineAccess(critter, tree, spot);
  if (from.distanceTo(access) < 0.05) return access;
  if (spot.kind === 'vine') {
    pushLeg(state, from, access, 'climb', critter.params.speed * profile.climbSpeed, { heading: faceTree(tree) });
  } else {
    pushLeg(state, from, access, profile.travel === 'hang' ? 'hang' : profile.travel, critter.params.speed * profile.aloftSpeed, { arc: 0.15 });
  }
  return access;
}

/** Move to another spot on the same tree. */
function planShuffle(critter: Critter, state: CanopyState, target: Spot) {
  const tree = state.trees[state.tree];
  const { profile } = state;
  const speed = critter.params.speed * profile.aloftSpeed;
  const from = critter.rig.group.position.clone();
  const to = spotOrigin(critter, tree, target);

  if (!profile.climbs) {
    pushLeg(state, from, to, 'fly', speed, { arc: 0.35, flutter: 0.06 });
  } else {
    const onLine = legsToLine(critter, state, tree, from);
    const targetAccess = lineAccess(critter, tree, target);
    const travelPose: CanopyPose = profile.travel === 'hang' ? 'hang' : 'swing';
    const along = onLine.clone();
    const alongTo = targetAccess.clone();
    if (travelPose === 'swing') {
      along.y -= profile.gripReach * scaleOf(critter);
      alongTo.y -= profile.gripReach * scaleOf(critter);
    }
    if (along.distanceTo(alongTo) > 0.05) {
      pushLeg(state, along, alongTo, travelPose, speed, { arc: travelPose === 'swing' ? -0.25 : 0 });
    }
    if (target.kind === 'vine') {
      pushLeg(state, alongTo, to, 'climb', critter.params.speed * profile.climbSpeed, { heading: faceTree(tree) });
    } else if (alongTo.distanceTo(to) > 0.05) {
      pushLeg(state, alongTo, to, spotPose(profile, target), speed, { arc: 0.12 });
    }
  }
  state.spot = target;
  state.restPose = spotPose(profile, target);
}

/** Cross to a nearby tree without touching the ground. */
function planTreeHop(critter: Critter, state: CanopyState, next: number, target: Spot) {
  const { profile } = state;
  const speed = critter.params.speed * profile.aloftSpeed;
  const fromTree = state.trees[state.tree];
  const toTree = state.trees[next];
  const from = critter.rig.group.position.clone();
  const to = spotOrigin(critter, toTree, target);

  if (profile.travel === 'fly') {
    pushLeg(state, from, to, 'fly', speed, { arc: 0.9 + from.distanceTo(to) * 0.06, flutter: 0.1 });
  } else if (profile.travel === 'swing') {
    // A monkey leaps from wherever it is, arms out, and grabs on.
    pushLeg(state, from, to, 'fly', speed * 1.25, { arc: 0.5 + from.distanceTo(to) * 0.05 });
  } else {
    // A sloth reaches across where the two canopies meet, hanging the whole
    // way and sagging slightly as it stretches the gap.
    const onLine = legsToLine(critter, state, fromTree, from);
    const targetAccess = lineAccess(critter, toTree, target);
    pushLeg(state, onLine, targetAccess, 'hang', speed, { arc: -0.22 });
    if (target.kind === 'vine') {
      pushLeg(state, targetAccess, to, 'climb', critter.params.speed * profile.climbSpeed, { heading: faceTree(toTree) });
    }
  }
  state.tree = next;
  state.spot = target;
  state.restPose = spotPose(profile, target);
}

/** A dry, open patch of ground near (x, z), or null. */
function freeGroundNear(x: number, z: number, rng: () => number, spread: number): THREE.Vector3 | null {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = attempt === 0 ? 0 : spread * (0.4 + rng() * 0.6);
    const px = x + Math.sin(angle) * distance;
    const pz = z + Math.cos(angle) * distance;
    if (!isInWater(px, pz) && !isSolidAt(px, pz, 0.2)) return new THREE.Vector3(px, 0, pz);
  }
  return null;
}

/** The step-off point at the foot of a trunk: just clear of its solid footprint. */
function stepOffPoint(tree: CanopyTree) {
  return treePoint(tree, 0, 0, tree.trunkRadius + 0.4);
}

/**
 * Come down to the ground. Climbers go down the trunk (or a vine, if that is
 * where they are, dropping off the end); flyers glide down; a monkey might
 * just jump. `toward` biases the landing, for coming to see a player.
 */
function planDescend(
  critter: Critter,
  state: CanopyState,
  heightAt: (x: number, z: number) => number,
  toward: THREE.Vector3 | null,
): boolean {
  const tree = state.trees[state.tree];
  const { profile } = state;
  const rng = critter.rng;
  const from = critter.rig.group.position.clone();
  const speed = critter.params.speed;

  const jump = profile.travel === 'fly' || (profile.travel === 'swing' && (toward !== null || rng() < 0.5));
  if (jump) {
    const aim = toward ?? treePoint(tree, (rng() * 2 - 1) * tree.halfWidth, 0, 1.4 + rng() * 1.2);
    const ground = freeGroundNear(aim.x, aim.z, rng, 1.2);
    if (!ground) return false;
    ground.y = heightAt(ground.x, ground.z) + critter.rig.groundOffset * scaleOf(critter);
    const flying = profile.travel === 'fly';
    pushLeg(state, from, ground, 'fly', speed * (flying ? profile.aloftSpeed : 2.2), {
      arc: flying ? 0.6 : 0.45,
      flutter: flying ? 0.08 : 0,
      landsOnGround: true,
    });
    return true;
  }

  if (!profile.climbs) return false;
  const stepOff = stepOffPoint(tree);
  if (isInWater(stepOff.x, stepOff.z) || isSolidAt(stepOff.x, stepOff.z, 0.16)) return false;

  const climbSpeed = speed * profile.climbSpeed;
  if (state.spot.kind === 'vine') {
    // Down the vine and off the bottom — a short drop onto the leaves.
    const vine = tree.vines[state.spot.vine];
    const bottom = treePoint(tree, vine.offset, vine.bottomY + 0.2, LINE_DEPTH - 0.06);
    const ground = freeGroundNear(bottom.x, bottom.z, rng, 0.8);
    if (!ground) return false;
    ground.y = heightAt(ground.x, ground.z) + critter.rig.groundOffset * scaleOf(critter);
    pushLeg(state, from, bottom, 'climb', climbSpeed, { heading: faceTree(tree), descend: true });
    pushLeg(state, bottom, ground, 'fly', Math.max(speed, 1.2), { arc: 0.1, landsOnGround: true });
    return true;
  }

  const onLine = legsToLine(critter, state, tree, from);
  const trunkTop = climbPoint(critter, tree, tree.lineY);
  const trunkBase = climbPoint(critter, tree, 0.05);
  const lineStart = onLine.clone();
  if (profile.travel === 'swing') lineStart.y -= profile.gripReach * scaleOf(critter);
  pushLeg(state, lineStart, trunkTop, profile.travel === 'hang' ? 'hang' : 'swing', speed * profile.aloftSpeed);
  // Down the trunk: a sprawler turns nose-first for this leg (poseRoll) and
  // each reach surges it downward instead of up.
  pushLeg(state, trunkTop, trunkBase, 'climb', climbSpeed, { heading: faceTree(tree), descend: true });
  stepOff.y = heightAt(stepOff.x, stepOff.z) + critter.rig.groundOffset * scaleOf(critter);
  pushLeg(state, trunkBase, stepOff, 'ground', Math.max(speed, 0.3), { landsOnGround: true });
  return true;
}

/**
 * Make a planned route continuous: the first leg starts exactly where the
 * critter is, and every leg starts where the previous one ended. Route
 * builders think in named points (trunk top, branch access); this is what
 * turns a small mismatch between them into a short shuffle instead of a pop.
 */
function finalizeRoute(critter: Critter, state: CanopyState) {
  const connected: Leg[] = [];
  let cursor = critter.rig.group.position.clone();
  // Settling from one pose's anchor to the next (sitting on a branch vs.
  // hanging from it by one arm) is a short, quick move — not a slow walk.
  const settleSpeed = Math.max(0.5, critter.params.speed);
  for (const leg of state.legs) {
    if (leg.from.distanceTo(cursor) > 0.05) {
      connected.push({
        from: cursor.clone(),
        to: leg.from.clone(),
        pose: leg.pose,
        duration: legDuration(cursor, leg.from, settleSpeed),
        arc: 0,
        heading: leg.heading,
        flutter: 0,
        landsOnGround: false,
        descend: false,
      });
    }
    connected.push(leg);
    cursor = leg.to;
  }
  state.legs = connected;
  state.legTime = 0;
}

/** From the ground, back up into a tree. */
function planAscend(critter: Critter, state: CanopyState, treeIndex: number) {
  const tree = state.trees[treeIndex];
  const { profile } = state;
  const from = critter.rig.group.position.clone();
  const target = randomSpot(critter, tree);
  const speed = critter.params.speed;
  if (!profile.climbs) {
    const to = spotOrigin(critter, tree, target);
    pushLeg(state, from, to, 'fly', speed * profile.aloftSpeed, { arc: 0.8, flutter: 0.1 });
  } else {
    const trunkBase = climbPoint(critter, tree, 0.05);
    const trunkTop = climbPoint(critter, tree, tree.lineY);
    const climbSpeed = speed * profile.climbSpeed;
    pushLeg(state, from, trunkBase, 'ground', Math.max(speed, 0.3));
    pushLeg(state, trunkBase, trunkTop, 'climb', climbSpeed, { heading: faceTree(tree) });
    const access = lineAccess(critter, tree, target);
    const travelPose: CanopyPose = profile.travel === 'hang' ? 'hang' : 'swing';
    const along = access.clone();
    if (travelPose === 'swing') along.y -= profile.gripReach * scaleOf(critter);
    pushLeg(state, trunkTop, along, travelPose, speed * profile.aloftSpeed);
    const to = spotOrigin(critter, tree, target);
    if (target.kind === 'vine') {
      pushLeg(state, along, to, 'climb', climbSpeed, { heading: faceTree(tree) });
    } else if (along.distanceTo(to) > 0.05) {
      pushLeg(state, along, to, spotPose(profile, target), speed * profile.aloftSpeed, { arc: 0.12 });
    }
  }
  state.tree = treeIndex;
  state.spot = target;
  state.restPose = spotPose(profile, target);
  state.mode = 'aloft';
  state.returning = null;
  finalizeRoute(critter, state);
}

// --- Setup ------------------------------------------------------------------

/**
 * Put a tree-dweller into the canopy. Picks the suitable tree nearest its
 * seeded spawn point; with none on the page, returns false and the critter
 * simply lives on the ground like anyone else.
 */
export function attachCanopy(critter: Critter, allTrees: CanopyTree[]): boolean {
  const profile = CANOPY_PROFILES[critter.species];
  if (!profile) return false;
  const trees = allTrees.filter((tree) => profile.treeKinds.includes(tree.kind));
  if (trees.length === 0) return false;

  const group = critter.rig.group;
  // Prefer mid-height trees: emergents put a critter out of sight overhead.
  let best = -1;
  let bestScore = Infinity;
  trees.forEach((tree, index) => {
    const distance = Math.hypot(tree.x - group.position.x, tree.z - group.position.z);
    const score = distance + Math.max(0, tree.height - 15) * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });

  critter.canopy = {
    profile,
    trees,
    mode: 'aloft',
    tree: best,
    spot: { kind: 'line', offset: 0 },
    legs: [],
    legTime: 0,
    rest: new THREE.Vector3(),
    restPose: profile.linePose,
    pose: profile.linePose,
    groundTime: 0,
    groundBudget: 0,
    returning: null,
    visit: null,
  };
  const state = critter.canopy;
  state.spot = randomSpot(critter, trees[best]);
  state.restPose = spotPose(profile, state.spot);
  state.pose = state.restPose;
  spotOrigin(critter, trees[best], state.spot, state.rest);
  group.position.copy(state.rest);
  group.rotation.order = 'YXZ';
  critter.heading = restHeading(state);
  critter.home.set(trees[best].x, 0, trees[best].z);
  orient(critter, state.pose, critter.heading, 1);
  critter.rig.setPose?.(state.pose);
  return true;
}

function restHeading(state: CanopyState) {
  const tree = state.trees[state.tree];
  if (state.restPose === 'climb') return faceTree(tree);
  // Sloths hang along the branch; everyone else sits facing out.
  if (state.restPose === 'hang') return tree.rotY + Math.PI / 2;
  return faceOut(tree);
}

// --- Per-frame --------------------------------------------------------------

/**
 * Body pitch for a pose. Climbing is the interesting one, and it is
 * per-species because rig body plans differ: a sprawler is a horizontal
 * quadruped that must be pitched nose-up to hug the trunk; an upright
 * climber is built standing and only leans in. One shared 90° used to be
 * applied to both, which laid the monkey on its back and slid it up the
 * tree — reported as "the monkey just levitates."
 */
export function posePitch(profile: CanopyProfile, pose: CanopyPose): number {
  if (pose !== 'climb') return 0;
  return profile.climbStyle === 'sprawl' ? Math.PI / 2 : -0.32;
}

/**
 * Body roll for a pose. Hanging is upside down. A *sprawling* climber
 * descends a trunk nose-first — the roll is what keeps its belly against
 * the bark while the pitch sends the nose down instead of up. An upright
 * climber must not roll: π on a standing body plan means an upside-down
 * monkey backing down a tree with its back to the bark (caught in a live
 * visual pass — the screenshot showed precisely that).
 */
export function poseRoll(profile: CanopyProfile, pose: CanopyPose, descend: boolean): number {
  if (pose === 'hang') return Math.PI;
  if (pose === 'climb' && descend && profile.climbStyle === 'sprawl') return Math.PI;
  return 0;
}

/** Ease the group's orientation toward what the pose needs. */
function orient(critter: Critter, pose: CanopyPose, heading: number, blend: number, descend = false) {
  const group = critter.rig.group;
  const profile = critter.canopy!.profile;
  const k = Math.min(1, blend);
  critter.heading += wrapAngle(heading - critter.heading) * k;
  group.rotation.y = critter.heading;
  group.rotation.x += (posePitch(profile, pose) - group.rotation.x) * k;
  group.rotation.z += (poseRoll(profile, pose, descend) - group.rotation.z) * k;
}

function setPose(critter: Critter, pose: CanopyPose) {
  const state = critter.canopy!;
  if (state.pose === pose) return;
  state.pose = pose;
  critter.rig.setPose?.(pose);
}

function startIdle(critter: Critter, playerNearby: boolean) {
  const state = critter.canopy!;
  critter.state = 'idle';
  critter.stateTime = 0;
  critter.idleAction = pickIdleAction(critter.species, critter.rng, {
    playerNearby,
    friendship: critter.friendship,
  });
  critter.idleDuration = idleActionDuration(critter.idleAction, critter.rng) * state.profile.idleSlowdown;
  critter.stateDuration = critter.idleDuration;
}

/** How long a visiting critter stays near the player before resuming its own life. */
const VISIT_SECONDS = 14;

function enterGround(critter: Critter) {
  const state = critter.canopy!;
  state.mode = 'ground';
  state.groundTime = 0;
  const [min, max] = state.profile.groundTime;
  state.groundBudget = min + critter.rng() * (max - min);
  if (state.visit) {
    state.visit.until = VISIT_SECONDS;
    state.groundBudget = Math.max(state.groundBudget, VISIT_SECONDS + 2);
  }
  state.returning = null;
  state.legs = [];
  setPose(critter, 'ground');
  critter.rig.group.rotation.x = 0;
  critter.rig.group.rotation.z = 0;
  critter.home.set(critter.rig.group.position.x, 0, critter.rig.group.position.z);
  critter.target.copy(critter.home);
  critter.detour = null;
  if (state.visit) {
    // Landed to say hello: look at them first.
    critter.home.set(state.visit.x, 0, state.visit.z);
    critter.state = 'curious';
    critter.noticed = true;
    critter.stateTime = 0;
    return;
  }
  critter.state = 'idle';
  critter.stateTime = 0;
  critter.idleAction = 'settle';
  critter.idleDuration = 1.2;
  critter.stateDuration = 1.2;
}

function arrive(critter: Critter, last: Leg, playerNearby: boolean) {
  const state = critter.canopy!;
  state.legs = [];
  state.legTime = 0;
  if (last.landsOnGround) {
    enterGround(critter);
    return;
  }
  state.rest.copy(critter.rig.group.position);
  setPose(critter, state.restPose);
  startIdle(critter, playerNearby);
}

function nearestTree(state: CanopyState, x: number, z: number, maxDistance = Infinity): number {
  let best = -1;
  let bestDistance = maxDistance;
  state.trees.forEach((tree, index) => {
    const distance = Math.hypot(tree.x - x, tree.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/** Trees reachable without touching the ground, excluding the current one. */
function hopCandidates(state: CanopyState): number[] {
  const here = state.trees[state.tree];
  const result: number[] = [];
  state.trees.forEach((tree, index) => {
    if (index === state.tree) return;
    if (Math.hypot(tree.x - here.x, tree.z - here.z) <= state.profile.treeHopRange) result.push(index);
  });
  return result;
}

function decide(critter: Critter, heightAt: (x: number, z: number) => number, playerNearby: boolean) {
  const state = critter.canopy!;
  const { weights } = state.profile;
  const hops = hopCandidates(state);
  const options: Array<[number, () => boolean]> = [
    [weights.stay, () => false],
    [weights.shuffle, () => {
      planShuffle(critter, state, randomSpot(critter, state.trees[state.tree]));
      return true;
    }],
    [hops.length > 0 ? weights.hopTree : 0, () => {
      const next = hops[Math.floor(critter.rng() * hops.length)];
      planTreeHop(critter, state, next, randomSpot(critter, state.trees[next]));
      return true;
    }],
    [weights.descend, () => planDescend(critter, state, heightAt, null)],
  ];
  const total = options.reduce((sum, [weight]) => sum + weight, 0);
  let roll = critter.rng() * total;
  for (const [weight, run] of options) {
    roll -= weight;
    if (roll <= 0) {
      if (run()) {
        finalizeRoute(critter, state);
        critter.state = 'wander';
        critter.stateTime = 0;
        return;
      }
      break;
    }
  }
  startIdle(critter, playerNearby);
}

/**
 * A player below asked for attention (a click, a pet). Monkeys and toucans
 * come down to them; a sloth *starts* coming down, at sloth speed.
 */
export function requestCanopyVisit(
  critter: Critter,
  toward: THREE.Vector3,
  heightAt: (x: number, z: number) => number,
): 'coming' | 'slow' | 'busy' | 'none' {
  const state = critter.canopy;
  if (!state || state.mode !== 'aloft') return 'none';
  if (state.legs.length > 0) return 'busy';
  const spot = new THREE.Vector3(toward.x, 0, toward.z);
  const from = critter.rig.group.position;
  const dx = from.x - spot.x;
  const dz = from.z - spot.z;
  const length = Math.hypot(dx, dz) || 1;
  // Land a polite arm's length away, on the critter's side of the player.
  spot.x += (dx / length) * 1.3;
  spot.z += (dz / length) * 1.3;
  const slow = state.profile.travel === 'hang';
  if (!planDescend(critter, state, heightAt, slow ? null : spot)) return 'busy';
  // Once down, hang about near whoever asked (a sloth takes so long that
  // the visit clock simply starts when it lands).
  state.visit = { x: toward.x, z: toward.z, until: 0 };
  finalizeRoute(critter, state);
  critter.state = 'wander';
  critter.stateTime = 0;
  return slow ? 'slow' : 'coming';
}

/** Is this critter up in a tree right now (not on the ground)? */
export function isAloft(critter: Critter) {
  return critter.canopy?.mode === 'aloft';
}

export type CanopyContext = {
  engaged: boolean;
  heightAt: (x: number, z: number) => number;
  /** The ordinary ground walker, for time spent on the ground. */
  groundUpdate: (critter: Critter, delta: number, elapsed: number, avatarPosition: THREE.Vector3) => void;
};

const scratch = new THREE.Vector3();

export function updateCanopyCritter(
  critter: Critter,
  delta: number,
  elapsed: number,
  avatarPosition: THREE.Vector3,
  context: CanopyContext,
) {
  const state = critter.canopy!;
  const { rig, params } = critter;
  const group = rig.group;

  // ---- On the ground: the ordinary walker, plus deciding when to go back up.
  if (state.mode === 'ground') {
    state.groundTime += delta;
    if (state.visit) {
      if (state.groundTime > state.visit.until) {
        state.visit = null;
      } else if (critter.state === 'wander') {
        // Potter about close by rather than heading off across the page.
        const tx = critter.target.x - state.visit.x;
        const tz = critter.target.z - state.visit.z;
        const distance = Math.hypot(tx, tz);
        if (distance > 2.2) {
          critter.target.set(state.visit.x + (tx / distance) * 1.6, 0, state.visit.z + (tz / distance) * 1.6);
        }
      }
    }
    if (state.returning) {
      const { stepOff } = state.returning;
      if (Math.hypot(stepOff.x - group.position.x, stepOff.z - group.position.z) < 0.55) {
        planAscend(critter, state, state.returning.tree);
        critter.state = 'wander';
        critter.stateTime = 0;
      } else if (!context.engaged && critter.state === 'idle') {
        critter.target.set(stepOff.x, 0, stepOff.z);
        critter.state = 'wander';
        critter.stateTime = 0;
        critter.detour = null;
      }
    } else if (
      !context.engaged
      && critter.state === 'idle'
      && state.groundTime > state.groundBudget
    ) {
      const index = nearestTree(state, group.position.x, group.position.z);
      if (index >= 0) {
        if (!state.profile.climbs) {
          planAscend(critter, state, index);
          critter.state = 'wander';
          critter.stateTime = 0;
        } else {
          state.visit = null;
          const stepOff = stepOffPoint(state.trees[index]);
          state.returning = { tree: index, stepOff };
          critter.target.set(stepOff.x, 0, stepOff.z);
          critter.home.set(stepOff.x, 0, stepOff.z);
          critter.state = 'wander';
          critter.stateTime = 0;
          critter.detour = null;
        }
      }
    }
    if (state.mode === 'ground') {
      context.groundUpdate(critter, delta, elapsed, avatarPosition);
      return;
    }
  }

  // ---- Aloft.
  critter.stateTime += delta;
  const playerDistance = Math.hypot(avatarPosition.x - group.position.x, avatarPosition.z - group.position.z);
  const playerNearby = playerDistance < critter.curiousRange + 1.5;
  const toPlayer = headingToward(group.position.x, group.position.z, avatarPosition.x, avatarPosition.z);

  // A petting flourish, wherever it happens to be.
  if (critter.state === 'flourish') {
    rig.flourish(Math.min(critter.stateTime / critter.stateDuration, 1), elapsed);
    if (critter.stateTime >= critter.stateDuration) startIdle(critter, playerNearby);
    return;
  }

  // Being talked to: stop mid-branch and listen.
  if (context.engaged) {
    const facePlayer = state.pose !== 'climb';
    orient(critter, state.pose, facePlayer ? toPlayer : critter.heading, delta * 3);
    rig.animate(elapsed, delta, false, 0, true);
    applyIdleAction('attentive', rig.parts, 0, elapsed, params.animOffset, 0);
    return;
  }

  // Travelling.
  if (state.legs.length > 0) {
    const leg = state.legs[0];
    state.legTime += delta;
    const progress = Math.min(1, state.legTime / leg.duration);
    const eased = leg.pose === 'fly' ? progress : progress * progress * (3 - 2 * progress);
    scratch.copy(leg.from).lerp(leg.to, eased);
    scratch.y += Math.sin(progress * Math.PI) * leg.arc;
    if (leg.flutter) scratch.y += Math.sin(elapsed * 9 + params.animOffset) * leg.flutter;

    // A climb is reaches, not a glide: the body surges with each pull and
    // sways a little as the arms trade places. Derived from progress alone
    // — no time, no rng — so every client simulating this critter sees the
    // same climb from the same seeds.
    const climb = leg.pose === 'climb' ? state.profile : null;
    let climbSwayPhase = 0;
    if (climb && climb.climbBob > 0) {
      const pulls = Math.max(1, Math.round(leg.duration * Math.max(0.01, climb.climbPulls)));
      climbSwayPhase = Math.sin(progress * Math.PI * pulls);
      const direction = leg.descend ? -1 : 1;
      scratch.y += Math.abs(climbSwayPhase) * climb.climbBob * direction * scaleOf(critter);
    }

    group.position.copy(scratch);

    setPose(critter, leg.pose);
    const horizontal = Math.hypot(leg.to.x - leg.from.x, leg.to.z - leg.from.z);
    let heading = leg.heading
      ?? (horizontal > 0.05 ? headingToward(leg.from.x, leg.from.z, leg.to.x, leg.to.z) : critter.heading);
    if (climb) heading += climbSwayPhase * climb.climbSway;
    orient(critter, leg.pose, heading, delta * 7, leg.descend);

    // Hanging and swinging travel hand over hand: a slow roll from side to
    // side, one lean per hand, sells the reach without a single extra query.
    if (leg.pose === 'hang' || leg.pose === 'swing') {
      const hands = Math.max(1, Math.round(leg.duration * 1.1 / state.profile.idleSlowdown));
      group.rotation.z += Math.sin(progress * Math.PI * hands) * 0.06;
    }

    rig.animate(elapsed, delta, true, 1, false);
    relaxToRest(rig.parts, Math.min(1, delta * 8));

    if (progress >= 1) {
      state.legs.shift();
      state.legTime = 0;
      if (state.legs.length === 0) arrive(critter, leg, playerNearby);
    }
    return;
  }

  // Resting.
  group.position.copy(state.rest);
  const facingPlayer = playerNearby && state.pose !== 'climb';
  orient(critter, state.pose, facingPlayer ? toPlayer : restHeading(state), delta * (1.4 / state.profile.idleSlowdown));

  if (playerNearby && !critter.noticed) {
    critter.noticed = true;
    // Some come down to say hello all by themselves.
    if (
      playerDistance < 8
      && state.profile.comesToPlayer > 0
      && params.shyness < 0.5
      && critter.rng() < state.profile.comesToPlayer
      && requestCanopyVisit(critter, avatarPosition, context.heightAt) === 'coming'
    ) {
      return;
    }
    critter.idleAction = 'glance-at-player';
    critter.idleDuration = 1.6 * state.profile.idleSlowdown;
    critter.stateDuration = critter.idleDuration;
    critter.stateTime = 0;
  }
  if (!playerNearby && playerDistance > critter.curiousRange + 3) critter.noticed = false;

  rig.animate(elapsed, delta, false, 0, playerNearby);
  applyIdleAction(
    critter.idleAction,
    rig.parts,
    critter.stateTime / Math.max(0.01, critter.idleDuration),
    elapsed / state.profile.idleSlowdown,
    params.animOffset,
    wrapAngle(toPlayer - critter.heading),
  );

  if (critter.stateTime >= critter.stateDuration) decide(critter, context.heightAt, playerNearby);
}
