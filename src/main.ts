import './styles.css';
import { canvas, clock, renderer, resizeRenderer, scene, camera } from './render/context';
import { addLighting, updateLighting } from './render/lighting';
import { buildBackdrop, updateBackdrop } from './render/backdrop';
import { buildClouds, updateClouds } from './render/clouds';
import { buildSky, updateSky } from './render/sky';
import { avatar, spawnAvatar, updateAvatar } from './game/avatar';
import { initializeAvatarLook } from './game/avatarLook';
import { isAvatarStudioOpen } from './ui/avatarEditor/editor';
import { initializeGuidance, updateGuidance } from './game/guidance';
import { getCameraDebug, getYaw, updateCamera } from './game/camera';
import { initializeInput, updateGamepadCamera } from './game/input';
import {
  isMakerPanelOpen,
  isNearThingMaker,
  isThingMakerAtScreen,
  isWheelInsideMakerPanel,
  renderThingMakerPanel,
  setMakerPanelOpen,
  updateMakerPrompt,
  updateThingMaker,
  wireThingMakerDom,
  hasTrayOutputAt,
  tryCollectTrayOutput,
} from './game/thingMaker';
import { pickCritterAtScreen, updateCritters } from './game/critters';
import { initializePetting, showPetToast, tryPetAt, updatePetEffects } from './game/petting';
import { closeCritterDialogue, initializeCritterDialogue, tryStartCritterConversationAt } from './game/critterDialogue';
import { hasCozyInteractionAt, initializeCozyInteractions, tryCozyInteractionAt, updateCozyInteractions } from './game/cozyInteractions';
import { initializeInteractionCursor } from './game/interactionCursor';
import { initializeHarvesting, isHarvestableAtScreen, tryHarvestAt, updateHarvestables } from './game/harvesting';
import { getCurrentPageId, isPageActive, updateStreaming } from './world/streaming';
import { pageId } from './world/types';
import {
  initializeHudWidgets,
  isHudWidgetInteractionActive,
  refreshHudWidgets,
  updateCompass,
} from './ui/hud';
import { renderMiniMap, resizeMiniMapCanvas, revealMiniMapAround } from './ui/minimap';
import { initializeScrapbook, isScrapbookOpen, setScrapbookOpen } from './ui/scrapbook';
import { markCurrentSpot, updatePlacesPanel } from './ui/placesPanel';
import { closeHudMenu, initializeHudMenus } from './ui/hudMenus';
import { initializePlaces } from './world/places';
import { initializeRegionBanner, updateRegionBanner } from './ui/regionBanner';
import { hasOrbitBlockingInteractionAt, registerScreenInteraction, tryScreenInteractionAt } from './game/interactionRouter';
import { initializeGameState } from './sim/state';
import { hasToolActionAt, initializeToolActions, tryToolActionAt } from './game/toolActions';
import { gardenActionAtScreen, hasPlantActionAt, tryPlantAt, updatePlanting } from './game/planting';
import { initializeGardenOverlay, updateGardenOverlay } from './game/gardenOverlay';
import {
  initializePlacement,
  rotateSelectedBuildPiece,
  tryPlaceAt,
  updateBuildOverlay,
} from './game/placement';
import { initializeBuildPalette } from './ui/buildPalette';
import { initializeWading } from './game/wading';
import { updateWaterSurfaces } from './world/water';
import { pickTerrainAtScreen } from './game/toolActions';
import { getActionMode, setActionMode } from './game/actionMode';
import { initializeToolToolbar, selectToolSlot } from './ui/toolToolbar';
import { hasPlantInteractionAt, tryPlantInteractionAt, updatePlantInteractions } from './game/plantInteractions';
import { describeTrimRegistry, hasTrimActionAt, tryTrimAt, updateTrimmableTrees } from './game/treeInteractions';
import { initializeHudLayout, requestHudLayout } from './ui/hudLayout';
import { initializeProfessor } from './ui/professor';
import { closeTechTreeView, initializeTechTreeView } from './ui/techTreeView';
import { initializeTechLearning } from './sim/learning';
import {
  closeSeedStorePanel,
  isNearSeedStore,
  isSeedStorePanelOpen,
  isWheelInsideSeedStorePanel,
  renderSeedStorePanel,
  setSeedStorePanelOpen,
  updateSeedStore,
  updateSeedStorePrompt,
  wireSeedStoreDom,
} from './game/seedStore';
import { GREENHOUSE_PAGE } from './world/seedStoreLayout';
import {
  cancelTimedAction,
  initializeTimedAction,
  isTimedActionActive,
  updateTimedAction,
} from './game/timedAction';
import {
  getSharedSessionDebug,
  initializeSharedSession,
  publishSharedPlacedPiece,
  updateSharedSession,
} from './net/sharedSession';
import { initializeFeedbackPanel } from './ui/feedbackPanel';
import { initializeFeedbackReview } from './ui/feedbackReview';
import { initializeMultiplayerPanel } from './ui/multiplayerPanel';

