import * as THREE from 'three';
import { sampleTerrainHeight } from '../world/terrain';
import { bridgeDeckHeightAt, isDeepWater, isInWater, waterDepthAt } from '../world/water';
import { isSolidAt } from '../world/footprints';
import { slideMove } from '../core/placement';
import type { CritterRig } from './critterRigs';
import type { CritterParams, CritterSpecies } from './critterVariation';
import {
  applyIdleAction,
  idleActionDuration,
  pickIdleAction,
  relaxToRest,
  type IdleActionId,
} from './critterIdle';
import { getBoldnessBoost } from './friendship';

// Shared critter behavior: home-range wandering with player curiosity.
// Defaults follow the cozy-game convention (Animal Crossing / Stardew):
// critters live in a small home range, notice a nearby player, and never
// flee the map or chase anyone down. See docs/critter-design.md.

export type CritterState = 'idle' | 'wander' | 'curious' | 'flourish' | 'engaged';

/**
 * The critter currently in conversation with the player, if any.
 *
 * An animal you are talking to should stay put and listen. Wandering off
 * mid-sentence, or dropping into a grooming session while its speech bubble
 * is open, reads as the dialogue being disconnected from the creature saying
 * it.
 *
 * Held here rather than in the dialogue module so that `updateCritter` — which
 * must not import UI — can consult it. The dialogue calls the setter.
 */
let engagedCritterId: string | null = null;

export function setEngagedCritter(critterId: string | null) {
  engagedCritterId = critterId;
}

export function getEngagedCritterId() {
  return engagedCritterId;
}

export type Critter = {
  id: string;
  species: CritterSpecies;
  params: CritterParams;
  rig: CritterRig;
  /** Where this critter was seeded. Deterministic; never changes. */
  home: THREE.Vector3;
  rng: () => number;
  state: CritterState;
  stateTime: number;
  stateDuration: number;
  target: THREE.Vector3;
  heading: number;
  walkPhase: number;
  /** Distance at which this critter notices the player (friendship widens it). */
  curiousRange: number;
  mapFeatureId: string;
  /** Current idle action, and how long it runs. */
  idleAction: IdleActionId;
  idleDuration: number;
  /**
   * Latches once the player comes into range, so a critter greets you once
   * and then resumes its life rather than restarting `curious` every frame
   * you remain nearby. Cleared when you leave.
   */
  noticed: boolean;
  /** 0..1 friendship, refreshed occasionally rather than every frame. */
  friendship: number;
  friendshipCheckedAt: number;
  /**
   * A committed waypoint for getting around an obstacle, or null when walking
   * straight at the goal. See `steerAround`.
   */
  detour: THREE.Vector3 | null;
  /** Which side the detour went round: -1, 0 (none), or 1. Prevents dithering. */
  detourSign: number;
  /** Seconds left before an unreachable detour is abandoned. */
  detourTime: number;
  /** Cached result of the last direct-path check, and time until the next. */
  pathBlocked: boolean;
  pathCooldown: number;
};

const ARRIVE = 0.35;
const TURN_RATE = 4.5;
const FLOURISH_CHANCE = 0.12;
const FLOURISH_DURATION = 2.4;
/** How long a critter keeps facing you before resuming its own business. */
const CURIOUS_FACING_TIME = 1.6;
/**
 * How far a fully befriended critter's roaming centre drifts from its seeded
 * home toward the player. Capped so a critter never abandons its page — the
 * world stays populated and page streaming stays deterministic.
 */
const MAX_FRIEND_DRIFT = 6.5;
const FRIENDSHIP_REFRESH_SECONDS = 4;
/**
 * How much of the water's depth a critter sinks. Less than the player's full
 * sink because critters are small and mostly legs — a fully sunk squirrel
 * would disappear into a puddle.
 */
const WADE_SINK_RATIO = 0.55;
/**
 * How much room a critter keeps around a wall or tree trunk.
 *
 * Small: these are little paper animals, and a generous margin would make
 * them visibly refuse to walk near things they clearly could.
 */
