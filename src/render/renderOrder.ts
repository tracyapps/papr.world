// Draw order for transparent objects.
//
// Three.js renders opaque objects first, then transparent ones sorted by
// `renderOrder` ascending. Within the transparent pass, an object that draws
// later paints over an earlier one **regardless of depth** whenever the
// earlier one did not write to the depth buffer.
//
// The avatar is `transparent: true, depthWrite: false` — it has to be, so the
// cutout can fade out when the camera zooms into first person. It therefore
// never writes depth, and it sits at the default `renderOrder` of 0. Any
// transparent thing with a positive render order will draw straight over the
// player.
//
// That is exactly what happened when biome ground overlays were given
// a positive render order on flat sheets: ground lying *in front of*
// the paper potato.
//
// The rule: **anything that lies on the ground belongs below zero.** World
// objects that stand up in the scene keep the default 0 and sort by depth
// against each other. Effects that are meant to read on top of everything
// (floating hearts) go above.
//
// Ordering within the ground band matters too — soil is under water, water is
// under its own ripples — so the values are spaced rather than adjacent.

export const RENDER_ORDER = {
  /** Sky dome: behind literally everything. */
  sky: -100,
  /** Parallax backdrop rings, far to near. */
  backdropFar: -14,
  backdropMid: -12,
  backdropNear: -10,
  cloudsHigh: -9,
  cloudsLow: -8,

  // --- The ground band ---------------------------------------------------
  // All below zero so they can never paint over the avatar or any critter.
  /** Blended biome ground sheets. `+ layer` keeps them ordered internally. */
  biomeOverlay: -6,
  /** Water surface: over the ground, under everything standing in it. */
  water: -3,
  /** Ripples spreading from wading feet: over the water they belong to. */
  ripple: -2,
  /** Planting overlay rings drawn flat on the ground. */
  gardenRing: -1,
  /** The guidance arrow, also a flat sheet lying on the ground. */
  guidanceArrow: -1,

  /** Default for world objects that stand up. Left implicit; here for reference. */
  world: 0,

  /** Deliberately on top of the world: celebratory effects. */
  hearts: 30,
} as const;