// Bootstrap: build the world, wire the UI, run the frame loop.
// World construction happens through the page system; page 0,0 is the
// original clearing and streams in around the spawn point.

const CLEARING_PAGE = pageId(0, 0);
const SEED_STORE_PAGE = pageId(GREENHOUSE_PAGE.px, GREENHOUSE_PAGE.pz);

const SPAWN_X = -1.5;
const SPAWN_Z = -2.2;
let feedbackReviewActive = false;

initializeGameState();
initializeTechLearning();
addLighting();
buildSky();
buildBackdrop();
buildClouds();
spawnAvatar(SPAWN_X, SPAWN_Z);
updateStreaming(avatar.position);
initializePlaces(SPAWN_X, SPAWN_Z);
initializeGuidance();

// The layout layer publishes the zone variables every other overlay reads,
// and owns the shared toast stack, so it must come before any UI that
// registers into a rail or appends a toast.
initializeHudLayout();
initializeTimedAction();
initializeFeedbackPanel();
initializeMultiplayerPanel();

wireThingMakerDom();
renderThingMakerPanel();
wireSeedStoreDom();
renderSeedStorePanel();
initializeScrapbook();
initializeHudWidgets();
initializeHudMenus();
// Wear the saved cutout (or, for a brand-new player, offer the editor once).
// After the HUD so the world is already there behind the overlay.
initializeAvatarLook();
initializeProfessor();
initializeTechTreeView();
initializePetting();
initializeCritterDialogue();
initializeCozyInteractions();
initializeHarvesting();
initializeToolActions();
initializeToolToolbar();
initializeInteractionCursor();
initializeGardenOverlay();
initializePlacement();
initializeBuildPalette();
initializeWading();
initializeRegionBanner();
void initializeSharedSession();
registerScreenInteraction({
  id: 'critter-conversation',
  priority: 100,
  hitTest: (x, y) => pickCritterAtScreen(x, y, camera) !== null,
  interact: tryStartCritterConversationAt,
});
// Higher priority than the machine itself: clicking the thing you just made
// should pick it up, not open the console behind it.
registerScreenInteraction({
  id: 'thing-maker-output',
  priority: 95,
  hitTest: hasTrayOutputAt,
  interact: tryCollectTrayOutput,
});
registerScreenInteraction({
  id: 'thing-maker',
  priority: 90,
  hitTest: (x, y) => isThingMakerAtScreen(x, y, camera),
  interact: () => {
    if (isNearThingMaker(avatar.position)) {
      closeSeedStorePanel();
      setMakerPanelOpen(true);
    }
    else showPetToast('The Thing Maker is over there — walk closer to use it');
    return true;
  },
});
registerScreenInteraction({
  id: 'loose-resource',
  priority: 80,
  hitTest: isHarvestableAtScreen,
  interact: tryHarvestAt,
});
registerScreenInteraction({
  id: 'plant-care',
  priority: 75,
  hitTest: hasPlantInteractionAt,
  interact: tryPlantInteractionAt,
});
registerScreenInteraction({
  id: 'cozy-object',
  priority: 70,
  blocksOrbit: false,
  hitTest: hasCozyInteractionAt,
  interact: tryCozyInteractionAt,
});
registerScreenInteraction({
  id: 'planting',
  priority: 30,
  hitTest: hasPlantActionAt,
  interact: tryPlantAt,
});
// Sits between planting and digging. All three are mode-gated so they can
// never contend, but keeping the tool verbs adjacent in priority means the
// ordering stays obvious as more of them land.
registerScreenInteraction({
  id: 'tree-trim',
  priority: 25,
  hitTest: hasTrimActionAt,
  interact: tryTrimAt,
});
registerScreenInteraction({
  id: 'equipped-tool',
  priority: 20,
  hitTest: hasToolActionAt,
  interact: tryToolActionAt,
});
// Mode-gated like the tool verbs, and placed just under them: in build mode a
// click on empty ground is a placement (consumed either way so the player gets
// an explanation, never a silent miss), while clicks on real objects still
// reach their own interactions.
registerScreenInteraction({
  id: 'build-placement',
  priority: 15,
  hitTest: (x, y) => getActionMode() === 'place' && pickTerrainAtScreen(x, y) !== null,
  interact: tryPlaceAt,
});
initializeInput({
  onToggleScrapbook: () => setScrapbookOpen(!isScrapbookOpen()),
  onToggleNearby: () => {
    if (isNearSeedStore(avatar.position)) {
      setSeedStorePanelOpen(!isSeedStorePanelOpen());
      return;
    }
    if (isNearThingMaker(avatar.position)) {
      closeSeedStorePanel();
      setMakerPanelOpen(!isMakerPanelOpen());
    }
  },
  onMarkPlace: markCurrentSpot,
  onSelectToolSlot: selectToolSlot,
  onRotateBuild: rotateSelectedBuildPiece,
  onPrimaryAction: (event) => {
    if (isTimedActionActive()) return;
    if (tryScreenInteractionAt(event.clientX, event.clientY)) return;
    tryPetAt(event.clientX, event.clientY);
  },
  shouldOrbitWithPrimary: (event) => (
    !isTimedActionActive()
    &&
    getActionMode() === 'interact'
    && !hasOrbitBlockingInteractionAt(event.clientX, event.clientY)
  ),
  onEscape: () => {
    if (cancelTimedAction('escape')) return true;
    if (closeTechTreeView()) return true;
    if (closeHudMenu()) return true;
    if (closeCritterDialogue()) return true;
    if (closeSeedStorePanel()) return true;
    if (isMakerPanelOpen()) {
      setMakerPanelOpen(false);
      return true;
    }
    if (isScrapbookOpen()) {
      setScrapbookOpen(false);
      return true;
    }
    if (getActionMode() !== 'interact') {
      setActionMode('interact');
      return true;
    }
    return false;
  },
  isWheelCaptured: (event) => isWheelInsideMakerPanel(event) || isWheelInsideSeedStorePanel(event),
  isPointerCaptured: isHudWidgetInteractionActive,
  /**
   * The world is the canvas and nothing else.
   *
   * Tested by identity rather than by asking each panel whether the pointer is
   * inside it: the canvas is one element that cannot drift out of date, while a
   * list of HUD containers grows every time a panel is added and fails
   * silently when someone forgets one.
   */
  isWorldTarget: (event) => event.target === canvas,
});