const CRITTER_BODY_RADIUS = 0.16;

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function headingToward(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function turnToward(critter: Critter, targetHeading: number, delta: number) {
  const diff = wrapAngle(targetHeading - critter.heading);
  critter.heading += diff * Math.min(1, delta * TURN_RATE);
  critter.rig.group.rotation.y = critter.heading;
}

/**
 * Refresh the cached friendship value on a slow cadence. Friendship reads hit
 * the persisted game state, and doing that per critter per frame would be
 * wasteful for a number that changes a few times a session.
 */
function refreshFriendship(critter: Critter, elapsed: number) {
  if (elapsed - critter.friendshipCheckedAt < FRIENDSHIP_REFRESH_SECONDS) return;
  critter.friendshipCheckedAt = elapsed;
  critter.friendship = getBoldnessBoost(critter.id);
}

/**
 * Where this critter is currently centring its wandering.
 *
 * A stranger orbits its seeded home. As friendship grows, that centre drifts
 * toward the player, so a well-loved critter potters about near your feet
 * doing its idle business instead of keeping its distance. The drift is
 * clamped to MAX_FRIEND_DRIFT so critters stay on their own page: spawns are
 * deterministic per page, and a critter that followed you forever would both
 * depopulate the world and break that guarantee.
 */
function roamCenter(critter: Critter, avatarPosition: THREE.Vector3, out: THREE.Vector3) {
  const pull = critter.friendship;
  if (pull <= 0.01) return out.copy(critter.home);

  out.copy(critter.home);
  const toPlayerX = avatarPosition.x - critter.home.x;
  const toPlayerZ = avatarPosition.z - critter.home.z;
  const distance = Math.hypot(toPlayerX, toPlayerZ);
  if (distance < 0.001) return out;

  const drift = Math.min(distance, MAX_FRIEND_DRIFT) * pull;
  out.x += (toPlayerX / distance) * drift;
  out.z += (toPlayerZ / distance) * drift;
  return out;
}

const scratchCenter = new THREE.Vector3();

function enterIdle(critter: Critter, playerNearby = false) {
  critter.state = 'idle';
  critter.stateTime = 0;
  critter.idleAction = pickIdleAction(critter.species, critter.rng, {
    playerNearby,
    friendship: critter.friendship,
  });
  critter.idleDuration = idleActionDuration(critter.idleAction, critter.rng);
  critter.stateDuration = critter.idleDuration;
}

function pickWanderTarget(critter: Critter, avatarPosition: THREE.Vector3) {
  const center = roamCenter(critter, avatarPosition, scratchCenter);

  // Try a few directions and take the first dry one. Land animals do not
  // wade for fun, and a critter strolling through a pond is the tell that
  // nothing in the world knows the water is there.
  //
  // Bounded attempts rather than a loop until dry: a critter whose whole
  // range is underwater must still pick *something*, and the fallback below
  // walks it toward the nearest shore instead of freezing.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const angle = critter.rng() * Math.PI * 2;
    const distance = (0.3 + critter.rng() * 0.7) * critter.params.wanderRadius;
    const x = center.x + Math.sin(angle) * distance;
    const z = center.z + Math.cos(angle) * distance;
    if (!isInWater(x, z) && !isSolidAt(x, z, CRITTER_BODY_RADIUS)) {
      critter.target.set(x, 0, z);
      critter.detour = null;
      critter.state = 'wander';
      critter.stateTime = 0;
      return;
    }
  }

  // Everything nearby is wet. Head away from where we are, which climbs out
  // of a pond rather than milling about in the middle of it.
  const group = critter.rig.group;
  const awayX = group.position.x - center.x;
  const awayZ = group.position.z - center.z;
  const length = Math.hypot(awayX, awayZ) || 1;
  critter.target.set(
    group.position.x + (awayX / length) * critter.params.wanderRadius,
    0,
    group.position.z + (awayZ / length) * critter.params.wanderRadius,
  );
  critter.detour = null;
  critter.state = 'wander';
  critter.stateTime = 0;
}

