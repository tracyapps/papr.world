import * as THREE from 'three';
import {
  DESIGN_CUTOUT,
  DESIGN_GROUND_Y,
  DESIGN_SHEET,
  sanitizeAvatarDesign,
  type AvatarDesign,
  type PlayerState,
} from '../../shared/src/index';
import { camera, scene, textureLoader } from '../render/context';
import { rasterizeAvatarDesignTexture } from '../game/avatarLook';
import { bridgeDeckHeightAt } from '../world/water';
import { sampleTerrainHeight } from '../world/terrain';
import type { RemoteSample } from './remotePlayers';

const CUTOUT_WORLD_HEIGHT = 1.55;
const SHEET_UNIT = CUTOUT_WORLD_HEIGHT / DESIGN_CUTOUT.height;
const PLANE_WIDTH = DESIGN_SHEET.width * SHEET_UNIT;
const PLANE_HEIGHT = DESIGN_SHEET.height * SHEET_UNIT;
const CENTER_Y = 0.06 + (DESIGN_GROUND_Y - DESIGN_SHEET.height / 2) * SHEET_UNIT;
const MAX_VISIBLE_DISTANCE = 42;

type RemoteVisual = {
  root: THREE.Group;
  cutout: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
  /** The design this visual is showing (or fetching) — '' while on fallback. */
  drawingKey: string;
  /** Durable account id — the player card asks about this, not the session id. */
  accountId: string;
  name: string;
};

const root = new THREE.Group();
root.name = 'shared-players';
const visuals = new Map<string, RemoteVisual>();

const placeholder = textureLoader.load('/assets/runtime/avatars/avatar_placeholder_flat_01.png');
placeholder.colorSpace = THREE.SRGBColorSpace;

/**
 * HTTP origin serving `/avatar-designs/:id` — set when a shared session
 * opens, because that is the only time other players' avatars exist at all.
 */
let designEndpoint: string | null = null;

export function configureRemoteDesigns(httpEndpoint: string): void {
  designEndpoint = httpEndpoint.replace(/\/$/, '');
}

/**
 * Fetched-and-rasterized worn designs, keyed by design id. A room of players
 * sharing a look shares one texture; a failed fetch resolves null and keeps
 * the tinted placeholder — recognizable at a glance is the floor, not a
 * promise the network will always cooperate.
 */
const designTextures = new Map<string, Promise<THREE.CanvasTexture | null>>();

/**
 * The one place that fetches `/avatar-designs/:id` and validates the answer.
 * Public because the player card wants the same raw design (to draw a flat
 * SVG preview) without paying for a texture it will never put in the scene —
 * see docs/avatar-and-identity.md §6.8, "only the worn design is ever a live
 * texture per player".
 */
export async function fetchDesignJson(designId: string): Promise<AvatarDesign | null> {
  try {
    if (!designEndpoint || !/^[A-Za-z0-9-]{1,64}$/.test(designId)) return null;
    const response = await fetch(`${designEndpoint}/avatar-designs/${designId}`);
    if (!response.ok) return null;
    const body = await response.json() as { design?: unknown };
    const design = sanitizeAvatarDesign(body.design);
    // The id on the wire must name the design it claims — anything else is a
    // confused or hostile response, and the fallback answers it.
    return design && design.id === designId ? design : null;
  } catch {
    return null;
  }
}

function fetchDesignTexture(designId: string): Promise<THREE.CanvasTexture | null> {
  const cached = designTextures.get(designId);
  if (cached) return cached;
  const pending = fetchDesignJson(designId).then((design) => (
    design ? rasterizeAvatarDesignTexture(design) : null
  ));
  designTextures.set(designId, pending);
  return pending;
}

export function initializeRemoteAvatarVisuals(): void {
  if (!root.parent) scene.add(root);
}

