import * as THREE from 'three';
import { textureLoader } from './context';

// Shared paper material registry.
// Pages reference materials by key so page data stays serializable,
// and repeated materials keep texture memory + draw calls down.

export type PaperMaterialOptions = {
  textureUrl: string;
  repeat?: [number, number];
  color?: string;
  roughness?: number;
  transparent?: boolean;
};

export type MaterialKey =
  | 'ground.clearing'
  | 'ground.forest'
  | 'ground.meadow'
  | 'ground.dunes'
  | 'paper.brown'
  | 'paper.brown.warm'
  | 'paper.green'
  | 'paper.blue'
  | 'paper.blue.deep'
  | 'paper.water'
  | 'paper.notebook'
  | 'paper.plaid'
  | 'paper.cork'
  | 'paper.hill'
  | 'paper.orangewrap'
  | 'paper.butterflywing'
  | 'paper.monstera'
  | 'paper.bubbles'
  | 'paper.aqua'
  | 'paper.grey'
  | 'paper.purple'
  | 'paper.rainbow'
  | 'paper.salmon'
  | 'wall.siding1'
  | 'wall.siding2'
  | 'roof.shingle1'
  | 'roof.shingle2'
  | 'underground.basalt'
  | 'underground.clay'
  | 'underground.iron'
  | 'underground.mossyWall'
  | 'underground.quartz'
  | 'underground.sandstone'
  | 'underground.slate';

const MATERIAL_DEFS: Record<MaterialKey, PaperMaterialOptions> = {
  // Ground repeats are tuned for 50-unit page sheets.
  'ground.clearing': { textureUrl: '/assets/runtime/materials/terrain_clearing_sheet_01.png', repeat: [2, 2] },
  'ground.forest': { textureUrl: '/assets/runtime/materials/construction-paper-green-3.png', repeat: [6.5, 6.5] },
  'ground.meadow': { textureUrl: '/assets/runtime/materials/construction-paper-green-2.png', repeat: [6.5, 6.5] },
  'ground.dunes': { textureUrl: '/assets/runtime/materials/camouflage-blobs-desert.png', repeat: [5, 5] },
  'paper.brown': { textureUrl: '/assets/runtime/materials/construction-paper-brown-3.png', repeat: [2, 2] },
  'paper.brown.warm': { textureUrl: '/assets/runtime/materials/construction-paper-brown-2.png', repeat: [1.6, 1.6] },
  'paper.green': { textureUrl: '/assets/runtime/materials/construction-paper-green-2.png', repeat: [2, 2] },
  'paper.blue': { textureUrl: '/assets/runtime/materials/construction-paper-blue-2.png', repeat: [2.6, 2.6] },
  // Water is two layers: a darker bed you can see through the surface, and
  // the drifting surface itself. Blue construction paper stays available as
  // an ordinary decorative colour.
  'paper.blue.deep': { textureUrl: '/assets/runtime/materials/construction-paper-blue-3.png', repeat: [2.2, 2.2] },
  'paper.water': { textureUrl: '/assets/runtime/materials/curving-deeper-blues.png', repeat: [1.6, 1.6] },
  'paper.notebook': { textureUrl: '/assets/runtime/materials/paper_notebook_blue_lined_01.png', repeat: [1, 1] },
  'paper.plaid': { textureUrl: '/assets/runtime/materials/wrapping-paper-blue-plaid-01.png', repeat: [4, 4] },
  'paper.cork': { textureUrl: '/assets/runtime/materials/cork-board.png', repeat: [2, 2] },
  'paper.hill': { textureUrl: '/assets/runtime/materials/construction-paper-green-1.png', repeat: [3, 2] },
  'paper.orangewrap': { textureUrl: '/assets/runtime/materials/wrapping-paper-orange-01.png', repeat: [5, 1] },
  'paper.butterflywing': { textureUrl: '/assets/runtime/materials/folded-stripes-blue-purple-pink-white.png', repeat: [1, 1] },
  'paper.monstera': { textureUrl: '/assets/runtime/materials/monstera-patch.png', repeat: [1.4, 1.4] },
  'paper.bubbles': { textureUrl: '/assets/runtime/materials/subtle-bubbles-greenblues.png', repeat: [2, 2] },
  'paper.aqua': { textureUrl: '/assets/runtime/materials/building-blocks-aqua.png', repeat: [1.4, 1.4] },
  'paper.grey': { textureUrl: '/assets/runtime/materials/wooden-floor-grey.png', repeat: [1.5, 1.5] },
  'paper.purple': { textureUrl: '/assets/runtime/materials/3d-squares-purple.png', repeat: [1.3, 1.3] },
  'paper.rainbow': { textureUrl: '/assets/runtime/materials/curving-deeper-rainbow.png', repeat: [1.6, 1.6] },
  'paper.salmon': { textureUrl: '/assets/runtime/materials/ribbon-weave-salmon.png', repeat: [1.5, 1.5] },
  'wall.siding1': { textureUrl: '/assets/runtime/materials/wall-siding-01.png', repeat: [2.6, 1.65] },
  'wall.siding2': { textureUrl: '/assets/runtime/materials/wall-siding-02.png', repeat: [2.6, 1.65] },
  'roof.shingle1': { textureUrl: '/assets/runtime/materials/roof-shingles-01.png', repeat: [2.35, 1.9] },
  'roof.shingle2': { textureUrl: '/assets/runtime/materials/roof-shingles-02.png', repeat: [2.35, 1.9] },
  // Prepared for cave walls, formations, and mineral seams. Keeping these in
  // the registry now means the upcoming underground generator can reference
  // stable serializable keys rather than raw artwork URLs.
  'underground.basalt': { textureUrl: '/assets/runtime/materials/basalt.png', repeat: [1.5, 2] },
  'underground.clay': { textureUrl: '/assets/runtime/materials/clay-earth.png', repeat: [2, 2] },
  'underground.iron': { textureUrl: '/assets/runtime/materials/iron-rock.png', repeat: [2, 2] },
  'underground.mossyWall': { textureUrl: '/assets/runtime/materials/mossy-wall.png', repeat: [2, 2] },
  'underground.quartz': { textureUrl: '/assets/runtime/materials/quartz.png', repeat: [1.8, 1.8] },
  'underground.sandstone': { textureUrl: '/assets/runtime/materials/sandstone.png', repeat: [2, 2] },
  'underground.slate': { textureUrl: '/assets/runtime/materials/slate.png', repeat: [1.2, 2.2] },
};