/**
 * How far along an obstacle a single detour leg reaches, at most.
 *
 * Short on purpose. The critter re-evaluates on arrival, so a long wall is
 * walked as a series of short legs that hug it and cut the corner as soon as
 * the goal comes into view. One long committed leg overshoots the corner and
 * arcs out into open ground.
 */
const DETOUR_LEG = 3.2;

/**
 * How far ahead the *side* decision looks — much further than a single leg.
 *
 * Deciding which way round from one leg's worth of information makes both ends
 * of a long wall look identical, and the critter sets off the long way round
 * as often as not.
 */
const SIGHT_LEG = 9;

/** A detour leg is only worth taking if there's this much room to walk it. */
const MIN_DETOUR_LEG = 0.7;

/** Give up on a detour waypoint that hasn't been reached in this long. */
const DETOUR_TIMEOUT = 8;

/** How often a critter re-checks whether its goal is directly reachable. */
const PATH_CHECK_INTERVAL = 0.3;

/** Longest direct-path probe. Beyond this, walk and re-check on the way. */
const PATH_PROBE_MAX = 10;

/**
 * Beyond this distance from the player, critters stop steering around
 * obstacles and merely refuse to walk through them.
 *
 * Navigation quality nobody can see is not worth paying for, and the cost is
 * real — see the query-budget test. Up close a critter picks its way round the
 * house; across the meadow it bumps and re-targets, which at that distance is
 * indistinguishable from any other small animal changing its mind.
 */
const STEER_RANGE = 22;

/** Sampling step for "which way round?" probes. Coarse on purpose — see `clearRunFrom`. */
const SIGHT_STRIDE = 0.5;

/**
 * How far the path from (x, z) toward `heading` stays clear, up to `distance`.
 *
 * The default stride is fine enough that a tree trunk can't fall between two
 * samples. Callers only deciding *which way to go* pass a coarser one — that
 * choice tolerates a little imprecision, and these probes are the expensive
 * part of navigation.
 */
function clearRunFrom(x: number, z: number, heading: number, distance: number, stride = 0.25): number {
  const dx = -Math.sin(heading);
  const dz = -Math.cos(heading);
  for (let reach = stride; reach <= distance; reach += stride) {
    if (isCritterBlocked(x + dx * reach, z + dz * reach)) return reach - stride;
  }
  return distance;
}

function isCritterBlocked(x: number, z: number): boolean {
  return isSolidAt(x, z, CRITTER_BODY_RADIUS) || isDeepWater(x, z);
}

function clearRun(critter: Critter, heading: number, distance: number): number {
  const { x, z } = critter.rig.group.position;
  return clearRunFrom(x, z, heading, distance);
}

/** Can the goal be walked to from (x, z) in a straight line? */
function canSee(x: number, z: number, goalX: number, goalZ: number): boolean {
  const distance = Math.hypot(goalX - x, goalZ - z);
  if (distance < 0.01) return true;
  const reach = Math.min(distance, 12);
  return clearRunFrom(x, z, headingToward(x, z, goalX, goalZ), reach, SIGHT_STRIDE) >= reach - SIGHT_STRIDE;
}

/**
 * Pick a point to walk to that gets *around* whatever is in the way.
 *
 * Sidesteps along the obstacle — perpendicular to the blocked direction — and
 * takes whichever side first reaches a spot with a clear line to the goal.
 * That "can I see it from there?" test is what makes a critter take the *near*
 * end of a wall: measuring only how far each side is walkable makes both ends
 * of a long wall look identical, and the critter cheerfully sets off the long
 * way round.
 *
 * If neither side can see the goal, fall back to the side with more room —
 * making progress along an obstacle usually reveals a better option next time.
 *
 * `detourSign` breaks exact ties in favour of the side already chosen. In
 * practice line-of-sight nearly always decides first, so this is insurance
 * against perfectly symmetric obstacles rather than the main mechanism — but
 * it must stay *deterministic* either way: critter positions are never synced,
 * so two clients re-simulating the same critter have to route it identically.
 *
 * Returns null when both sides are walled in too.
 */
