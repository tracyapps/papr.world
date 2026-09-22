import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../world/buildPieces';
import { unlearnedBuildPlan, type RecipeId } from '../sim/catalogs/recipes';
import { TECH_DEFS, techNodeGrantingRecipe } from '../sim/catalogs/techTree';
import { getGameState } from '../sim/state';
import { openTechTreeView } from './techTreeView';
import { buildMaterialUnits, type BuildMaterialId } from '../sim/catalogs/building';
import { buildMaterialOffers } from '../game/buildMaterials';
import { getActionMode, onActionModeChanged } from '../game/actionMode';
import {
  carriedPieceCount,
  getCarriedPieceContext,
  getSelectedBuildMaterial,
  getSelectedBuildPiece,
  getSelectedBuildRotation,
  getSelectedPlacedPieceIds,
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
  const carriedCount = carriedPieceCount();
  const bulkCarrying = carrying && carriedCount > 1;
  const pendingSelection = getSelectedPlacedPieceIds();
  // Restyling an already-placed piece prices and highlights against *that*
  // piece, never the leftover "next new piece" selection above — those are
  // unrelated the moment you pick something up off the ground. A bulk carry
  // has no one piece to restyle at all (see materialSection below).
  const carriedContext = getCarriedPieceContext();
  const materialPieceKey = carriedContext ? carriedContext.templateKey : selected;
  const materialSelected = carriedContext ? carriedContext.material : selectedMaterial;
  const plans = getGameState().player.plans;
  const degrees = Math.round(getSelectedBuildRotation() * 180 / Math.PI) % 360;
  const heading = bulkCarrying
    ? `Carrying ${carriedCount} pieces — arrows nudge · R rotate (shift = 15°, right-drag = free) · click ground to set down · Esc cancel`
    : carrying
      ? 'Carrying — arrows nudge · R rotate (shift = 15°, right-drag = free) · click ground to set down · a material re-builds it · Esc cancel'
      : pendingSelection.size > 0
        ? `${pendingSelection.size} selected — click one to carry them all · shift-click to add or remove · Esc to clear`
        : `Build — click ground · click your own piece to pick it up, shift-click to select several · R rotate (${degrees}°) · Esc put away`;
  // While carrying, picking a new piece type does nothing (setSelectedBuildPiece
  // only ever affects what gets placed fresh, never the piece in hand) — so the
  // list is dead weight exactly when rail height is tightest. Dropping it here
  // both declutters the "what do I do now" moment and buys back the room the
  // material swatches need to stay reachable on a short screen.
  const pieceList = carrying ? '' : `
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
    </div>`;
  // A mixed bulk group has no one material to restyle into (setSelectedBuildMaterial
  // refuses a swatch click during one anyway) — dropping the section entirely
  // here, rather than showing stale or misleading swatches, is the honest
  // version of "nothing to do here right now".
  const materialSection = bulkCarrying ? '' : `
    <p class="build-palette-heading build-material-heading">${materialHeading(materialPieceKey)}</p>
    <div class="build-material-list" role="listbox" aria-label="Choose a material">
      ${materialSwatches(materialPieceKey, materialSelected)}
    </div>`;
  palette.innerHTML = `
    <p class="build-palette-heading">${heading}</p>
    ${pieceList}
    ${materialSection}`;
}

/**
 * The Material heading carries the price, because the picker is the only
 * place a player finds out that a piece costs anything at all.
 */
function materialHeading(piece: string | null): string {
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
function materialSwatches(piece: string | null, selectedMaterial: string | null): string {
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
