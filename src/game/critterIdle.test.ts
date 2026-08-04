import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/math';
import type { CritterParts } from './critterRigs';
import { IDLE_ACTIONS, applyIdleAction, idleActionDuration, pickIdleAction, relaxToRest } from './critterIdle';

/** A stand-in rig with the same non-uniform body scale a real squirrel has. */
function makeParts(): CritterParts {
  const head = new THREE.Group();
  const body = new THREE.Mesh();
  body.scale.set(0.6, 0.7, 1.08);
  const ear = new THREE.Object3D();
  ear.rotation.set(0.08, -0.25, 0.18);

  return {
    head,
    body,
    tail: null,
    ears: [ear],
    rest: {
      head: { x: 0, y: 0, z: 0 },
      ears: [{ x: 0.08, y: -0.25, z: 0.18 }],
      body: { scaleX: 0.6, scaleY: 0.7, scaleZ: 1.08, rotationX: 0 },
    },
  };
}

describe('critter idle actions', () => {
  it('is deterministic for the same seed', () => {
    const a = pickIdleAction('squirrel', createRng(1234), { playerNearby: false, friendship: 0 });
    const b = pickIdleAction('squirrel', createRng(1234), { playerNearby: false, friendship: 0 });
    expect(a).toBe(b);
  });

  it('only picks actions the species actually has', () => {
    const rng = createRng(99);
    for (let i = 0; i < 200; i += 1) {
      const action = pickIdleAction('cat', rng, { playerNearby: false, friendship: 0 });
      // The cat pool deliberately excludes twitchy bird behaviour.
      expect(action).not.toBe('shake-off');
      expect(IDLE_ACTIONS[action]).toBeDefined();
    }
  });

  it('glances at the player more often as friendship grows', () => {
    const count = (friendship: number) => {
      const rng = createRng(7);
      let glances = 0;
      for (let i = 0; i < 400; i += 1) {
        if (pickIdleAction('squirrel', rng, { playerNearby: true, friendship }) === 'glance-at-player') {
          glances += 1;
        }
      }
      return glances;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });

  it('never glances when the player is away', () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i += 1) {
      expect(pickIdleAction('bunny', rng, { playerNearby: false, friendship: 1 }))
        .not.toBe('glance-at-player');
    }
  });

  it('breathes relative to the rest scale instead of resetting it', () => {
    const parts = makeParts();
    // Regression: an earlier version assigned `scale.y = 1 + wobble`, which
    // inflated the squirrel's 0.7-scaled body into a different animal.
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      applyIdleAction('settle', parts, progress, progress * 10, 0, 0);
      expect(parts.body!.scale.y).toBeGreaterThan(0.6);
      expect(parts.body!.scale.y).toBeLessThan(0.8);
      expect(parts.body!.scale.x).toBeCloseTo(0.6, 5);
      expect(parts.body!.scale.z).toBeCloseTo(1.08, 5);
    }
  });

  it('starts and ends every chained action at the rest pose', () => {
    // This invariant is what lets one action follow another without a visible
    // snap. `attentive` is the deliberate exception: it is *held* for as long
    // as a conversation is open and exited explicitly, never chained, so it
    // must not decay back to rest. Its own contract is covered separately.
    const chained = (Object.keys(IDLE_ACTIONS) as Array<keyof typeof IDLE_ACTIONS>)
      .filter((id) => id !== 'attentive');

    const parts = makeParts();
    for (const id of chained) {
      applyIdleAction(id, parts, 0, 0, 0, 0.5);
      expect(parts.head!.rotation.x).toBeCloseTo(0, 4);
      expect(parts.head!.rotation.y).toBeCloseTo(0, 4);

      applyIdleAction(id, parts, 1, 0, 0, 0.5);
      expect(parts.head!.rotation.x).toBeCloseTo(0, 4);
    }
  });

  it('relaxes ears and body back to their captured rest values', () => {
    const parts = makeParts();
    applyIdleAction('ear-swivel', parts, 0.5, 0, 0, 0);
    expect(parts.ears[0].rotation.z).not.toBeCloseTo(0.18, 3);

    for (let i = 0; i < 200; i += 1) relaxToRest(parts, 0.4);
    expect(parts.ears[0].rotation.z).toBeCloseTo(0.18, 4);
    expect(parts.ears[0].rotation.x).toBeCloseTo(0.08, 4);
    expect(parts.body!.scale.y).toBeCloseTo(0.7, 4);
    expect(parts.body!.scale.z).toBeCloseTo(1.08, 4);
  });

  it('never picks the attentive pose at random', () => {
    // `attentive` is held for as long as a conversation is open. It is
    // driven directly by the engaged state, and a critter dropping into it
    // spontaneously would look like it was staring at nothing.
    const rng = createRng(11);
    for (const species of ['squirrel', 'raccoon', 'bunny', 'bird', 'cat', 'woodchuck', 'butterfly'] as const) {
      for (let i = 0; i < 150; i += 1) {
        expect(pickIdleAction(species, rng, { playerNearby: true, friendship: 1 }))
          .not.toBe('attentive');
      }
    }
  });

  it('holds the attentive pose steady rather than easing in and out', () => {
    // Every other action arcs back to rest so it can end. This one must not:
    // a conversation lasts as long as the player reads, and a pose that
    // decayed would drift out of attention mid-sentence.
    const parts = makeParts();

    applyIdleAction('attentive', parts, 0, 4, 0, 0);
    const atStart = parts.head!.rotation.x;
    applyIdleAction('attentive', parts, 1, 4, 0, 0);
    const atEnd = parts.head!.rotation.x;

    expect(atEnd).toBeCloseTo(atStart, 6);
    // ...and it is actually looking up at the player, not sitting at rest.
    expect(atStart).toBeLessThan(0);
  });

  it('draws durations inside each action range', () => {
    const rng = createRng(42);
    for (const id of Object.keys(IDLE_ACTIONS) as Array<keyof typeof IDLE_ACTIONS>) {
      const [min, max] = IDLE_ACTIONS[id].duration;
      const duration = idleActionDuration(id, rng);
      expect(duration).toBeGreaterThanOrEqual(min);
      expect(duration).toBeLessThanOrEqual(max);
    }
  });
});