function pickDetour(
  critter: Critter,
  direct: number,
  goalX: number,
  goalZ: number,
  out: THREE.Vector3,
): THREE.Vector3 | null {
  const { x, z } = critter.rig.group.position;
  const first = critter.detourSign === 0 ? 1 : critter.detourSign;
  const stride = 1;

  let bestSign = 0;
  let bestReach = 0;
  let bestSees = false;

  for (const sign of [first, -first]) {
    const heading = direct + sign * (Math.PI / 2);
    const room = clearRunFrom(x, z, heading, SIGHT_LEG, SIGHT_STRIDE);
    if (room < MIN_DETOUR_LEG) continue;

    const dx = -Math.sin(heading);
    const dz = -Math.cos(heading);
    let sees = false;
    let reach = room;
    for (let probe = stride; probe <= room; probe += stride) {
      if (canSee(x + dx * probe, z + dz * probe, goalX, goalZ)) {
        sees = true;
        reach = probe;
        break;
      }
    }

    // A side that can see the goal always beats one that can't; between two
    // that can, the nearer corner wins. Strict comparisons keep ties with the
    // side already committed to.
    const better = bestSign === 0
      || (sees && !bestSees)
      || (sees === bestSees && (sees ? reach < bestReach : reach > bestReach));
    if (better) {
      bestSign = sign;
      bestReach = reach;
      bestSees = sees;
    }
  }
  if (bestSign === 0) return null;

  // Decide the side by what's visible far ahead, but only walk one short leg
  // of it before looking again.
  const heading = direct + bestSign * (Math.PI / 2);
  const leg = Math.min(bestReach, DETOUR_LEG);
  critter.detourSign = bestSign;
  critter.detourTime = DETOUR_TIMEOUT;
  return out.set(x - Math.sin(heading) * leg, 0, z - Math.cos(heading) * leg);
}

/**
 * Walk toward a goal, going *around* whatever is in the way.
 *
 * Sliding along an obstacle is fine for clipping a corner, but a critter whose
 * friend is standing on the far side of a wall just presses into it —
 * technically not passing through, visibly stuck.
 *
 * The fix is a committed waypoint, and the commitment is the whole trick. An
 * earlier version steered at a per-frame angle offset from the goal direction;
 * because that direction rotates as the critter moves, the offset rotated with
 * it and the critter span on the spot at exactly its turn rate. A waypoint is
 * fixed in world space, so walking toward it is stable — it either gets there
 * or the direct line opens up first.
 *
 * The waypoint is abandoned the moment the goal is directly reachable, so the
 * critter cuts the corner as soon as it rounds it rather than orbiting.
 *
 * Returns false only when it couldn't move at all — genuinely boxed in.
 */
