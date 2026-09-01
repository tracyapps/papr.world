import * as THREE from 'three';
import { getMapFeatures } from '../world/mapFeatures';
import { sampleTerrainHeight } from '../world/terrain';
import { getPage } from '../world/pages';
import { getGroundMapColor } from '../world/pageRuntime';
import { PAGE_SIZE, pageOfPosition } from '../world/types';

// Fog-of-war minimap. Exploration is stored per world-grid cell in a Set,
// so it follows the avatar across any number of pages.

const miniMapCanvas = document.querySelector<HTMLCanvasElement>('#mini-map');
const miniMapContext = miniMapCanvas?.getContext('2d') ?? null;

/** Fixed world-space cell size (the old 72-cells-per-22-units density),
 * independent of PAGE_SIZE so bigger pages don't make the map blocky. */
const CELL_SIZE = 22 / 72;
const REVEAL_RADIUS = 2.65;
const VIEW_RADIUS = 8.2;

const exploredCells = new Set<string>();

function cellKey(column: number, row: number) {
  return `${column},${row}`;
}

function worldToCell(x: number, z: number) {
  return {
    column: Math.floor(x / CELL_SIZE),
    row: Math.floor(z / CELL_SIZE),
  };
}

function isCellExplored(column: number, row: number) {
  return exploredCells.has(cellKey(column, row));
}

export function isWorldPointExplored(x: number, z: number) {
  const { column, row } = worldToCell(x, z);
  return isCellExplored(column, row);
}

export function revealMiniMapAround(x: number, z: number) {
  const center = worldToCell(x, z);
  const radiusInCells = Math.ceil(REVEAL_RADIUS / CELL_SIZE);

  for (let row = center.row - radiusInCells; row <= center.row + radiusInCells; row += 1) {
    for (let column = center.column - radiusInCells; column <= center.column + radiusInCells; column += 1) {
      const cellX = (column + 0.5) * CELL_SIZE;
      const cellZ = (row + 0.5) * CELL_SIZE;
      if (Math.hypot(cellX - x, cellZ - z) <= REVEAL_RADIUS) {
        exploredCells.add(cellKey(column, row));
      }
    }
  }
}

export function resizeMiniMapCanvas() {
  if (!miniMapCanvas || !miniMapContext) return;

  const rect = miniMapCanvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio, 2);
  miniMapCanvas.width = Math.max(1, Math.round(rect.width * scale));
  miniMapCanvas.height = Math.max(1, Math.round(rect.height * scale));
  miniMapContext.setTransform(scale, 0, 0, scale, 0, 0);
}

