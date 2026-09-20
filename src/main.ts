import './styles.css';
import * as THREE from 'three';
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
  distanceToThingMaker,
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
import {
  closeCritterDialogue,
  initializeCritterDialogue,
  tryStartCritterConversationAt,
  updateCritterDialogueFraming,
} from './game/critterDialogue';
import { pickUpTrinket as pickUpPlacedTrinket } from './game/trinkets';
import { initializeTrinketVisuals, pickTrinketAtScreen, updateTrinkets } from './game/trinketVisuals';
import { noteVisitedPage } from './game/quests';
import { pickRemoteAvatarAtScreen } from './net/remoteAvatarVisuals';
import { closePlayerCard, openPlayerCardFor } from './ui/playerCard';
import { pickSharedHomeAtScreen } from './net/sharedHomeVisuals';
import { hasCozyInteractionAt, initializeCozyInteractions, tryCozyInteractionAt, updateCozyInteractions } from './game/cozyInteractions';
import { initializeInteractionCursor } from './game/interactionCursor';
import { initializeHarvesting, isHarvestableAtScreen, tryHarvestAt, updateHarvestables } from './game/harvesting';
import { getCurrentPageId, isPageActive, updateStreaming } from './world/streaming';
import { pageId, pageOfPosition } from './world/types';
import {
  initializeHudWidgets,
  isHudWidgetInteractionActive,
  refreshHudWidgets,
  settleDefaultHudWidgetPositions,
  updateCompass,
} from './ui/hud';
import { renderMiniMap, resizeMiniMapCanvas, revealMiniMapAround } from './ui/minimap';
import { initializeExplored } from './world/explored';
import { updateDirectionHints } from './ui/directionHints';
import { closeTreasureMap, installTreasureMapButton, toggleTreasureMap } from './ui/treasureMap';
import { initializeScrapbook, isScrapbookOpen, setScrapbookOpen } from './ui/scrapbook';
import { buildPlacesControls, markCurrentSpot, updatePlacesPanel } from './ui/placesPanel';
import { closeHudMenu, initializeHudMenus } from './ui/hudMenus';
import { initializeActivityLog, isActivityLogOpen, setActivityLogOpen } from './ui/activityLog';
import { initializePlaces } from './world/places';
import { getPage } from './world/pages';
import { initializeRegionBanner, updateRegionBanner } from './ui/regionBanner';
import { hasOrbitBlockingInteractionAt, registerScreenInteraction, tryScreenInteractionAt } from './game/interactionRouter';
import { getGameState, initializeGameState } from './sim/state';
import { hasToolActionAt, initializeToolActions, tryToolActionAt } from './game/toolActions';
import { gardenActionAtScreen, hasPlantActionAt, tryPlantAt, updatePlanting } from './game/planting';
import { initializeGardenOverlay, updateGardenOverlay } from './game/gardenOverlay';
import {
  cancelCarryingPiece,
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
import { describeMineRegistry, hasMineActionAt, tryMineAt, updateMineableRocks } from './game/rockInteractions';
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
  updateSeedStorePrompt,
  wireSeedStoreDom,
} from './game/seedStore';
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
import { closeAlphaNotice, initializeAlphaNotice } from './ui/alphaNotice';
import {
  closeMillPanel,
  initializeMillCounter,
  isMillPanelOpen,
  isNearMill,
  isWheelInsideMillPanel,
  onMillPanelOpened,
  setMillPanelOpen,
  updateMillPrompt,
} from './game/millCounter';
import {
  closeHomePanel,
  distanceToHomeEdge,
  initializeHomePanel,
  isHomePanelOpen,
  isNearHomePanel,
  isWheelInsideHomePanel,
  onHomePanelOpened,
  setHomePanelOpen,
  updateHome,
  updateHomePrompt,
} from './game/homePanel';
import { isHomeAtScreen } from './game/dwellingExterior';
import {
  goOutside,
  initializeSceneTransition,
  isIndoors,
  isNearInteriorExit,
  isVisiting,
  outsideDoorstep,
  restoreSavedScene,
} from './game/sceneTransition';
import { closeGuestPanels, isWheelInsideGuestPanel, setClassicPanelsCloser } from './game/panelSlot';
import {
  initializeVisitPanel,
  openVisitPanel,
  toggleVisitPanelNear,
  updateVisitPrompt,
} from './game/visitPanel';
import {
  initializeCasePanel,
  isNearCase,
  openCaseFromClick,
  pickCaseAtScreen,
  toggleCasePanelNear,
  updateCasePrompt,
} from './game/casePanel';
import { setCaseHandlers } from './game/cases';
import { initializeFriendsPanel } from './game/friendsPanel';
import { initializeKnockNotices } from './game/knockNotices';
import { interiorScene } from './game/interiorScene';
import { initializeFeedbackReview } from './ui/feedbackReview';
import { initializeMultiplayerPanel } from './ui/multiplayerPanel';