export function addRemoteAvatar(player: PlayerState): void {
  removeRemoteAvatar(player.id);

  const host = new THREE.Group();
  host.name = `shared-player:${player.id}`;

  const material = new THREE.MeshStandardMaterial({
    alphaTest: 0.03,
    color: player.avatar.edgeColor,
    depthWrite: false,
    map: placeholder,
    metalness: 0,
    roughness: 0.94,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const cutout = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT), material);
  cutout.castShadow = true;
  cutout.position.y = CENTER_Y;
  const label = makeNameLabel(player.name);
  host.add(cutout, label);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 24),
    new THREE.MeshBasicMaterial({
      color: '#3d352d',
      depthWrite: false,
      opacity: 0.14,
      transparent: true,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  host.add(shadow);

  root.add(host);
  const drawingKey = player.avatar.drawingKey;
  visuals.set(player.id, {
    root: host, cutout, label, drawingKey, accountId: player.accountId, name: player.name,
  });

  // Phase D: the room already resolved this key against the wearer's account,
  // so fetch the art and let it land whenever it lands — the tinted cutout
  // stands in until then, and forever if the fetch fails.
  if (drawingKey) {
    void fetchDesignTexture(drawingKey).then((texture) => {
      const current = visuals.get(player.id);
      if (!texture || !current || current.drawingKey !== drawingKey) return;
      current.cutout.material.map = texture;
      // The map carries the whole look; the tint was only for the placeholder.
      current.cutout.material.color.set('#ffffff');
      current.cutout.material.needsUpdate = true;
    });
  }
}

export function removeRemoteAvatar(id: string): void {
  const visual = visuals.get(id);
  if (!visual) return;
  visual.root.removeFromParent();
  visual.cutout.geometry.dispose();
  visual.cutout.material.dispose();
  visual.label.material.map?.dispose();
  visual.label.material.dispose();
  visuals.delete(id);
}

export function clearRemoteAvatars(): void {
  for (const id of [...visuals.keys()]) removeRemoteAvatar(id);
  // Design textures are shared across players; only tearing the session down
  // ends their audience.
  for (const pending of designTextures.values()) {
    void pending.then((texture) => texture?.dispose());
  }
  designTextures.clear();
}

export function updateRemoteAvatar(
  id: string,
  sample: RemoteSample,
  localPosition: THREE.Vector3,
): void {
  const visual = visuals.get(id);
  if (!visual) return;
  const distance = Math.hypot(sample.x - localPosition.x, sample.z - localPosition.z);
  visual.root.visible = distance <= MAX_VISIBLE_DISTANCE;
  if (!visual.root.visible) return;

  const ground = bridgeDeckHeightAt(sample.x, sample.z) ?? sampleTerrainHeight(sample.x, sample.z);
  visual.root.position.set(sample.x, ground, sample.z);
  visual.cutout.lookAt(camera.position.x, ground + CENTER_Y, camera.position.z);
}

export function remoteAvatarCount(): number {
  return visuals.size;
}

export type RemoteAvatarHit = { accountId: string; name: string; drawingKey: string };

const pickRaycaster = new THREE.Raycaster();
const pickNdc = new THREE.Vector2();

/**
 * The remote player under a screen point, for the player-card entry point
 * (avatar-and-identity.md §3, "clicking a player in-world"). Exact raycast
 * only — cutouts are person-sized and easy to hit, unlike a wandering
 * critter, so no near-miss slop is needed.
 */
export function pickRemoteAvatarAtScreen(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
): RemoteAvatarHit | null {
  pickNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  pickRaycaster.setFromCamera(pickNdc, camera);

  const visibleHosts = [...visuals.values()].filter((visual) => visual.root.visible);
  const hits = pickRaycaster.intersectObjects(visibleHosts.map((visual) => visual.root), true);
  if (hits.length === 0) return null;

  let node: THREE.Object3D | null = hits[0].object;
  while (node) {
    const owner = visibleHosts.find((visual) => visual.root === node);
    if (owner) return { accountId: owner.accountId, name: owner.name, drawingKey: owner.drawingKey };
    node = node.parent;
  }
  return null;
}

/** Look up a currently-visible remote player by account id — the chat-name
 *  entry point knows only the account id, not which session it belongs to. */
export function findRemoteAvatarByAccountId(accountId: string): RemoteAvatarHit | null {
  for (const visual of visuals.values()) {
    if (visual.accountId === accountId) {
      return { accountId: visual.accountId, name: visual.name, drawingKey: visual.drawingKey };
    }
  }
  return null;
}

function makeNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '600 34px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const safeName = name.slice(0, 24);
    const width = Math.min(350, context.measureText(safeName).width + 42);
    context.fillStyle = 'rgba(247, 241, 222, 0.94)';
    context.strokeStyle = 'rgba(74, 61, 43, 0.72)';
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect((384 - width) / 2, 14, width, 68, 14);
    context.fill();
    context.stroke();
    context.fillStyle = '#3f3428';
    context.fillText(safeName, 192, 48);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.position.y = CENTER_Y + PLANE_HEIGHT / 2 + 0.18;
  sprite.scale.set(1.75, 0.44, 1);
  return sprite;
}