export function renderMiniMap(avatarPosition: THREE.Vector3) {
  if (!miniMapCanvas || !miniMapContext) return;

  const rect = miniMapCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const centerX = avatarPosition.x;
  const centerZ = avatarPosition.z;

  // The widget can now be resized wider than it is tall (see hud.ts's
  // 'dimensions' resize mode), so this can no longer assume a square
  // canvas. Vertical view radius stays fixed and pixels-per-world-unit is
  // derived from it; a wider canvas just reveals more world horizontally,
  // at the same undistorted scale, rather than squishing or cropping it.
  const cellScreenSize = height / (VIEW_RADIUS * 2);
  const viewRadiusX = (width / 2) / cellScreenSize;
  const visibleMinX = centerX - viewRadiusX;
  const visibleMaxX = centerX + viewRadiusX;
  const visibleMinZ = centerZ - VIEW_RADIUS;
  const visibleMaxZ = centerZ + VIEW_RADIUS;

  const toMapX = (x: number) => (x - visibleMinX) * cellScreenSize;
  const toMapY = (z: number) => (z - visibleMinZ) * cellScreenSize;
  const isInView = (x: number, z: number, radius: number) => (
    x + radius >= visibleMinX
    && x - radius <= visibleMaxX
    && z + radius >= visibleMinZ
    && z - radius <= visibleMaxZ
  );

  // Unexplored paper-dark base.
  miniMapContext.clearRect(0, 0, width, height);
  miniMapContext.fillStyle = '#201a17';
  miniMapContext.fillRect(0, 0, width, height);

  // Explored terrain cells, tinted by biome ground with hills highlighted.
  const minColumn = Math.floor(visibleMinX / CELL_SIZE);
  const maxColumn = Math.ceil(visibleMaxX / CELL_SIZE);
  const minRow = Math.floor(visibleMinZ / CELL_SIZE);
  const maxRow = Math.ceil(visibleMaxZ / CELL_SIZE);

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (!isCellExplored(column, row)) continue;

      const cellX = column * CELL_SIZE;
      const cellZ = row * CELL_SIZE;
      const sampleX = cellX + CELL_SIZE / 2;
      const sampleZ = cellZ + CELL_SIZE / 2;

      const heightSample = sampleTerrainHeight(sampleX, sampleZ);
      if (heightSample > 0.12) {
        miniMapContext.fillStyle = '#587d48';
      } else {
        const { px, pz } = pageOfPosition(sampleX, sampleZ);
        miniMapContext.fillStyle = getGroundMapColor(getPage(px, pz).biome);
      }
      miniMapContext.fillRect(
        toMapX(cellX),
        toMapY(cellZ),
        Math.max(1.5, CELL_SIZE * cellScreenSize + 0.5),
        Math.max(1.5, CELL_SIZE * cellScreenSize + 0.5),
      );
    }
  }

  // Discovered features.
  for (const feature of getMapFeatures()) {
    if (!isInView(feature.x, feature.z, Math.max(feature.radiusX, feature.radiusZ))) continue;
    if (!isWorldPointExplored(feature.x, feature.z)) continue;

    const x = toMapX(feature.x);
    const y = toMapY(feature.z);
    const radiusX = Math.max(2, feature.radiusX * cellScreenSize);
    const radiusY = Math.max(2, feature.radiusZ * cellScreenSize);

    miniMapContext.save();
    miniMapContext.translate(x, y);
    miniMapContext.rotate(feature.rotation ?? 0);
    miniMapContext.fillStyle = feature.color;

    if (feature.shape === 'circle') {
      miniMapContext.beginPath();
      miniMapContext.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
      miniMapContext.fill();
    } else {
      miniMapContext.fillRect(-radiusX, -radiusY, radiusX * 2, radiusY * 2);
    }

    miniMapContext.restore();
  }

  // Re-mask unexplored cells so features never leak into the dark.
  miniMapContext.fillStyle = '#201a17';
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (isCellExplored(column, row)) continue;

      const cellX = column * CELL_SIZE;
      const cellZ = row * CELL_SIZE;
      miniMapContext.fillRect(
        toMapX(cellX),
        toMapY(cellZ),
        Math.max(1.5, CELL_SIZE * cellScreenSize + 0.5),
        Math.max(1.5, CELL_SIZE * cellScreenSize + 0.5),
      );
    }
  }

  // Player arrow. Always screen-centre — that's centerX/centerZ by
  // construction, which is (width/2, height/2) in canvas pixels.
  miniMapContext.fillStyle = '#f8f1d4';
  miniMapContext.strokeStyle = '#332a24';
  miniMapContext.lineWidth = 1.5;
  miniMapContext.beginPath();
  miniMapContext.moveTo(width / 2, height / 2 - 5);
  miniMapContext.lineTo(width / 2 + 4, height / 2 + 4);
  miniMapContext.lineTo(width / 2, height / 2 + 2);
  miniMapContext.lineTo(width / 2 - 4, height / 2 + 4);
  miniMapContext.closePath();
  miniMapContext.fill();
  miniMapContext.stroke();

  miniMapContext.strokeStyle = 'rgb(255 252 240 / 0.38)';
  miniMapContext.lineWidth = 1;
  miniMapContext.strokeRect(0.5, 0.5, width - 1, height - 1);
}
