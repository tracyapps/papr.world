import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../world/buildPieces';
import {
  BUILD_MATERIAL_LABELS,
  BUILD_MATERIAL_OPTIONS,
  type BuildMaterialKey,
} from '../sim/catalogs/building';
import { getActionMode, onActionModeChanged } from '../game/actionMode';
import {
  getSelectedBuildMaterial,
  getSelectedBuildPiece,
  getSelectedBuildRotation,
  isCarryingPlacedPiece,
  onSelectedBuildPieceChanged,
  setSelectedBuildMaterial,
  setSelectedBuildPiece,
} from '../game/placement';
import { materialTextureUrl } from '../render/materials';
import { registerRailPanel } from './hudLayout';

// The build-mode palette: the pieces the player can put down, shown only while
// the Build slot is active.
//
// It rides the right-hand rail so it auto-stacks and — being hidden when not
// in build mode — contributes nothing to that rail's layout the rest of the
// time. Clicking an item just picks the piece; clicking the ground places it.

let palette: HTMLElement | null = null;

export function initializeBuildPalette() {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app || palette) return;

  palette = document.createElement('section');
  palette.id = 'build-palette';
  palette.className = 'build-palette';
  palette.setAttribute('aria-label', 'Pieces to build');
  palette.hidden = true;

  // Re-rendering the list on selection swaps the buttons out from under a
  // click in flight, so the handler lives on the container, not the buttons.
  palette.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const pieceButton = target.closest<HTMLButtonElement>('[data-build-piece]');
    if (pieceButton?.dataset.buildPiece) {
      setSelectedBuildPiece(pieceButton.dataset.buildPiece as BuildPieceKey);
      return;
    }
    const materialButton = target.closest<HTMLButtonElement>('[data-build-material]');
    if (materialButton?.dataset.buildMaterial) {
      setSelectedBuildMaterial(materialButton.dataset.buildMaterial as BuildMaterialKey);
    }
  });
  palette.addEventListener('pointerdown', (event) => event.stopPropagation());
  palette.addEventListener('pointerup', (event) => event.stopPropagation());
  palette.addEventListener('wheel', (event) => event.stopPropagation());

  app.appendChild(palette);
  registerRailPanel({ id: 'build-palette', element: palette, order: 30 });

  onActionModeChanged(renderPalette);
  onSelectedBuildPieceChanged(renderPalette);
  renderPalette();
}

function renderPalette() {
  if (!palette) return;
  const active = getActionMode() === 'place';
  palette.hidden = !active;
  if (!active) return;

  const selected = getSelectedBuildPiece();
  const selectedMaterial = getSelectedBuildMaterial();
  const carrying = isCarryingPlacedPiece();
  const degrees = Math.round(getSelectedBuildRotation() * 180 / Math.PI) % 360;
  const heading = carrying
    ? 'Carrying — click ground to set down · R rotate · a material re-builds it · Esc cancel'
    : `Build — click ground · click your own piece to pick it up · R rotate (${degrees}°) · Esc put away`;
  palette.innerHTML = `
    <p class="build-palette-heading">${heading}</p>
    <div class="build-palette-list" role="listbox" aria-label="Choose a piece to build">
      ${(Object.keys(BUILD_PIECE_DEFS) as BuildPieceKey[]).map((key) => {
    const def = BUILD_PIECE_DEFS[key];
    return `
          <button type="button" role="option" aria-selected="${selected === key}"
            class="build-palette-item${selected === key ? ' is-selected' : ''}"
            data-build-piece="${key}">
            <span class="build-piece-name">${def.label}</span>
            <span class="build-piece-summary">${def.summary}</span>
          </button>`;
  }).join('')}
    </div>
    <p class="build-palette-heading build-material-heading">Material</p>
    <div class="build-material-list" role="listbox" aria-label="Choose a material">
      ${BUILD_MATERIAL_OPTIONS.map((material) => `
          <button type="button" role="option" aria-selected="${selectedMaterial === material}"
            class="build-material-item${selectedMaterial === material ? ' is-selected' : ''}"
            data-build-material="${material}" title="${BUILD_MATERIAL_LABELS[material]}"
            style="background-image: url('${materialTextureUrl(material)}')">
            <span class="sr-only">${BUILD_MATERIAL_LABELS[material]}</span>
          </button>`).join('')}
    </div>`;
}