// The overlay previews whatever the pointer is over, so the bootstrap keeps
// the last pointer position rather than every consumer adding its own
// listener and them drifting out of sync.
let pointerX = window.innerWidth / 2;
let pointerY = window.innerHeight / 2;
window.addEventListener('pointermove', (event) => {
  pointerX = event.clientX;
  pointerY = event.clientY;
});

function resize() {
  resizeRenderer();
  resizeMiniMapCanvas();
  refreshHudWidgets();
  requestHudLayout();
}

const TARGET_FRAME_INTERVAL_MS = 1000 / 60;
const MINIMAP_INTERVAL_SECONDS = 1 / 12;
const MINIMAP_REVEAL_DISTANCE_SQ = 0.12 ** 2;
let nextAnimationTime = 0;
let nextMiniMapRenderTime = 0;
let lastMiniMapRevealX = Number.POSITIVE_INFINITY;
let lastMiniMapRevealZ = Number.POSITIVE_INFINITY;

function animate(animationTime = 0) {
  requestAnimationFrame(animate);

  // ProMotion/high-refresh displays otherwise run the whole simulation at
  // 120+ fps, doubling CPU/GPU work without improving this game's animation.
  if (nextAnimationTime === 0 || animationTime - nextAnimationTime > TARGET_FRAME_INTERVAL_MS) {
    nextAnimationTime = animationTime;
  }
  if (animationTime + 0.5 < nextAnimationTime) return;
  nextAnimationTime += TARGET_FRAME_INTERVAL_MS;

  // The avatar studio is an opaque, full-screen room: nothing of the world is
  // visible behind it, so simulating and rendering it is pure waste — and
  // letting it run means the clock, the critters and the weather all drift
  // while you are choosing eyebrows. Draining the delta each frame keeps the
  // first frame after closing from arriving as one enormous step.
  if (feedbackReviewActive || isAvatarStudioOpen()) {
    clock.getDelta();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  updateTimedAction(animationTime);
  updateGamepadCamera(delta);
  updateAvatar(delta);
  updateStreaming(avatar.position);
  updateSharedSession();
  const revealDx = avatar.position.x - lastMiniMapRevealX;
  const revealDz = avatar.position.z - lastMiniMapRevealZ;
  if (revealDx * revealDx + revealDz * revealDz >= MINIMAP_REVEAL_DISTANCE_SQ) {
    revealMiniMapAround(avatar.position.x, avatar.position.z);
    lastMiniMapRevealX = avatar.position.x;
    lastMiniMapRevealZ = avatar.position.z;
  }

  const clearingActive = isPageActive(CLEARING_PAGE);
  const seedStoreActive = isPageActive(SEED_STORE_PAGE);
  updateThingMaker(delta, elapsed, avatar.position, clearingActive);
  updateSeedStore(delta, elapsed, seedStoreActive);
  updateCritters(delta, elapsed, avatar.position);
  updateMakerPrompt(avatar.position);
  updateSeedStorePrompt(avatar.position);

  updateGuidance(avatar.position, elapsed);
  updatePetEffects(delta);
  updateCozyInteractions(delta, elapsed);
  updateHarvestables();
  updateTrimmableTrees();
  updatePlanting();
  updatePlantInteractions(delta, elapsed);
  updateRegionBanner(avatar.position);
  updatePlacesPanel();

  if (getActionMode() === 'plant') {
    const hovered = pickTerrainAtScreen(pointerX, pointerY);
    const { action } = gardenActionAtScreen(pointerX, pointerY);
    updateGardenOverlay(delta, elapsed, avatar.position, hovered, action);
  } else {
    updateGardenOverlay(delta, elapsed, avatar.position, null, null);
  }

  if (getActionMode() === 'place') {
    const hovered = pickTerrainAtScreen(pointerX, pointerY);
    updateBuildOverlay(delta, elapsed, avatar.position, hovered);
  } else {
    updateBuildOverlay(delta, elapsed, avatar.position, null);
  }

  updateLighting(avatar.position);
  updateSky(avatar.position, elapsed);
  updateBackdrop(avatar.position);
  updateClouds(avatar.position, elapsed);
  updateWaterSurfaces(elapsed);
  updateCamera(avatar.position);
  updateCompass(getYaw());

  renderer.render(scene, camera);
  if (elapsed >= nextMiniMapRenderTime) {
    renderMiniMap(avatar.position);
    nextMiniMapRenderTime = elapsed + MINIMAP_INTERVAL_SECONDS;
  }
}

// Handy for debugging page streaming from the console.
declare global {
  interface Window {
    __paperWorld?: {
      currentPage: () => string;
      camera: () => ReturnType<typeof getCameraDebug>;
      position: () => { x: number; z: number };
      /** Console-only spatial QA helper; gameplay never calls this. */
      teleport: (x: number, z: number) => void;
      /** Console-only: why the trim system can or cannot see a tree. */
      trees: () => ReturnType<typeof describeTrimRegistry>;
      /** Console-only shared-session visibility for two-browser smoke checks. */
      shared: () => ReturnType<typeof getSharedSessionDebug>;
      /** Console-only authoritative piece intent for multiplayer smoke checks. */
      sharedPlace: (templateKey?: string) => void;
    };
  }
}
window.__paperWorld = {
  currentPage: getCurrentPageId,
  camera: getCameraDebug,
  position: () => ({ x: avatar.position.x, z: avatar.position.z }),
  teleport: (x, z) => {
    avatar.position.x = x;
    avatar.position.z = z;
  },
  trees: describeTrimRegistry,
  shared: getSharedSessionDebug,
  sharedPlace: (templateKey = 'paper-bench') => publishSharedPlacedPiece({
    id: 'console-only',
    templateKey,
    x: avatar.position.x + 1.2,
    z: avatar.position.z,
    rotY: 0,
    makerId: 'local-player',
    page: getCurrentPageId(),
  }),
};

window.addEventListener('resize', resize);

feedbackReviewActive = initializeFeedbackReview();
resize();
requestAnimationFrame(animate);
