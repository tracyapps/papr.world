import * as THREE from 'three';
import { getGameState, onGameStateChanged } from '../sim/state';
import { getPlace, HOME_PLACE_ID, onPlacesChanged } from '../world/places';
import { homeFacing, homePosition, isNearHome } from '../world/homeSite';
import { sampleTerrainHeight } from '../world/terrain';
import { registerMapFeature, updateMapFeaturePosition } from '../world/mapFeatures';
import { getSelfName } from '../net/sharedSession';
import { animalDesigns } from './mailbox/designs.animals';
import { objectDesigns } from './mailbox/designs.objects';
import type { MailboxDesign, MailboxInstance } from './mailbox/kit';

/**
 * The player's own mailbox, standing beside the home exterior
 * (game/dwellingExterior.ts) with whatever rig and team colors they picked
 * in the Home panel (game/homePanel.ts). Every design animates continuously
 * (a waving flag, a wagging tail…), unlike the house, so this owns a real
 * per-frame tick rather than only rebuilding on state change.
 *
 * Ported rigs: game/mailbox/{kit,designs.animals,designs.objects}.ts, from
 * designs/3d-Mailbox-Designs.
 */

const DESIGNS: MailboxDesign[] = [...objectDesigns, ...animalDesigns];
const DESIGN_BY_ID = new Map(DESIGNS.map((design) => [design.id, design]));
const DEFAULT_DESIGN = DESIGNS[0];

/** Offset from the home spot, in the exterior's own local (unrotated) space —
 *  the same space dwellingExterior.ts positions its owner sign in, opposite
 *  side of the doorstep so the two never overlap. */
const MAILBOX_LOCAL = { x: 1.75, z: 1.1 };

/** The height the design lab points a visitor's gaze at (mailbox-lab.html's
 *  gazePlane): eye level for the little rigs, not the ground. */
const EYE_HEIGHT = 0.8;

/** How close the avatar must be for a design with eyes to actually look back. */
const LOOK_REACH = 5;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

let root: THREE.Group | null = null;
let instance: MailboxInstance | null = null;
let built = '';
const scratchLook = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function homePlace(): { x: number; z: number } {
  const place = getPlace(HOME_PLACE_ID);
  return place ? { x: place.x, z: place.z } : { x: -1.5, z: -2.2 };
}

function mailboxLook() {
  return getGameState().world.mailboxLook;
}

/** Whether anything is waiting in the inbox that hasn't been opened yet — the
 *  physical trigger a "message" reaction (a raised flag, a lit window…) reads. */
function hasUnclaimedMail(): boolean {
  const player = getGameState().player;
  return player.mailbox.some((mail) => !player.claimedMailIds.includes(mail.id));
}

function signature(): string {
  const look = mailboxLook();
  return `${look.style}|${look.primary}|${look.secondary}|${getSelfName()}`;
}

function disposeInstance() {
  if (!root || !instance) return;
  root.remove(instance.root);
  instance.dispose();
  instance = null;
}

function redraw() {
  if (!root) return;
  const sig = signature();
  if (sig === built) return;
  built = sig;
  disposeInstance();
  const look = mailboxLook();
  const design: MailboxDesign = DESIGN_BY_ID.get(look.style) ?? DEFAULT_DESIGN;
  instance = design.build({
    name: getSelfName(),
    team: { primary: look.primary, secondary: look.secondary },
    reduced: reducedMotion,
  });
  instance.root.position.set(MAILBOX_LOCAL.x, 0, MAILBOX_LOCAL.z);
  root.add(instance.root);
}

/** A lot move changes no rig or color, so it must not depend on the drawn
 *  signature — mirrors dwellingExterior.ts's syncPosition. */
function syncPosition() {
  if (!root) return;
  const spot = homePosition(homePlace());
  root.position.set(spot.x, sampleTerrainHeight(spot.x, spot.z), spot.z);
  root.rotation.y = homeFacing();
  updateMapFeaturePosition('home-mailbox', spot.x, spot.z);
}

export function buildMailboxExterior(parent: THREE.Group): void {
  const spot = homePosition(homePlace());
  root = new THREE.Group();
  root.name = 'home-mailbox';
  root.position.set(spot.x, sampleTerrainHeight(spot.x, spot.z), spot.z);
  root.rotation.y = homeFacing();
  parent.add(root);
  registerMapFeature({
    id: 'home-mailbox',
    kind: 'landmark',
    x: spot.x,
    z: spot.z,
    radiusX: 0.2,
    radiusZ: 0.2,
    color: '#8a5a35',
    shape: 'circle',
  });
  built = '';
  redraw();
  onGameStateChanged(redraw);
  onPlacesChanged(syncPosition);
}

/** Mirrors dwellingExterior.ts's `isNearHomeExterior` — the mailbox stands
 *  right beside the same Home place, so the same reach applies. */
export function isNearMailboxExterior(position: { x: number; z: number }): boolean {
  return isNearHome(position, homePlace());
}

/** True when the pointer is over the player's own mailbox — the click that
 *  opens its messages/friends/mail-order panel (game/mailboxPanel.ts). */
export function isMailboxAtScreen(clientX: number, clientY: number, camera: THREE.Camera): boolean {
  if (!root || !instance || root.parent?.visible === false) return false;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(instance.root, true).length > 0;
}

/** Called every outdoor frame (see main.ts's animate()), same as updateCritters etc. */
export function updateMailboxExterior(delta: number, elapsed: number, avatarPosition: { x: number; z: number }): void {
  if (!root || !instance) return;
  const dx = avatarPosition.x - root.position.x;
  const dz = avatarPosition.z - root.position.z;
  const near = dx * dx + dz * dz < LOOK_REACH * LOOK_REACH;
  let look: THREE.Vector3 | null = null;
  if (near) {
    root.updateMatrixWorld();
    scratchLook.set(avatarPosition.x, EYE_HEIGHT, avatarPosition.z);
    instance.root.worldToLocal(scratchLook);
    look = scratchLook;
  }
  instance.tick(elapsed, delta, { message: hasUnclaimedMail(), look, reduced: reducedMotion });
}