function steerAround(
  critter: Critter,
  goalX: number,
  goalZ: number,
  step: number,
  delta: number,
): boolean {
  const group = critter.rig.group;
  const direct = headingToward(group.position.x, group.position.z, goalX, goalZ);
  const goalDistance = Math.hypot(goalX - group.position.x, goalZ - group.position.z);

  // Can the goal be walked to directly? Checked over the *whole* distance, not
  // just a lookahead: a clear first metre in front of a wall would otherwise
  // cancel the detour every frame and put the critter back into the wall.
  //
  // Throttled, and this is not a micro-optimisation. Each probe walks the page
  // registry — about 7µs — and a full path check is dozens of them. Run every
  // frame for every active critter that came to roughly 18ms per frame, which
  // is the *entire* 60fps budget: the world still rendered, but at single-digit
  // frame rates clicks land between frames and the game stops responding.
  // A few checks a second is plenty for an animal deciding which way to walk.
  critter.pathCooldown -= delta;
  if (critter.pathCooldown <= 0) {
    const probe = Math.min(goalDistance, PATH_PROBE_MAX);
    critter.pathBlocked = clearRun(critter, direct, probe) < probe - 0.01;
    // Staggered so a clearing full of critters doesn't re-check in lockstep on
    // the same frame.
    critter.pathCooldown = PATH_CHECK_INTERVAL * (0.75 + critter.params.animOffset * 0.1);
  }
  const directClear = !critter.pathBlocked;

  if (critter.detour) {
    critter.detourTime -= delta;
    const reached = Math.hypot(critter.detour.x - group.position.x, critter.detour.z - group.position.z) < 0.4;
    if (directClear || reached || critter.detourTime <= 0) critter.detour = null;
  }
  if (!critter.detour && !directClear) {
    critter.detour = pickDetour(critter, direct, goalX, goalZ, new THREE.Vector3());
  }

  const aimX = critter.detour ? critter.detour.x : goalX;
  const aimZ = critter.detour ? critter.detour.z : goalZ;
  turnToward(critter, headingToward(group.position.x, group.position.z, aimX, aimZ), delta);
  return tryStep(critter, -Math.sin(critter.heading) * step, -Math.cos(critter.heading) * step);
}

/**
 * Move by (dx, dz) if the destination is walkable, sliding along one axis
 * when the other is blocked. Returns false only when both axes are blocked.
 */
function tryStep(critter: Critter, dx: number, dz: number): boolean {
  const group = critter.rig.group;
  const moved = slideMove(
    group.position.x,
    group.position.z,
    dx,
    dz,
    isCritterBlocked,
  );
  const stayedPut = moved.x === group.position.x && moved.z === group.position.z;
  group.position.x = moved.x;
  group.position.z = moved.z;
  return !stayedPut;
}

/** Yaw offset toward the player in the critter's own local space, ±π. */
function lookAtOffset(critter: Critter, avatarPosition: THREE.Vector3) {
  const group = critter.rig.group;
  const toPlayer = headingToward(group.position.x, group.position.z, avatarPosition.x, avatarPosition.z);
  return wrapAngle(toPlayer - critter.heading);
}

function settleOnGround(critter: Critter, hopBoost = 0) {
  const { group } = critter.rig;
  // Land critters that end up in water stand *in* it, not on it. They avoid
  // water when choosing where to go (see pickWanderTarget), but a pond can
  // appear under a critter that was already there, and standing on the
  // surface reads as a bug rather than as a very confident squirrel.
  const wading = waterDepthAt(group.position.x, group.position.z) * WADE_SINK_RATIO;
  const standingHeight = bridgeDeckHeightAt(group.position.x, group.position.z)
    ?? sampleTerrainHeight(group.position.x, group.position.z);
  group.position.y = standingHeight
    + critter.rig.groundOffset * critter.params.scale
    + hopBoost
    - wading;
}

