import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../world/buildPieces';
import { unlearnedBuildPlan, type RecipeId } from '../sim/catalogs/recipes';
import { TECH_DEFS, techNodeGrantingRecipe } from '../sim/catalogs/techTree';
import { getGameState } from '../sim/state';
import { openTechTreeView } from './techTreeView';
import { buildMaterialUnits, type BuildMaterialId } from '../sim/catalogs/building';
import { buildMaterialOffers } from '../game/buildMaterials';
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
    // A piece whose plan is not learned yet points at the lesson instead.
    const lessonButton = target.closest<HTMLButtonElement>('[data-open-plan-lesson]');
    if (lessonButton?.dataset.openPlanLesson) {
      const nodeId = techNodeGrantingRecipe(lessonButton.dataset.openPlanLesson as RecipeId);
      if (nodeId) openTechTreeView(nodeId);
      return;
    }
    const pieceButton = target.closest<HTMLButtonElement>('[data-build-piece]');
    if (pieceButton?.dataset.buildPiece) {
      setSelectedBuildPiece(pieceButton.dataset.buildPiece as BuildPieceKey);
      return;
    }
    const materialButton = target.closest<HTMLButtonElement>('[data-build-material]');
    if (materialButton?.dataset.buildMaterial) {
      setSelectedBuildMaterial(materialButton.dataset.buildMaterial as BuildMaterialId);
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
  const plans = getGameState().player.plans;
  const degrees = Math.round(getSelectedBuildRotation() * 180 / Math.PI) % 360;
  const heading = carrying
    ? 'Carrying — click ground to set down · R rotate · a material re-builds it · Esc cancel'
    : `Build — click ground · click your own piece to pick it up · R rotate (${degrees}°) · Esc put away`;
  palette.innerHTML = `
    <p class="build-palette-heading">${heading}</p>
    <div class="build-palette-list" role="listbox" aria-label="Choose a piece to build">
      ${(Object.keys(BUILD_PIECE_DEFS) as BuildPieceKey[]).map((key) => {
    const def = BUILD_PIECE_DEFS[key];
    const missingPlan = unlearnedBuildPlan(plans, key);
    if (missingPlan) {
      const lesson = techNodeGrantingRecipe(missingPlan);
      const lessonName = lesson ? TECH_DEFS[lesson].name : 'the Professor\'s lessons';
      // Shown, not hidden: the whole tree is visible, and so is what it teaches.
      // Not colour alone — the dashed border and the word "Locked" both say it.
      return `
          <button type="button" role="option" aria-selected="false" aria-disabled="true"
            class="build-palette-item is-locked" data-open-plan-lesson="${missingPlan}">
            <span class="build-piece-name">${def.label}</span>
            <span class="build-piece-summary">Locked. Learn ${lessonName} with the Professor — press to see the lesson.</span>
          </button>`;
    }
    return `
          <button type="button" role="option" aria-selected="${selected === key}"
            class="build-palette-item${selected === key ? ' is-selected' : ''}"
            data-build-piece="${key}">
            <span class="build-piece-name">${def.label}</span>
            <span class="build-piece-summary">${def.summary}</span>
          </button>`;
  }).join('')}
    </div>
    <p class="build-palette-heading build-material-heading">${materialHeading(selected)}</p>
    <div class="build-material-list" role="listbox" aria-label="Choose a material">
      ${materialSwatches(selected, selectedMaterial)}
    </div>`;
}

/**
 * The Material heading carries the price, because the picker is the only
 * place a player finds out that a piece costs anything at all.
 */
function materialHeading(piece: BuildPieceKey | null): string {
  if (!piece) return 'Material';
  const units = buildMaterialUnits(piece);
  return units > 0 ? `Material — ${units} needed` : 'Material';
}

/**
 * Only what is in the bag, and only in quantities that would finish the piece.
 *
 * The six curated paper textures this replaced were free and tied to nothing,
 * so the picker could always show a full row. Now an empty row is a true and
 * useful thing to say: go and gather something.
 */
function materialSwatches(piece: BuildPieceKey | null, selectedMaterial: string | null): string {
  const offers = buildMaterialOffers();
  if (offers.length === 0) {
    return '<p class="build-material-empty">Nothing to build with yet — gather some paper, sticks or stone.</p>';
  }

  const units = piece ? buildMaterialUnits(piece) : 0;
  return offers.map((offer) => {
    const affordable = offer.owned >= units;
    const label = `${offer.label} — ${offer.owned} in your bag${affordable ? '' : `, ${units} needed`}`;
    return `
          <button type="button" role="option" aria-selected="${selectedMaterial === offer.id}"
            class="build-material-item${selectedMaterial === offer.id ? ' is-selected' : ''}${affordable ? '' : ' is-short'}"
            data-build-material="${offer.id}" title="${label}"
            ${affordable ? '' : 'disabled'}
            style="background-image: url('${offer.textureUrl}')">
            <span class="sr-only">${label}</span>
            <span class="build-material-count" aria-hidden="true">${offer.owned}</span>
          </button>`;
  }).join('');
}