const paperCache = new Map<string, THREE.MeshStandardMaterial>();
const colorCache = new Map<string, THREE.MeshStandardMaterial>();

export function createPaperMaterial(options: PaperMaterialOptions): THREE.MeshStandardMaterial {
  const texture = textureLoader.load(options.textureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  if (options.repeat) {
    texture.repeat.set(options.repeat[0], options.repeat[1]);
  }

  return new THREE.MeshStandardMaterial({
    color: options.color ?? '#ffffff',
    map: texture,
    roughness: options.roughness ?? 0.95,
    metalness: 0,
    transparent: options.transparent ?? false,
    side: THREE.DoubleSide,
  });
}

/** The texture image behind a material key, for UI swatches (e.g. the build
 * material picker) that want to preview the real paper art in plain CSS
 * rather than approximate it with a flat color. */
export function materialTextureUrl(key: MaterialKey): string {
  return MATERIAL_DEFS[key].textureUrl;
}

/** Cached lookup by registry key. Pages should always use this. */
export function getMaterial(key: MaterialKey): THREE.MeshStandardMaterial {
  let material = paperCache.get(key);
  if (!material) {
    material = createPaperMaterial(MATERIAL_DEFS[key]);
    paperCache.set(key, material);
  }
  return material;
}

const urlCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Cached textured paper material by raw URL — used by the critter
 * variation system, which picks from wide texture palettes that don't
 * all deserve registry keys.
 */
export function getPaperMaterialByUrl(url: string, repeat: [number, number] = [1.6, 1.6]): THREE.MeshStandardMaterial {
  const cacheKey = `${url}|${repeat[0]}x${repeat[1]}`;
  let material = urlCache.get(cacheKey);
  if (!material) {
    material = createPaperMaterial({ textureUrl: url, repeat });
    urlCache.set(cacheKey, material);
  }
  return material;
}

export function createColorMaterial(color: string, roughness = 0.88): THREE.MeshStandardMaterial {
  const cacheKey = `${color}|${roughness}`;
  let material = colorCache.get(cacheKey);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness });
    colorCache.set(cacheKey, material);
  }
  return material;
}