function updateGroundCritter(critter: Critter, delta: number, elapsed: number, avatarPosition: THREE.Vector3) {
  const { rig, params } = critter;
  const group = rig.group;
  const playerDistance = Math.hypot(avatarPosition.x - group.position.x, avatarPosition.z - group.position.z);
  critter.stateTime += delta;
  refreshFriendship(critter, elapsed);
  const playerNearby = playerDistance < critter.curiousRange;
  const engaged = engagedCritterId === critter.id;

  // Being spoken to outranks everything except a flourish already in flight
  // (petting from inside the dialogue), which is allowed to finish and then
  // returns here.
  if (engaged && critter.state !== 'flourish') {
    if (critter.state !== 'engaged') {
      critter.state = 'engaged';
      critter.stateTime = 0;
    }
  } else if (!engaged && critter.state === 'engaged') {
    // Conversation over: back to its own life.
    enterIdle(critter, playerNearby);
  }

  // Notice the player — but only on arrival, not continuously. Re-entering
  // `curious` every frame the player stands nearby is what pinned critters
  // into a permanent stare. `noticed` latches until they wander off again.
  if (
    playerNearby
    && !critter.noticed
    && critter.state !== 'curious'
    && critter.state !== 'flourish'
  ) {
    critter.state = 'curious';
    critter.stateTime = 0;
    critter.noticed = true;
  }
  if (!playerNearby && critter.noticed && playerDistance > critter.curiousRange + 1.3) {
    critter.noticed = false;
  }

  switch (critter.state) {
    case 'engaged': {
      // Face the player and hold. No wandering, no idle rotation, no
      // spontaneous flourishes — it is listening.
      turnToward(critter, headingToward(group.position.x, group.position.z, avatarPosition.x, avatarPosition.z), delta);
      settleOnGround(critter);
      rig.animate(elapsed, delta, false, 0, true);
      applyIdleAction('attentive', rig.parts, 0, elapsed, params.animOffset, 0);
      break;
    }

    case 'curious': {
      // Turn toward the player, acknowledge them — then get on with life.
      // Holding this pose indefinitely is what made a clearing full of
      // critters feel like a room full of mannequins watching you.
      turnToward(critter, headingToward(group.position.x, group.position.z, avatarPosition.x, avatarPosition.z), delta);
      // Bold critters shuffle a little closer; shy ones hold their ground.
      // Routed through `steerAround` so a critter greeting you from the far
      // side of a wall walks round it instead of pressing into it.
      if (params.shyness < 0.35 && playerDistance > 1.7) {
        steerAround(critter, avatarPosition.x, avatarPosition.z, params.speed * 0.35 * delta, delta);
      }
      settleOnGround(critter);
      rig.animate(elapsed, delta, false, 0, true);
      applyIdleAction(
        'glance-at-player',
        rig.parts,
        Math.min(critter.stateTime / CURIOUS_FACING_TIME, 1),
        elapsed,
        params.animOffset,
        lookAtOffset(critter, avatarPosition),
      );

      if (critter.stateTime >= CURIOUS_FACING_TIME || playerDistance > critter.curiousRange + 1.3) {
        enterIdle(critter, playerDistance < critter.curiousRange);
      }
      break;
    }

    case 'idle': {
      settleOnGround(critter);
      rig.animate(elapsed, delta, false, 0, playerNearby);
      applyIdleAction(
        critter.idleAction,
        rig.parts,
        critter.stateTime / critter.idleDuration,
        elapsed,
        params.animOffset,
        lookAtOffset(critter, avatarPosition),
      );

      if (critter.stateTime >= critter.stateDuration) {
        if (critter.rng() < FLOURISH_CHANCE) {
          critter.state = 'flourish';
          critter.stateTime = 0;
          critter.stateDuration = FLOURISH_DURATION;
        } else if (critter.rng() < 0.55) {
          // Often the next thing is simply another idle action. Critters that
          // relocate after every single beat look restless rather than calm.
          enterIdle(critter, playerNearby);
        } else {
          pickWanderTarget(critter, avatarPosition);
        }
      }
      break;
    }

    case 'wander': {
      // Steers round obstacles rather than merely refusing to pass through
      // them; `steerAround` owns both the turning and the step.
      const step = params.speed * delta;
      let moved: boolean;
      if (playerDistance > STEER_RANGE) {
        turnToward(critter, headingToward(group.position.x, group.position.z, critter.target.x, critter.target.z), delta);
        moved = tryStep(critter, -Math.sin(critter.heading) * step, -Math.cos(critter.heading) * step);
      } else {
        moved = steerAround(critter, critter.target.x, critter.target.z, step, delta);
      }
      if (!moved) {
        // Fully boxed in. Pick somewhere else rather than vibrating.
        pickWanderTarget(critter, avatarPosition);
        break;
      }

      critter.walkPhase += delta * params.speed * (rig.hopper ? 5.2 : 6.5);
      const hop = rig.hopper ? Math.abs(Math.sin(critter.walkPhase)) * rig.hopHeight * params.scale : 0;
      settleOnGround(critter, hop);
      rig.animate(elapsed, delta, true, 1, false);
      // Walking owns the body; unwind any pose the last idle action left.
      relaxToRest(rig.parts, Math.min(1, delta * 8));

      const remaining = Math.hypot(critter.target.x - group.position.x, critter.target.z - group.position.z);
      if (remaining < ARRIVE || critter.stateTime > 20) enterIdle(critter, playerNearby);
      break;
    }

    case 'flourish': {
      settleOnGround(critter);
      rig.flourish(Math.min(critter.stateTime / critter.stateDuration, 1), elapsed);
      if (critter.stateTime >= critter.stateDuration) {
        // Petting from inside the dialogue triggers a flourish. When it
        // finishes, go back to listening rather than wandering off mid-chat.
        if (engaged) {
          critter.state = 'engaged';
          critter.stateTime = 0;
        } else {
          enterIdle(critter, playerNearby);
        }
      }
      break;
    }
  }
}