// Bootstrap: build the world, wire the UI, run the frame loop.
// World construction happens through the page system; page 0,0 is the
// original clearing and streams in around the spawn point.

const CLEARING_PAGE = pageId(0, 0);

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
initializeExplored();
initializePlaces(SPAWN_X, SPAWN_Z);
initializeGuidance();

// The layout layer publishes the zone variables every other overlay reads,
// and owns the shared toast stack, so it must come before any UI that
// registers into a rail or appends a toast.
initializeHudLayout();
initializeTimedAction();
initializeFeedbackPanel();
// Once per browser: say plainly that this is an early alpha (gate 1, criterion 4).
initializeAlphaNotice();
initializeMultiplayerPanel();

wireThingMakerDom();
renderThingMakerPanel();
wireSeedStoreDom();
initializeMillCounter();
initializeHomePanel();
initializeVisitPanel();
initializeFriendsPanel();
initializeKnockNotices();
initializeCasePanel();
setCaseHandlers({ say: showPetToast });
// Opening a neighbor's-door or friends panel clears the older panels from the slot.
setClassicPanelsCloser(() => {
  closeSeedStorePanel();
  closeMillPanel();
  setMakerPanelOpen(false);
  closeHomePanel();
});
// The mill counter, Pip's shop, and the Thing Maker share the right-hand
// panel slot: opening one closes the others.
onMillPanelOpened(() => {
  closeSeedStorePanel();
  setMakerPanelOpen(false);
  closeHomePanel();
  closeGuestPanels();
});
onHomePanelOpened(() => {
  closeSeedStorePanel();
  closeMillPanel();
  setMakerPanelOpen(false);
  closeGuestPanels();
});
initializeSceneTransition({
  closePanels: () => {
    closeSeedStorePanel();
    closeMillPanel();
    setMakerPanelOpen(false);
    closeHomePanel();
    closeGuestPanels();
    // A tool half-used, or a tool still selected, does not follow you through a door.
    cancelTimedAction('changed scene');
    setActionMode('interact');
  },
});
renderSeedStorePanel();
initializeScrapbook();
initializeHudWidgets();
initializeHudMenus();
initializeActivityLog();
// The "go to" guidance controls live attached to the minimap now, not
// tucked in a scrapbook tab — built once here rather than by the minimap's
// own module, since placesPanel.ts already owns their stateful behaviour.
document.querySelector('#mini-map-goto')?.append(buildPlacesControls());
installTreasureMapButton();
// Wear the saved cutout (or, for a brand-new player, offer the editor once).
// After the HUD so the world is already there behind the overlay.
initializeAvatarLook();
initializeProfessor();
initializeTechTreeView();
initializePetting();
initializeCritterDialogue();
initializeTrinketVisuals();
initializeCozyInteractions();
initializeHarvesting();
initializeToolActions();
initializeToolToolbar();
// The rail the minimap's default position clears only exists from the line
// above; re-place any widget still sitting on a blind wire-time default.
settleDefaultHudWidgetPositions();
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
  id: 'home',
  priority: 88,
  hitTest: (x, y) => isHomeAtScreen(x, y, camera),
  interact: () => {
    if (isNearHomePanel(avatar.position)) {
      closeSeedStorePanel();
      closeMillPanel();
      setHomePanelOpen(true);
    } else showPetToast('That is your home. Walk closer to plan and build.');
    return true;
  },
});
registerScreenInteraction({
  id: 'thing-maker',
  priority: 90,
  hitTest: (x, y) => isThingMakerAtScreen(x, y, camera),
  interact: () => {
    if (isNearThingMaker(avatar.position)) {
      closeSeedStorePanel();
      closeMillPanel();
      setMakerPanelOpen(true);
    }
    else showPetToast('The Thing Maker is over there — walk closer to use it');
    return true;
  },
});
// Between the thing-maker and loose resources: a person standing on
// something takes precedence over the thing behind them, but not over your
// own machine.
registerScreenInteraction({
  id: 'player-card',
  priority: 85,
  hitTest: (x, y) => pickRemoteAvatarAtScreen(x, y, camera) !== null,
  interact: (x, y) => {
    const hit = pickRemoteAvatarAtScreen(x, y, camera);
    if (!hit) return false;
    openPlayerCardFor(hit);
    return true;
  },
});
// A neighbor's home opens their door panel (what it looks like, whether it is
// open, and the button that goes in or knocks) — the same person as their
// avatar, just not standing there right now. Their card is one button away.
registerScreenInteraction({
  id: 'home-marker',
  priority: 82,
  hitTest: (x, y) => pickSharedHomeAtScreen(x, y) !== null,
  interact: (x, y) => {
    const hit = pickSharedHomeAtScreen(x, y);
    if (!hit) return false;
    if (isIndoors()) return false;
    openVisitPanel(hit.accountId);
    return true;
  },
});
// A display case opens its panel: what is in it, and what you may do with it.
registerScreenInteraction({
  id: 'display-case',
  priority: 81,
  hitTest: (x, y) => pickCaseAtScreen(x, y) !== null,
  interact: (x, y) => {
    const hit = pickCaseAtScreen(x, y);
    if (!hit) return false;
    return openCaseFromClick(hit, avatar.position, showPetToast);
  },
});
registerScreenInteraction({
  id: 'loose-resource',
  priority: 80,
  hitTest: isHarvestableAtScreen,
  interact: tryHarvestAt,
});
// A trinket set down in the world is yours to pick back up. Sits just under
// loose materials so a critter or dropped pile in front of it still wins.
registerScreenInteraction({
  id: 'placed-trinket',
  priority: 78,
  hitTest: (x, y) => pickTrinketAtScreen(x, y, camera) !== null,
  interact: (x, y) => {
    const hit = pickTrinketAtScreen(x, y, camera);
    if (!hit) return false;
    if (pickUpPlacedTrinket(hit.id)) showPetToast('Trinket back on the shelf');
    return true;
  },
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
  id: 'rock-mine',
  priority: 24,
  hitTest: hasMineActionAt,
  interact: tryMineAt,
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
    // Indoors the only things within reach are the way out and the home's own
    // panel; the surface's shops and machines are somewhere else entirely.
    if (isIndoors()) {
      if (isNearInteriorExit(avatar.position)) goOutside();
      // Somebody else's home has nothing of yours to plan or build in it.
      else if (!isVisiting()) setHomePanelOpen(!isHomePanelOpen());
      return;
    }
    if (isNearSeedStore(avatar.position)) {
      closeMillPanel();
      setSeedStorePanelOpen(!isSeedStorePanelOpen());
      return;
    }
    if (isNearHomePanel(avatar.position) && homeIsNearerThanMaker()) {
      closeMillPanel();
      setHomePanelOpen(!isHomePanelOpen());
      return;
    }
    if (isNearMill(avatar.position)) {
      setMillPanelOpen(!isMillPanelOpen(), 'counter');
      return;
    }
    if (isNearThingMaker(avatar.position)) {
      closeSeedStorePanel();
      closeMillPanel();
      closeHomePanel();
      setMakerPanelOpen(!isMakerPanelOpen());
      return;
    }
    if (isNearHomePanel(avatar.position)) {
      setHomePanelOpen(!isHomePanelOpen());
      return;
    }
    if (toggleCasePanelNear(avatar.position, getCurrentPageId())) return;
    toggleVisitPanelNear(avatar.position);
  },
  // Saved places and the map are of the outdoors; there is nothing to mark or
  // chart inside a tent (a floor plan comes with the map-by-scene step).
  onMarkPlace: () => {
    if (isIndoors()) showPetToast('You can only mark a spot outdoors.');
    else markCurrentSpot();
  },
  onToggleMap: () => {
    if (isIndoors()) showPetToast('The map shows the outdoors. Step outside to open it.');
    else toggleTreasureMap();
  },
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
    if (closeAlphaNotice()) return true;
    if (closeTreasureMap()) return true;
    if (cancelCarryingPiece()) return true;
    if (cancelTimedAction('escape')) return true;
    if (closeTechTreeView()) return true;
    if (closeHudMenu()) return true;
    if (closeCritterDialogue()) return true;
    if (closePlayerCard()) return true;
    if (closeSeedStorePanel()) return true;
    if (closeMillPanel()) return true;
    if (closeHomePanel()) return true;
    if (closeGuestPanels()) return true;
    if (isMakerPanelOpen()) {
      setMakerPanelOpen(false);
      return true;
    }
    if (isScrapbookOpen()) {
      setScrapbookOpen(false);
      return true;
    }
    if (isActivityLogOpen()) {
      setActivityLogOpen(false);
      return true;
    }
    if (getActionMode() !== 'interact') {
      setActionMode('interact');
      return true;
    }
    return false;
  },
  isWheelCaptured: (event) => (
    isWheelInsideMakerPanel(event) || isWheelInsideSeedStorePanel(event) || isWheelInsideMillPanel(event)
    || isWheelInsideHomePanel(event) || isWheelInsideGuestPanel(event)
  ),
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
/** Last page recorded into world knowledge, so "visit the forest" latches once. */
let lastNotedPage = '';
let lastMiniMapRevealZ = Number.POSITIVE_INFINITY;

