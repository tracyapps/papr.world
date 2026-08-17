// How you look, in the world — the bridge between the avatar editor (DOM +
// SVG) and the avatar plane (Three.js).
//
// The editor never touches the renderer and the renderer never knows what a
// paper pattern is; this module is the only place the two meet. It owns:
//
//   * rasterizing a design → CanvasTexture and putting it on the avatar,
//   * the worn design (wardrobe pointer) and re-wearing it on load,
//   * opening the editor from the settings overlay,
//   * the first-run pass through the editor for a brand-new player.
//
// Rasterization, not vector-in-three: the design is drawn once into a canvas
// at texture resolution and cached. A room of avatars is a handful of small
// textures (docs/avatar-and-identity.md §5) and the frame loop never sees the
// SVG at all — nothing here runs per frame.

import * as THREE from 'three';
import { setAvatarTexture } from './avatar';
import { openAvatarEditor } from '../ui/avatarEditor/editor';
import { designToDataUrl } from '../ui/avatarEditor/render';
import { getWornDesign, saveDesign, setWornId } from '../ui/avatarEditor/wardrobe';
import { DESIGN_SHEET, type AvatarDesign } from '../../shared/src/index';

/**
 * Texture height in pixels. The cutout is ~1.55 world units tall and viewed
 * from a few metres, so 896 is generous; the width follows the sheet ratio so
 * nothing is ever stretched. (Raised with the sheet, which now includes the
 * ring where stamped arms and hair live — the cutout keeps its old pixel
 * density rather than losing some to the margin.)
 */
const TEXTURE_HEIGHT = 896;
const TEXTURE_WIDTH = Math.round((TEXTURE_HEIGHT * DESIGN_SHEET.width) / DESIGN_SHEET.height);

/** Set once the player has been offered the editor, so we only ever ask once. */
const FIRST_RUN_KEY = 'pp.avatar.firstRunDone.v1';

let currentDesign: AvatarDesign | null = null;
/** Guards against a slow raster from an earlier design landing last. */
let rasterToken = 0;

/**
 * Draw a design into a canvas and hand back a texture.
 *
 * The SVG travels as a data URL through an <Image>, which is what makes this
 * work at all: the browser rasterizes its own SVG, so the cutout, the paper
 * pattern and every crayon stroke land exactly as the editor previewed them —
 * no second renderer to keep in sync.
 */
async function rasterize(design: AvatarDesign): Promise<THREE.CanvasTexture> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('design image failed to load')), {
      once: true,
    });
    // No shadow: the world casts its own from the texture's alpha.
    image.src = designToDataUrl(design, { shadow: false });
  });

  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context for the avatar texture');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The cutout's edge is the whole look — keep it crisp up close, quiet at
  // distance. (No mipmap fuss: one power-of-two-ish plane, viewed head-on.)
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Wear a design: rasterize it and swap it onto the avatar plane.
 *
 * Failure is deliberately soft — a design that will not rasterize leaves the
 * previous look in place rather than blanking the player out of the world.
 */
export async function wearDesign(design: AvatarDesign): Promise<void> {
  const token = ++rasterToken;
  try {
    const texture = await rasterize(design);
    if (token !== rasterToken) {
      texture.dispose(); // a newer design won the race
      return;
    }
    currentDesign = design;
    setAvatarTexture(texture);
  } catch (error) {
    console.warn('avatar look: could not render this design', error);
  }
}

/** The design currently on the avatar plane, if the player has made one. */
export function getCurrentDesign(): AvatarDesign | null {
  return currentDesign;
}

/**
 * Open the editor on the current look. Saving stores it in the wardrobe, marks
 * it worn, and puts it on the avatar immediately.
 */
export function openAvatarLookEditor(options: { firstRun?: boolean } = {}): void {
  openAvatarEditor({
    initial: currentDesign ?? undefined,
    onSave: ({ design }) => {
      // A full wardrobe must not cost the player the design they just made:
      // wear it either way and say so.
      if (!saveDesign(design)) {
        console.warn('avatar look: wardrobe full — wearing without saving');
      } else {
        setWornId(design.id);
      }
      localStorage.setItem(FIRST_RUN_KEY, '1');
      void wearDesign(design);
    },
    onCancel: () => {
      // Skipping first-run is a real choice, not a postponement — the
      // placeholder cutout is a perfectly good way to exist, and the editor
      // stays one click away in settings.
      if (options.firstRun) localStorage.setItem(FIRST_RUN_KEY, '1');
    },
  });
}

/**
 * Startup: wear whatever was saved on this device, or offer the editor once to
 * a player who has never been asked.
 *
 * Never blocks the world — the game is already running underneath, so a player
 * who wants to look around first can close the editor and come back to it.
 */
export function initializeAvatarLook(): void {
  const worn = getWornDesign();
  if (worn) {
    void wearDesign(worn);
    return;
  }
  if (localStorage.getItem(FIRST_RUN_KEY) === '1') return;
  openAvatarLookEditor({ firstRun: true });
}