function updateFlyingCritter(critter: Critter, delta: number, elapsed: number, avatarPosition: THREE.Vector3) {
  const { rig, params } = critter;
  const group = rig.group;
  critter.stateTime += delta;

  const playerDistance = group.position.distanceTo(avatarPosition);
  // A butterfly cannot stand still and listen — hovering is its whole idle.
  // Being spoken to instead pins its curiosity high, so it holds station
  // close to the player rather than drifting off mid-conversation.
  const engaged = engagedCritterId === critter.id;
  const curiosity = engaged
    ? 1
    : THREE.MathUtils.clamp(1 - playerDistance / critter.curiousRange, 0, 1) * (1 - params.shyness * 0.5);

  // Flyers drift in a lazy orbit around home, leaning toward a nearby player.
  const t = elapsed * (0.6 + params.speed * 0.2) + params.animOffset;
  const centerX = THREE.MathUtils.lerp(critter.home.x, avatarPosition.x + 0.25, curiosity * 0.32);
  const centerZ = THREE.MathUtils.lerp(critter.home.z, avatarPosition.z - 0.15, curiosity * 0.32);
  const orbit = engaged ? 0.45 : 1;
  const spanX = (Math.min(params.wanderRadius * 0.4, 2.4) - curiosity * 0.4) * orbit;
  const spanZ = (Math.min(params.wanderRadius * 0.32, 1.9) - curiosity * 0.3) * orbit;
  const x = centerX + Math.cos(t) * spanX;
  const z = centerZ + Math.sin(t * 1.27) * spanZ;
  const y = sampleTerrainHeight(x, z)
    + rig.groundOffset * params.scale
    + Math.sin(elapsed * 2.7 + params.animOffset) * 0.2
    + curiosity * 0.24;

  const previous = group.position.clone();
  group.position.set(x, y, z);
  const movement = group.position.clone().sub(previous);
  if (movement.lengthSq() > 0.0001) {
    group.rotation.y = Math.atan2(movement.x, movement.z);
  }

  rig.animate(elapsed, delta, true, 1, curiosity > 0.1);
}

/**
 * Make a ground critter do its flourish right now (petting response),
 * turning to face someone first if given a position. Flyers keep flying —
 * their joy is expressed in hearts alone.
 */
export function triggerFlourish(critter: Critter, facePosition?: THREE.Vector3): boolean {
  if (critter.rig.flying) return false;
  if (facePosition) {
    const group = critter.rig.group;
    critter.heading = headingToward(group.position.x, group.position.z, facePosition.x, facePosition.z);
    group.rotation.y = critter.heading;
  }
  critter.state = 'flourish';
  critter.stateTime = 0;
  critter.stateDuration = FLOURISH_DURATION;
  return true;
}

export function updateCritter(critter: Critter, delta: number, elapsed: number, avatarPosition: THREE.Vector3) {
  if (critter.rig.flying) {
    updateFlyingCritter(critter, delta, elapsed, avatarPosition);
  } else {
    updateGroundCritter(critter, delta, elapsed, avatarPosition);
  }
}