/**
 * The Thing Maker and the home stand close together. When both are within
 * reach, the nearer one (measured to its edge) gets the E key and the prompt.
 */
const MAKER_BODY_RADIUS = 1.3;
function homeIsNearerThanMaker(): boolean {
  return distanceToHomeEdge(avatar.position) < distanceToThingMaker(avatar.position) - MAKER_BODY_RADIUS;
}

/** The frame loop while the player is inside their home. */
function animateIndoors(delta: number) {
  updateGamepadCamera(delta);
  updateAvatar(delta);
  // If the room cannot place you inside (a guest in their own tent), friends
  // see you at the door of the home you are in, on the surface page outside it.
  const step = outsideDoorstep();
  const at = pageOfPosition(step.x, step.z);
  updateSharedSession({ position: new THREE.Vector3(step.x, 0, step.z), page: pageId(at.px, at.pz) });
  updateHomePrompt(avatar.position);
  updateVisitPrompt(avatar.position, true);
  updateCasePrompt(avatar.position, getCurrentPageId(), true);
  updateHome();
  updateCamera(avatar.position);
  updateCritterDialogueFraming(delta);
  renderer.render(interiorScene, camera);
}

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

  // Inside the home, only the room is simulated and drawn: the surface holds
  // still (plants and builds run on timestamps, so nothing is lost) and none of
  // its systems ever see the interior's coordinates.
  if (isIndoors()) {
    animateIndoors(delta);
    return;
  }

  updateTimedAction(animationTime);
  updateGamepadCamera(delta);
  updateAvatar(delta);
  updateStreaming(avatar.position);
  if (getCurrentPageId() !== lastNotedPage) {
    lastNotedPage = getCurrentPageId();
    const [notedX, notedZ] = lastNotedPage.split(',').map(Number);
    noteVisitedPage(lastNotedPage, getPage(notedX, notedZ).biome);
  }
  updateTrinkets(delta, elapsed);
  updateSharedSession();
  const revealDx = avatar.position.x - lastMiniMapRevealX;
  const revealDz = avatar.position.z - lastMiniMapRevealZ;
  if (revealDx * revealDx + revealDz * revealDz >= MINIMAP_REVEAL_DISTANCE_SQ) {
    revealMiniMapAround(avatar.position.x, avatar.position.z);
    lastMiniMapRevealX = avatar.position.x;
    lastMiniMapRevealZ = avatar.position.z;
  }
  updateDirectionHints(avatar.position.x, avatar.position.z);

  const clearingActive = isPageActive(CLEARING_PAGE);
  updateThingMaker(delta, elapsed, avatar.position, clearingActive);
  updateCritters(delta, elapsed, avatar.position);
  const homeNearer = isNearHomePanel(avatar.position) && homeIsNearerThanMaker();
  updateMakerPrompt(avatar.position, homeNearer);
  updateSeedStorePrompt(avatar.position);
  updateMillPrompt(avatar.position);
  updateHomePrompt(avatar.position, isNearThingMaker(avatar.position) && !homeNearer);
  const nearOtherPrompt = isNearSeedStore(avatar.position) || isNearMill(avatar.position)
    || isNearThingMaker(avatar.position) || isNearHomePanel(avatar.position);
  const nearCase = isNearCase(avatar.position, getCurrentPageId());
  updateCasePrompt(avatar.position, getCurrentPageId(), nearOtherPrompt);
  updateVisitPrompt(avatar.position, nearOtherPrompt || nearCase);
  updateHome();

  updateGuidance(avatar.position, elapsed);
  updatePetEffects(delta);
  updateCozyInteractions(delta, elapsed);
  updateHarvestables();
  updateTrimmableTrees();
  updateMineableRocks();
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
  updateCritterDialogueFraming(delta);
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
      /** Console-only: nearby renewable rock formations and mining state. */
      rocks: () => ReturnType<typeof describeMineRegistry>;
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
  rocks: describeMineRegistry,
  shared: getSharedSessionDebug,
  sharedPlace: (templateKey = 'paper-bench') => publishSharedPlacedPiece({
    id: 'console-only',
    templateKey,
    material: '',
    x: avatar.position.x + 1.2,
    z: avatar.position.z,
    rotY: 0,
    makerId: 'local-player',
    page: getCurrentPageId(),
  }),
};

window.addEventListener('resize', resize);

feedbackReviewActive = initializeFeedbackReview();
// A save made indoors picks up indoors.
restoreSavedScene();
resize();
requestAnimationFrame(animate);
