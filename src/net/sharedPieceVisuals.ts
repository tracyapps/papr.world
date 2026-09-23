import * as THREE from 'three';
import type { PlacedPiece } from '../../shared/src/index';
import { scene } from '../render/context';
import { registerCasePiece, unregisterCasePiece } from '../game/cases';
import { getSelfAccount } from '../game/guests';
import { interiorScene } from '../game/interiorScene';
import { getGameState } from '../sim/state';
import { buildPlacedPieceVisual } from '../world/buildPieceVisuals';
import { sampleTerrainHeight } from '../world/terrain';

const root = new THREE.Group();
root.name = 'shared-surface-pieces';
const interiorRoot = new THREE.Group();
interiorRoot.name = 'shared-interior-pieces';
const visuals = new Map<string, { piece: PlacedPiece; group: THREE.Group }>();
let interiorOwner: string | null = null;

/**
 * Once a server echo of one of OUR OWN pieces has been matched to the local
 * piece standing in for it, that pairing (shared piece id -> local piece id)
 * is remembered here for as long as the local piece exists.
 *
 * Why this exists: the server has no "move" or "restyle" message (see
 * placement.ts), so a local carry/restyle only ever updates this device's
 * own save -- the shared echo the server keeps sending back still describes
 * wherever the piece ORIGINALLY stood. `hasLocalEquivalent` used to match
 * purely by re-comparing position on every call, which worked at build time
 * but silently broke the moment the local piece moved: the echo no longer
 * matched anything, so the next unrelated sync (someone else placing
 * something, say) would un-hide it right where the piece used to be --
 * "it reappeared in the old spot when I wasn't looking" (2026-09-22). Once
 * matched, this map keeps the echo hidden by the pairing itself rather than
 * by re-deriving it, so a later move can never un-hide it again.
 */
const matchedLocalIds = new Map<string, string>();

export function initializeSharedPieceVisuals(): void {
  if (!root.parent) scene.add(root);
  if (!interiorRoot.parent) interiorScene.add(interiorRoot);
}

export function addSharedPiece(piece: PlacedPiece): void {
  removeSharedPiece(piece.id);
  const group = buildPlacedPieceVisual(piece);
  const indoors = Boolean(piece.home);
  group.position.set(piece.x, indoors ? 0.01 : sampleTerrainHeight(piece.x, piece.z) + 0.01, piece.z);
  (indoors ? interiorRoot : root).add(group);
  visuals.set(piece.id, { piece, group });
  registerCasePiece(piece);
  syncSharedPieceVisibility();
}

export function removeSharedPiece(id: string): void {
  const visual = visuals.get(id);
  if (!visual) return;
  visual.group.removeFromParent();
  visuals.delete(id);
  unregisterCasePiece(id);
  matchedLocalIds.delete(id);
}

/** Hide the server echo of a piece already represented by this device's solo save. */
export function syncSharedPieceVisibility(): void {
  for (const { piece, group } of visuals.values()) {
    const inVisibleScene = piece.home ? piece.home === interiorOwner : interiorOwner === null;
    group.visible = inVisibleScene && !hasLocalEquivalent(piece);
  }
}

/** Select which home's server-owned furniture the interior scene draws.
 * `null` means the player is back outside. */
export function setSharedPieceInteriorOwner(accountId: string | null): void {
  interiorOwner = accountId;
  syncSharedPieceVisibility();
}

/** The group drawing a piece the neighborhood knows about (hidden when this device draws its own copy). */
export function getSharedPieceVisual(id: string): THREE.Object3D | null {
  return visuals.get(id)?.group ?? null;
}

export function sharedPieceCount(): number {
  return visuals.size;
}

/**
 * How many pieces this account has placed on a given page — the player
 * card's "made N things on this page" credit (avatar-and-identity.md §3).
 * "This page" means wherever the card was opened FROM, i.e. the viewer's own
 * current page, not a stale copy of the maker's — see the card module for
 * why that's the right page to ask about.
 */
export function countMakerPiecesOnPage(accountId: string, page: string): number {
  let count = 0;
  for (const { piece } of visuals.values()) {
    if (piece.makerId === accountId && piece.page === page) count += 1;
  }
  return count;
}

function hasLocalEquivalent(target: PlacedPiece): boolean {
  // A visitor's own save also uses `in:home:0,0`; it must never hide a host's
  // chair merely because both people put the same chair at the same coordinates.
  if (target.makerId !== getSelfAccount()) return false;

  const remembered = matchedLocalIds.get(target.id);
  if (remembered !== undefined) {
    for (const page of Object.values(getGameState().world.pages)) {
      if (remembered in page.placedPieces) return true;
    }
    // The local piece this echo stood in for is gone (picked back up, or
    // never existed on this device to begin with) -- forget the pairing so
    // a fresh position match can be tried below like normal.
    matchedLocalIds.delete(target.id);
  }

  for (const page of Object.values(getGameState().world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      if (
        piece.templateKey === target.templateKey
        && Math.abs(piece.x - target.x) < 0.01
        && Math.abs(piece.z - target.z) < 0.01
        && Math.abs(piece.rotY - target.rotY) < 0.01
      ) {
        matchedLocalIds.set(target.id, piece.id);
        return true;
      }
    }
  }
  return false;
}
