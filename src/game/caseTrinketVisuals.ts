import * as THREE from 'three';
import { getTrinketDef } from '../sim/catalogs/trinkets';
import { onGameStateChanged } from '../sim/state';
import { buildTrinketRig } from './trinketRigs';
import { getPlacedPieceVisual } from './placedPieceInteractions';
import { listCases, subscribeCases, type CaseView } from './cases';
import { getSharedPieceVisual } from '../net/sharedPieceVisuals';
import { RESOURCE_DEFS } from '../world/resources';
import { getMaterial } from '../render/materials';

/**
 * The contents visible inside a display case: purely decorative children of
 * the case's own rendered group, sitting on its two shelves (see
 * `buildDisplayCase` in world/buildPieceVisuals.ts for the shelf heights
 * these offsets line up with).
 *
 * Unlike free-standing trinkets (trinketVisuals.ts) these never move on
 * their own -- they are parented straight to the case's Object3D, so they
 * inherit its position, rotation and visibility for free, and a rebuild
 * only has to happen when a case's contents change, or when the object
 * representing the case itself is replaced (a page refresh after a move,
 * say). Nothing here runs per frame.
 *
 * Both keepsakes and stocked goods occupy slots, matching the panel.
 */

const SLOT_OFFSETS: readonly [number, number, number][] = [
  [-0.42, 0.40, -0.06], [-0.14, 0.40, -0.06], [0.14, 0.40, -0.06], [0.42, 0.40, -0.06],
  [-0.42, 0.72, -0.06], [-0.14, 0.72, -0.06], [0.14, 0.72, -0.06], [0.42, 0.72, -0.06],
];
// These rigs are naturally tiny; at half size they disappeared behind the
// frame and glass at normal camera distance.
const TRINKET_SCALE = 1.5;

type AnchoredSlots = { anchor: THREE.Object3D; group: THREE.Group; signature: string };

const anchored = new Map<string, AnchoredSlots>();

function disposeGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

/** Whichever object is actually rendering this case right now. A case you
 * built always has a local piece (see cases.ts); one a neighbor built and
 * shared has only the server-echoed copy. When -- unusually -- both exist,
 * the local one wins, matching what `hasLocalEquivalent` already decided is
 * visible (sharedPieceVisuals.ts). */
function anchorFor(view: CaseView): THREE.Object3D | null {
  return getPlacedPieceVisual(view.handle.id) ?? getSharedPieceVisual(view.handle.id);
}

function signatureFor(view: CaseView): string {
  return JSON.stringify(view.items);
}

function buildSlotGroup(view: CaseView): THREE.Group {
  const slots = new THREE.Group();
  slots.name = 'case-trinkets';
  view.items.slice(0, SLOT_OFFSETS.length).forEach((item, index) => {
    const [x, y, z] = SLOT_OFFSETS[index];
    if (item.kind === 'trinket') {
      const def = getTrinketDef(item.defId);
      if (!def) return;
      const rig = buildTrinketRig(def, item.seed);
      rig.scale.setScalar(TRINKET_SCALE);
      rig.position.set(x, y, z);
      slots.add(rig);
      return;
    }
    // Shared free cases hold resources, tools, and ordinary items. They do
    // not have individual world rigs, so a small paper parcel represents
    // each occupied slot, with the resource's own paper when available.
    const material = item.kind === 'resource'
      ? getMaterial(RESOURCE_DEFS[item.itemId as keyof typeof RESOURCE_DEFS]?.material ?? 'paper.cork')
      : getMaterial(item.kind === 'tool' ? 'paper.grey' : 'paper.salmon');
    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.16), material);
    parcel.name = `case-item-${item.kind}`;
    parcel.position.set(x, y + 0.065, z);
    parcel.castShadow = true;
    slots.add(parcel);
  });
  return slots;
}

/** Rebuild whatever needs it to match the current cases. Idempotent, and
 * cheap when nothing changed -- every case is skipped unless its trinket
 * signature or its anchor object has actually changed since last time. */
export function syncCaseTrinketVisuals(): void {
  const views = listCases();
  const liveKeys = new Set(views.map((view) => view.handle.key));

  for (const [key, entry] of anchored) {
    if (liveKeys.has(key)) continue;
    entry.anchor.remove(entry.group);
    disposeGroup(entry.group);
    anchored.delete(key);
  }

  for (const view of views) {
    const anchor = anchorFor(view);
    const signature = signatureFor(view);
    const existing = anchored.get(view.handle.key);

    if (!anchor || !signature) {
      if (existing) {
        existing.anchor.remove(existing.group);
        disposeGroup(existing.group);
        anchored.delete(view.handle.key);
      }
      continue;
    }

    if (existing && existing.anchor === anchor && existing.signature === signature) continue;

    if (existing) {
      existing.anchor.remove(existing.group);
      disposeGroup(existing.group);
    }

    const group = buildSlotGroup(view);
    anchor.add(group);
    anchored.set(view.handle.key, { anchor, group, signature });
  }
}

/** Wire the visuals to the case data and the save. Call once at boot. */
export function initializeCaseTrinketVisuals(): void {
  syncCaseTrinketVisuals();
  subscribeCases(syncCaseTrinketVisuals);
  onGameStateChanged(syncCaseTrinketVisuals);
}
