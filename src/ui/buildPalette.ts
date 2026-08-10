import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../world/buildPieces';
import { getActionMode, onActionModeChanged } from '../game/actionMode';
import {
  getSelectedBuildPiece,
  getSelectedBuildRotation,
  onSelectedBuildPieceChanged,
  setSelectedBuildPiece,
} from '../game/placement';
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
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-build-piece]');
    if (!button?.dataset.buildPiece) return;
    setSelectedBuildPiece(button.dataset.buildPiece as BuildPieceKey);
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
  const degrees = Math.round(getSelectedBuildRotation() * 180 / Math.PI) % 360;
  palette.innerHTML = `
    <p class="build-palette-heading">Build — click ground · R rotate (${degrees}°) · Esc put away</p>
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
    </div>`;
}
