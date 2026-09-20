import * as THREE from 'three';
import { closeMillPanel } from './millCounter';
import { closeHomePanel } from './homePanel';
import { closeGuestPanels } from './panelSlot';
import { createCutout, shadowed } from '../render/builders';
import { createColorMaterial, getMaterial } from '../render/materials';
import { registerMapFeature, removeMapFeature } from '../world/mapFeatures';
import { sampleTerrainHeight } from '../world/terrain';
import {
  MAKER_UPGRADE_INGREDIENTS,
  RECIPE_DEFS,
  getCraftDuration,
  looseRecipes,
  recipesInFamily,
  type IngredientRequirement,
  type RecipeDefinition,
  type RecipeId,
} from '../sim/catalogs/recipes';
import { techNodeGrantingRecipe } from '../sim/catalogs/techTree';
import { TOOL_DEFS, TOOL_FAMILIES, TOOL_FAMILY_ORDER, type ToolFamilyId } from '../sim/catalogs/tools';
import {
  craftBlockersFor,
  describeCraftBlocker,
  dispatchGameCommand,
  resolveIngredientAllocation,
} from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { RESOURCE_CATEGORIES, RESOURCE_DEFS } from '../world/resources';
import type { ResourceId } from '../world/types';
import { getToolArt } from './toolPresentation';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { showPetToast } from './petting';
import { camera } from '../render/context';
import { openTechTreeView } from '../ui/techTreeView';
import {
  MAKER_BODY_HEIGHT,
  MAKER_EYE_Y,
  MAKER_HIT_BOX,
  makerLook,
  makerLookLevel,
  type MakerPart,
} from './thingMakerLook';

// The Manual Thing Maker: rig, idle/working animation, crafting simulation,
// and its DOM console panel. Lives on page 0,0.

type ThingMakerRig = {
  group: THREE.Group;
  crank: THREE.Group;
  rollers: THREE.Mesh[];
  /** Level 2 and up. */
  lever: THREE.Group | null;
  buttons: THREE.Mesh[];
  /** Resting height of the buttons, which bob around it. */
  buttonBaseY: number;
  bell: THREE.Group;
  bellClapper: THREE.Mesh;
  planSlot: THREE.Mesh;
  /** Level 2 and up. */
  pressureNeedle: THREE.Group | null;
  outputItems: THREE.Group;
  leftPupil: THREE.Mesh;
  pupilRest: { x: number; y: number; z: number };
  rightPupil: THREE.Mesh;
  strandBits: THREE.Mesh[];
};

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const makerPanel = document.querySelector<HTMLElement>('#thing-maker-panel');
const makerRecipesElement = document.querySelector<HTMLElement>('#maker-recipes');
const makerInventoryElement = document.querySelector<HTMLElement>('#maker-inventory');
const makerMessageElement = document.querySelector<HTMLElement>('#maker-message');
const makerProgressElement = document.querySelector<HTMLElement>('#maker-progress');
const makerOutputElement = document.querySelector<HTMLElement>('#maker-output');
const makerUpgradeButton = document.querySelector<HTMLButtonElement>('#maker-upgrade');
const makerPrompt = document.querySelector<HTMLElement>('#maker-interaction-prompt');

const resourceIds = Object.keys(RESOURCE_DEFS) as ResourceId[];
const recipes = Object.values(RECIPE_DEFS) as RecipeDefinition[];

let makerPanelOpen = false;
let makerMessage = 'Plans go in the slot. Materials go in the hoppers. I do the emotionally complex cranking.';
let bellPulse = 0;
/** Serialised tray contents last drawn, so rebuilds only happen on change. */
let renderedTraySignature = '';
const trayFeatureIds: string[] = [];

export const thingMakerPosition = new THREE.Vector3(-0.12, 0, -3.22);

let thingMaker: ThingMakerRig | null = null;
/**
 * Invisible pointer target the size of the *full* machine. The model is plainer
 * and narrower at low levels (thingMakerLook.ts) but the thing you have to
 * click does not change.
 */
let makerHitProxy: THREE.Mesh | null = null;
let makerParent: THREE.Group | null = null;
let makerBuiltLevel = 0;
const makerRaycaster = new THREE.Raycaster();
const makerPointer = new THREE.Vector2();

function createThingMakerRig(position: THREE.Vector3Tuple, level: number): ThingMakerRig {
  const look = makerLook(level);
  const has = (part: MakerPart) => look.parts.has(part);
  // Level 3 is the original machine, kept as it was. Levels 1 and 2 are
  // plainer: flat top, a neck under the eyes, a chute to the tray.
  const full = has('rollers');
  const width = look.bodyWidth;
  const topY = full ? 0.83 : has('topSheet') ? 0.8 : 0.76;

  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = -0.42;

  const corkPaper = getMaterial('paper.cork');
  const brownPaper = getMaterial('paper.brown');
  const notebookPaper = getMaterial('paper.notebook');
  const plaidPaper = getMaterial('paper.plaid');
  const orangeWrapPaper = getMaterial('paper.orangewrap');

  const darkMaterial = createColorMaterial('#332a24', 0.82);
  const creamMaterial = createColorMaterial('#fff8df', 0.92);
  const pupilMaterial = createColorMaterial('#201b18', 0.75);
  const redButtonMaterial = createColorMaterial('#cf4f38', 0.74);
  const tealButtonMaterial = createColorMaterial('#277a75', 0.78);
  const yellowButtonMaterial = createColorMaterial('#f0b548', 0.78);
  const brassMaterial = createColorMaterial('#c9903c', 0.68);
  const blueMaterial = createColorMaterial('#446c9d', 0.78);

  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, MAKER_BODY_HEIGHT, 1.2), look.level === 1 ? brownPaper : corkPaper));
  base.position.y = 0.4;
  group.add(base);

  if (has('belly')) {
    const belly = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.58, 0.16), brownPaper));
    belly.position.set(0, 0.45, -0.68);
    group.add(belly);
  }

  if (has('console')) {
    const topConsole = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 1.0), plaidPaper));
    topConsole.position.set(0, 0.83, -0.03);
    topConsole.rotation.x = -0.22;
    group.add(topConsole);
  } else if (has('topSheet')) {
    const topSheet = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.04, 0.9), blueMaterial));
    topSheet.position.set(0, 0.78, -0.03);
    group.add(topSheet);
  }

  // The plan slot: a dark opening with the notebook page showing in it.
  let planSlot: THREE.Mesh;
  if (full) {
    planSlot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.035, 0.46), notebookPaper));
    planSlot.position.set(-0.36, 0.92, -0.2);
    planSlot.rotation.x = -0.22;
  } else {
    const slotX = look.level === 1 ? -0.15 : -0.3;
    const slotFrame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.42), darkMaterial));
    slotFrame.position.set(slotX, topY + 0.015, -0.1);
    group.add(slotFrame);
    planSlot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.3), notebookPaper));
    planSlot.position.set(slotX, topY + 0.035, -0.1);
  }
  group.add(planSlot);

  if (has('column')) {
    const centralColumn = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.46, 6), orangeWrapPaper));
    centralColumn.position.set(0.38, 1.06, -0.02);
    group.add(centralColumn);
  }

  // The face. It is on every level; it just gets bigger.
  const eyeBridge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(look.bridgeWidth, 0.12, 0.18), brownPaper));
  eyeBridge.position.set(0, 1.2, -0.56);
  eyeBridge.rotation.x = 0.12;
  group.add(eyeBridge);
  if (!full) {
    const neckHeight = 1.14 - topY;
    const neck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.18, neckHeight, 0.18), brownPaper));
    neck.position.set(0, topY + neckHeight / 2, -0.5);
    group.add(neck);
  }

  const eyeY = MAKER_EYE_Y;
  const eyeZ = -0.67;
  const leftEye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(look.eyeRadius, 24, 16), creamMaterial));
  const rightEye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(look.eyeRadius, 24, 16), creamMaterial));
  leftEye.position.set(-look.eyeSpacing, eyeY, eyeZ);
  rightEye.position.set(look.eyeSpacing, eyeY, eyeZ);
  group.add(leftEye, rightEye);

  const pupilRadius = look.eyeRadius * 0.38;
  const pupilRest = { x: look.eyeSpacing, y: eyeY - 0.02, z: eyeZ - look.eyeRadius * 0.82 };
  const leftPupil = shadowed(new THREE.Mesh(new THREE.SphereGeometry(pupilRadius, 16, 12), pupilMaterial));
  const rightPupil = shadowed(new THREE.Mesh(new THREE.SphereGeometry(pupilRadius, 16, 12), pupilMaterial));
  leftPupil.position.set(-pupilRest.x, pupilRest.y, pupilRest.z);
  rightPupil.position.set(pupilRest.x, pupilRest.y, pupilRest.z);
  group.add(leftPupil, rightPupil);

  // The crank: a ring with a red knob, out on the side. Paper-and-yellow at
  // level 1, brass at level 2, dark iron on the full machine.
  const crankMaterial = look.level === 1 ? yellowButtonMaterial : look.level === 2 ? brassMaterial : darkMaterial;
  const crankX = width / 2 + 0.1;
  const crank = new THREE.Group();
  crank.position.set(crankX, look.level === 1 ? 0.5 : look.level === 2 ? 0.55 : 0.57, -0.02);
  const crankWheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(look.crankRadius, 0.034, 8, 34), crankMaterial));
  crankWheel.rotation.y = Math.PI / 2;
  const crankHandle = shadowed(new THREE.Mesh(new THREE.SphereGeometry(full ? 0.085 : 0.075, 16, 12), redButtonMaterial));
  crankHandle.position.set(0.04, look.crankRadius, 0);
  crank.add(crankWheel, crankHandle);
  group.add(crank);
  if (!full) {
    const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), darkMaterial));
    axle.rotation.z = Math.PI / 2;
    axle.position.set(width / 2 + 0.04, crank.position.y, -0.02);
    group.add(axle);
  }

  const rollers: THREE.Mesh[] = [];
  if (has('rollers')) {
    for (const [index, y] of [0.62, 0.38].entries()) {
      const roller = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.34, 24), index === 0 ? blueMaterial : brassMaterial));
      roller.position.set(0, y, -0.78);
      roller.rotation.z = Math.PI / 2;
      rollers.push(roller);
      group.add(roller);
    }
  }

  const strandBits: THREE.Mesh[] = [];
  if (has('strands')) {
    for (let index = 0; index < 7; index += 1) {
      const strand = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), yellowButtonMaterial));
      strand.position.set(-0.36 + index * 0.12, 0.19 + (index % 2) * 0.035, -0.91);
      strand.rotation.z = (index % 2 === 0 ? 0.04 : -0.04);
      strandBits.push(strand);
      group.add(strand);
    }
  }

  let lever: THREE.Group | null = null;
  if (has('lever')) {
    lever = new THREE.Group();
    if (full) lever.position.set(-0.77, 0.98, 0.1);
    else lever.position.set(0.6, topY + 0.16, 0.3);
    const leverPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), darkMaterial));
    leverPost.rotation.z = -0.55;
    const leverKnob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), tealButtonMaterial));
    leverKnob.position.set(0.1, 0.17, 0);
    lever.add(leverPost, leverKnob);
    group.add(lever);
  }

  // Three little buttons that bob while it works.
  const buttons: THREE.Mesh[] = [];
  const buttonMaterials = [redButtonMaterial, tealButtonMaterial, yellowButtonMaterial];
  const buttonBaseY = full ? 0.93 : topY + 0.08;
  for (let index = 0; index < 3; index += 1) {
    const button = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.045, 18), buttonMaterials[index]));
    if (full) button.position.set(0.12 + index * 0.2, buttonBaseY, -0.36);
    else button.position.set((look.level === 1 ? 0.05 : 0.06) + index * 0.18, buttonBaseY, -0.36);
    button.rotation.x = full ? Math.PI / 2 - 0.22 : Math.PI / 2;
    buttons.push(button);
    group.add(button);
  }

  let pressureNeedle: THREE.Group | null = null;
  if (has('gauge')) {
    pressureNeedle = new THREE.Group();
    if (full) {
      pressureNeedle.position.set(0.67, 0.95, -0.18);
      const gauge = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 28), creamMaterial));
      gauge.rotation.x = Math.PI / 2 - 0.22;
      const needle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.018), redButtonMaterial));
      needle.position.y = 0.07;
      pressureNeedle.add(gauge, needle);
    } else {
      // Only the needle swings here; the dial face stays put.
      const gaugeFace = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 28), creamMaterial));
      gaugeFace.rotation.x = Math.PI / 2;
      gaugeFace.position.set(0.6, topY + 0.13, -0.18);
      group.add(gaugeFace);
      pressureNeedle.position.set(0.6, topY + 0.13, -0.18);
      const needle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.018), redButtonMaterial));
      needle.position.set(0, 0.06, -0.03);
      pressureNeedle.add(needle);
    }
    group.add(pressureNeedle);
  }

  // The bell is on every level. On the plainer two it hangs from a post.
  const bell = new THREE.Group();
  if (full) {
    bell.position.set(-0.66, 1.13, 0.2);
  } else {
    const bellX = look.level === 1 ? -0.38 : -0.55;
    const bellZ = look.level === 1 ? 0.3 : 0.32;
    bell.position.set(bellX, 1.0, bellZ);
    const postHeight = 1.2 - topY;
    const bellPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, postHeight, 10), darkMaterial));
    bellPost.position.set(bellX, topY + postHeight / 2, bellZ);
    group.add(bellPost);
  }
  const bellDome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.72), brassMaterial));
  bellDome.scale.y = 0.72;
  bellDome.rotation.x = Math.PI;
  const bellStem = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 10), darkMaterial));
  bellStem.position.y = 0.12;
  const bellClapper = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), redButtonMaterial));
  bellClapper.position.y = -0.08;
  bell.add(bellDome, bellStem, bellClapper);
  group.add(bell);

  const outputItems = new THREE.Group();
  group.add(outputItems);

  // The tray sits in the same place at every level, so finished things are
  // drawn, picked up and found the same way. Level 1 has a plain brown ledge
  // and a chute; the full machine feeds it from its rollers instead.
  const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.42), look.level === 1 ? brownPaper : notebookPaper));
  tray.position.set(0, 0.08, -1.1);
  tray.rotation.x = -0.18;
  group.add(tray);
  if (!full) {
    const chute = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.36), brownPaper));
    chute.position.set(0, 0.11, -0.79);
    chute.rotation.x = -0.18;
    group.add(chute);
  }

  for (const x of [-(width / 2 - 0.25), width / 2 - 0.25]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.36, 8), darkMaterial));
    leg.position.set(x, 0.02, 0.42);
    group.add(leg);
  }

  return {
    bell,
    bellClapper,
    buttonBaseY,
    buttons,
    crank,
    group,
    leftPupil,
    outputItems,
    planSlot,
    pressureNeedle,
    pupilRest,
    rightPupil,
    rollers,
    strandBits,
    lever,
  };
}

function disposeRig(rig: ThingMakerRig) {
  rig.group.removeFromParent();
  rig.group.traverse((node) => {
    if (node instanceof THREE.Mesh) node.geometry.dispose();
  });
}

/** Build (or rebuild) the machine's model for a level and put it in the world. */
function mountMakerRig(level: number) {
  if (!makerParent) return;
  const rebuilding = thingMaker !== null;
  if (thingMaker) disposeRig(thingMaker);
  thingMaker = createThingMakerRig(thingMakerPosition.toArray(), level);
  makerBuiltLevel = makerLookLevel(level);
  makerParent.add(thingMaker.group);
  // The tray belongs to the model, so draw what is on it onto the new one.
  renderedTraySignature = '';
  syncOutputVisuals();
  // An upgrade rings the bell (not under reduced motion).
  if (rebuilding && !reducedMotion) bellPulse = 1;
}

export function buildThingMaker(parent: THREE.Group) {
  thingMakerPosition.y = sampleTerrainHeight(thingMakerPosition.x, thingMakerPosition.z);
  makerParent = parent;
  mountMakerRig(getGameState().world.thingMaker.level);
  if (!thingMaker) return;
  makerHitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(MAKER_HIT_BOX.width, MAKER_HIT_BOX.height, MAKER_HIT_BOX.depth),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  makerHitProxy.position.set(0, MAKER_HIT_BOX.centerY, MAKER_HIT_BOX.centerZ);
  makerHitProxy.name = 'thing-maker-hit-target';
  // Parented to a rotated anchor at the machine's spot, so it never changes
  // with the model: the thing you have to click is the same at every level.
  const anchor = new THREE.Group();
  anchor.position.copy(thingMakerPosition);
  anchor.rotation.y = thingMaker.group.rotation.y;
  anchor.add(makerHitProxy);
  parent.add(anchor);
  registerMapFeature({
    color: '#2f6f72',
    id: 'thing-maker',
    kind: 'building',
    radiusX: 0.38,
    radiusZ: 0.38,
    shape: 'rect',
    x: thingMakerPosition.x,
    z: thingMakerPosition.z,
  });
  syncOutputVisuals();
}

function formatIngredients(ingredients: readonly IngredientRequirement[]) {
  return ingredients.map((ingredient) => ingredient.kind === 'exact'
    ? `${ingredient.quantity} ${RESOURCE_DEFS[ingredient.resource].label}`
    : `${ingredient.quantity} any ${RESOURCE_CATEGORIES[ingredient.family].label}`)
    .join(' · ');
}

/**
 * Ingredients as slots, each saying how many you actually hold.
 *
 * "3 any Sticks & Twigs" told a player what was needed and nothing about
 * whether they had it, so the only way to find out was to press a disabled
 * button. Each slot now carries its own have/need count and marks itself
 * short, which is also what lets the card explain a refusal without a
 * separate error line.
 */
function renderIngredientSlots(recipe: RecipeDefinition): string {
  const inventory = getGameState().player.inventory;
  return recipe.ingredients.map((ingredient) => {
    const label = ingredient.kind === 'exact'
      ? RESOURCE_DEFS[ingredient.resource].shortLabel
      : `any ${RESOURCE_CATEGORIES[ingredient.family].label}`;
    const have = ingredient.kind === 'exact'
      ? inventory[ingredient.resource] ?? 0
      : resourceIds
        .filter((resource) => RESOURCE_DEFS[resource].category === ingredient.family)
        .reduce((sum, resource) => sum + (inventory[resource] ?? 0), 0);
    const short = have < ingredient.quantity;
    return `
      <li class="craft-slot${short ? ' is-short' : ''}">
        <span class="craft-slot-label">${label}</span>
        <span class="craft-slot-count"><strong>${Math.min(have, ingredient.quantity)}</strong>/${ingredient.quantity}</span>
      </li>`;
  }).join('');
}

/**
 * The plan slot.
 *
 * Called out separately from the materials because it is not consumed and
 * you cannot gather more of it — a plan is learned once and kept. Empty it is
 * a dashed outline with a ghost mark, the same language as a drop target on
 * a web form; filled it is solid.
 */
function renderPlanSlot(recipe: RecipeDefinition): string {
  const found = getGameState().player.plans.includes(recipe.id as RecipeId);
  const comesFromTree = recipe.planSource === 'knowledge-tree';
  const missingTitle = 'Plan not learned yet';
  const missingHint = comesFromTree
    ? 'The Professor can show you the lesson'
    : 'This belongs in the starter scrapbook';
  return `
    <div class="craft-plan-slot${found ? ' is-found' : ''}">
      <span class="craft-plan-mark" aria-hidden="true"></span>
      <span class="craft-plan-copy">
        <strong>${found ? recipe.planName : missingTitle}</strong>
        <small>${found ? 'In your scrapbook' : missingHint}</small>
      </span>
    </div>`;
}

/**
 * Recipes you are about to remake something you already own with need a
 * second press.
 *
 * Making a spare to give away is a real thing to want, so this is not
 * blocked — but it costs the same materials as the first one, and a player
 * who misread the row should not lose them to a single click. Cleared on any
 * other interaction by the re-render.
 */
let confirmingRemake: RecipeId | null = null;

/** How many of a recipe's output the player already holds. */
function ownedOutputCount(output: RecipeDefinition['output']): number {
  const state = getGameState();
  switch (output.kind) {
    case 'tool': return state.player.tools[output.toolId] ?? 0;
    case 'item': return state.player.items[output.itemId] ?? 0;
    // Built in place, never held in the bag.
    case 'build-piece': return 0;
    // Know-how is learned, not held.
    case 'ability': return 0;
  }
}

function renderRecipeRung(recipeId: RecipeId, makerLevel: number, activeCraft: RecipeId | null): string {
  const recipe = RECIPE_DEFS[recipeId];
  const state = getGameState();
  const blockers = craftBlockersFor(recipeId);
  const owned = ownedOutputCount(recipe.output);
  const tool = recipe.output.kind === 'tool' ? TOOL_DEFS[recipe.output.toolId] : null;
  const duration = getCraftDuration(recipe, makerLevel).toFixed(1);
  const working = activeCraft === recipeId;
  const confirming = confirmingRemake === recipeId;
  const routeToLesson = recipe.planSource === 'knowledge-tree'
    && blockers.some((blocker) => blocker.kind === 'no-plan');

  const label = working ? 'Making…'
    : confirming ? 'Make another — press again'
      : owned > 0 ? 'Make another'
        : 'Make thing';
  const reason = blockers[0] ? describeCraftBlocker(blockers[0]) : '';
  const stateLabel = owned > 0 ? `You have ${owned}`
    : routeToLesson ? `
      <button
        class="craft-plan-route"
        type="button"
        data-open-plan-lesson="${recipeId}"
        aria-label="Learn the ${recipe.name} plan with the Professor"
      >Professor →</button>`
      : reason || 'Ready to make';

  return `
    <details class="craft-rung${owned > 0 ? ' is-owned' : ''}${blockers.length ? ' is-blocked' : ''}">
      <summary>
        <span class="craft-rung-title">
          ${tool ? `<span class="craft-rung-tier">Level ${tool.tier}</span>` : ''}
          <strong>${recipe.name}</strong>
        </span>
        <span class="craft-rung-state">${stateLabel}</span>
      </summary>
      <div class="craft-rung-body">
        <p class="craft-rung-description">${recipe.description}</p>
        ${tool ? `<p class="craft-rung-limitation">${tool.limitation}</p>` : ''}
        ${renderPlanSlot(recipe)}
        <ul class="craft-slots">${renderIngredientSlots(recipe)}</ul>
        <div class="craft-rung-actions">
          <span class="craft-rung-time">${duration}s to make</span>
          <button type="button" data-recipe-id="${recipeId}"${blockers.length || working ? ' disabled' : ''}${reason ? ` title="${reason}"` : ''}>${label}</button>
        </div>
      </div>
    </details>`;
}

/** A family's ladder, collapsed to one line until opened. */
function renderFamily(family: ToolFamilyId, makerLevel: number, activeCraft: RecipeId | null): string {
  const rungs = recipesInFamily(family);
  if (rungs.length === 0) return '';
  const definition = TOOL_FAMILIES[family];
  const state = getGameState();
  // The summary answers "where am I on this ladder?" without opening it.
  const best = rungs
    .map((recipeId) => RECIPE_DEFS[recipeId].output)
    .filter((output) => output.kind === 'tool' && (state.player.tools[output.toolId] ?? 0) > 0)
    .at(-1);
  const standing = best && best.kind === 'tool'
    ? `${TOOL_DEFS[best.toolId].name} · level ${TOOL_DEFS[best.toolId].tier} of ${rungs.length}`
    : `None yet · ${rungs.length} level${rungs.length === 1 ? '' : 's'}`;

  return `
    <details class="craft-family" open>
      <summary>
        <span class="craft-family-title"><strong>${definition.label}</strong><small>${definition.summary}</small></span>
        <span class="craft-family-standing">${standing}</span>
      </summary>
      <div class="craft-family-body">${rungs.map((recipeId) => renderRecipeRung(recipeId, makerLevel, activeCraft)).join('')}</div>
    </details>`;
}

/** Distance from the player to the machine's middle. */
export function distanceToThingMaker(avatarPosition: THREE.Vector3) {
  return Math.hypot(avatarPosition.x - thingMakerPosition.x, avatarPosition.z - thingMakerPosition.z);
}

export function isNearThingMaker(avatarPosition: THREE.Vector3) {
  const dx = avatarPosition.x - thingMakerPosition.x;
  const dz = avatarPosition.z - thingMakerPosition.z;
  return Math.hypot(dx, dz) < 2.25;
}

/** True when the pointer is directly over the visible machine rig. */
export function isThingMakerAtScreen(clientX: number, clientY: number, camera: THREE.Camera) {
  if (!thingMaker || thingMaker.group.parent?.visible === false) return false;
  makerPointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  makerRaycaster.setFromCamera(makerPointer, camera);
  const targets: THREE.Object3D[] = makerHitProxy ? [thingMaker.group, makerHitProxy] : [thingMaker.group];
  return makerRaycaster.intersectObjects(targets, true).length > 0;
}

export function isMakerPanelOpen() {
  return makerPanelOpen;
}

export function setMakerPanelOpen(open: boolean) {
  // Shares the right-hand panel slot with the mill counter.
  if (open) {
    closeMillPanel();
    closeHomePanel();
    closeGuestPanels();
  }
  makerPanelOpen = open;
  renderThingMakerPanel();
}

function addOutputThingVisual(recipe: RecipeDefinition, stackIndex: number) {
  if (!thingMaker) return;
  const colors: Record<string, string> = {
    'crease-scout': '#446c9d',
    'flimsy-shovel': '#9a623b',
    'folding-hook': '#d78f38',
    'tape-tapper': '#8c5fb0',
  };
  const row = Math.floor(stackIndex / 3);
  const column = stackIndex % 3;
  let item: THREE.Mesh;
  // Tools without artwork yet fall through to the generic paper block, so a
  // new tool can be crafted and used before it has been drawn.
  const outputArt = recipe.output.kind === 'tool' ? getToolArt(recipe.output.toolId) : null;
  if (outputArt) {
    const art = outputArt;
    item = createCutout({
      textureUrl: art.sourceUrl,
      height: 0.21,
      aspectRatio: art.aspectRatio,
      position: [-0.3 + column * 0.3, 0.145 + row * 0.022, -1.1],
      alphaTest: 0.02,
    });
    item.rotation.order = 'YXZ';
    item.rotation.set(-Math.PI / 2, 0.12 - column * 0.12, -0.08 + column * 0.06);
  } else {
    const material = createColorMaterial(colors[recipe.id] ?? '#315f5c', 0.8);
    item = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.18), material);
    item.castShadow = true;
    item.receiveShadow = true;
    item.position.set(-0.29 + (stackIndex % 4) * 0.19, 0.14 + Math.floor(stackIndex / 4) * 0.055, -1.1);
    item.rotation.set(-0.18, 0.2 - (stackIndex % 3) * 0.18, 0);
  }
  thingMaker.outputItems.add(item);
  const featureId = `crafted-${recipe.id}-${stackIndex}`;
  trayFeatureIds.push(featureId);
  registerMapFeature({
    color: colors[recipe.id] ?? '#315f5c',
    id: featureId,
    kind: 'crafted',
    radiusX: 0.12,
    radiusZ: 0.12,
    shape: 'circle',
    x: thingMakerPosition.x - 0.18 + stackIndex * 0.05,
    z: thingMakerPosition.z - 0.52,
  });
}

/**
 * Rebuild the output tray from state.
 *
 * This used to append visuals as a counter climbed, which worked only while
 * the tray was append-only. Now that items can be picked up, indices shift
 * and the tray must be rebuilt from the array it represents — otherwise
 * collecting the first of three would leave the wrong two on the machine.
 */
function syncOutputVisuals() {
  if (!thingMaker) return;
  const tray = getGameState().world.thingMaker.trayOutputs;
  const signature = tray.join('|');
  if (signature === renderedTraySignature) return;
  renderedTraySignature = signature;

  for (const child of [...thingMaker.outputItems.children]) {
    thingMaker.outputItems.remove(child);
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  }
  for (const id of trayFeatureIds) removeMapFeature(id);
  trayFeatureIds.length = 0;

  tray.forEach((recipeId, index) => {
    const recipe = RECIPE_DEFS[recipeId as RecipeId];
    if (recipe) addOutputThingVisual(recipe, index);
  });
}

/**
 * The crafted thing under a screen point, if the player is close enough.
 * Returns the tray index so the command can identify exactly which one.
 */
export function pickTrayOutputAtScreen(clientX: number, clientY: number): number | null {
  if (!thingMaker) return null;
  makerPointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  makerRaycaster.setFromCamera(makerPointer, camera);
  const hits = makerRaycaster.intersectObjects(thingMaker.outputItems.children, true);
  if (hits.length === 0) return null;

  let node: THREE.Object3D | null = hits[0].object;
  while (node) {
    const index = thingMaker.outputItems.children.indexOf(node);
    if (index >= 0) return index;
    node = node.parent;
  }
  return null;
}

export function tryCollectTrayOutput(clientX: number, clientY: number): boolean {
  const index = pickTrayOutputAtScreen(clientX, clientY);
  if (index === null) return false;
  if (!isNearThingMaker(avatar.position)) {
    showPetToast('That is still on the Thing Maker — walk over to pick it up');
    return true;
  }
  const result = dispatchGameCommand({ type: 'collectOutput', index });
  showPetToast(result.ok ? result.message : result.reason);
  if (result.ok) {
    playCozySound('chime');
    syncOutputVisuals();
  }
  return true;
}

export function hasTrayOutputAt(clientX: number, clientY: number) {
  return pickTrayOutputAtScreen(clientX, clientY) !== null;
}

function startCraft(recipeId: RecipeId) {
  const recipe = RECIPE_DEFS[recipeId];
  const result = dispatchGameCommand({ type: 'startCraft', recipeId, now: Date.now() });
  if (!result.ok) {
    makerMessage = result.reason;
    renderThingMakerPanel();
    return;
  }
  makerMessage = `Reading ${recipe.planName}. Please stand back from the emotionally important rollers.`;
  renderThingMakerPanel();
}

function finishCraft() {
  const active = getGameState().world.thingMaker.activeCraft;
  if (!active) return;
  const recipe = RECIPE_DEFS[active.recipeId];
  const result = dispatchGameCommand({ type: 'completeCraft', now: Date.now() });
  if (!result.ok) return;
  syncOutputVisuals();
  bellPulse = 1;
  makerMessage = `Ding. I made a ${recipe.output.label}. My bell and I are both very pleased.`;
  renderThingMakerPanel();
}

function upgradeThingMaker() {
  const result = dispatchGameCommand({ type: 'upgradeThingMaker' });
  if (!result.ok) {
    makerMessage = result.reason;
    renderThingMakerPanel();
    return;
  }
  bellPulse = 0.7;
  makerMessage = `${result.message} Faster things, slightly more smug machinery.`;
  renderThingMakerPanel();
}

export function renderThingMakerPanel() {
  const state = getGameState();
  const maker = state.world.thingMaker;
  const activeCraft = maker.activeCraft;
  makerPanel?.classList.toggle('is-open', makerPanelOpen);
  makerPanel?.setAttribute('aria-hidden', String(!makerPanelOpen));

  if (makerMessageElement) {
    makerMessageElement.textContent = makerMessage;
  }

  if (makerProgressElement) {
    const progress = activeCraft
      ? Math.min((Date.now() - activeCraft.startedAt) / (activeCraft.completesAt - activeCraft.startedAt), 1)
      : 0;
    makerProgressElement.style.transform = `scaleX(${progress})`;
  }

  if (makerRecipesElement) {
    // The whole ladder shows, not only the rungs you have plans for. Seeing
    // what two levels up will cost is the point of a progression; hiding it
    // until you already hold the plan tells you nothing you can act on.
    const activeRecipeId = activeCraft?.recipeId ?? null;
    const families = TOOL_FAMILY_ORDER
      .map((family) => renderFamily(family, maker.level, activeRecipeId))
      .join('');
    const others = looseRecipes();
    const otherBlock = others.length === 0 ? '' : `
      <details class="craft-family">
        <summary>
          <span class="craft-family-title"><strong>Other things</strong><small>One-offs that are not part of a ladder.</small></span>
          <span class="craft-family-standing">${others.length}</span>
        </summary>
        <div class="craft-family-body">${others.map((recipeId) => renderRecipeRung(recipeId, maker.level, activeRecipeId)).join('')}</div>
      </details>`;
    makerRecipesElement.innerHTML = families + otherBlock;
  }

  if (makerInventoryElement) {
    makerInventoryElement.innerHTML = resourceIds
      .map((resource) => `
        <div class="inventory-row">
          <span>${RESOURCE_DEFS[resource].shortLabel}</span>
          <strong>${state.player.inventory[resource] ?? 0}</strong>
        </div>
      `)
      .join('');
  }

  if (makerUpgradeButton) {
    const maxed = maker.level >= 3;
    const upgradeIngredients = MAKER_UPGRADE_INGREDIENTS[maker.level + 1] ?? [];
    const canUpgrade = Boolean(resolveIngredientAllocation(state.player.inventory, upgradeIngredients));
    makerUpgradeButton.disabled = maxed || Boolean(activeCraft) || !canUpgrade;
    makerUpgradeButton.textContent = maxed ? 'Crankworks maxed' : 'Upgrade crankworks';
    makerUpgradeButton.title = maxed ? 'The current prototype maxes out at level 3.' : `Costs ${formatIngredients(upgradeIngredients)}`;
  }

  if (makerOutputElement) {
    const outputs = maker.completedOutputs.map((id) => RECIPE_DEFS[id as RecipeId]?.output.label).filter(Boolean);
    makerOutputElement.textContent = outputs.length
      ? `Finished things: ${outputs.join(', ')}`
      : `Crankworks level ${maker.level}. Upgrade cost: ${formatIngredients(MAKER_UPGRADE_INGREDIENTS[maker.level + 1] ?? [])}.`;
  }
}

export function updateMakerPrompt(avatarPosition: THREE.Vector3, yieldToHome = false) {
  if (!makerPrompt) return;
  // When the home is the nearer thing, it gets the E key and the prompt.
  makerPrompt.hidden = makerPanelOpen || yieldToHome || !isNearThingMaker(avatarPosition);
}

function updateCrafting() {
  const activeCraft = getGameState().world.thingMaker.activeCraft;
  if (!activeCraft) return;
  if (Date.now() >= activeCraft.completesAt) {
    finishCraft();
    return;
  }

  if (makerProgressElement) {
    const progress = (Date.now() - activeCraft.startedAt) / (activeCraft.completesAt - activeCraft.startedAt);
    makerProgressElement.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
  }
}

export function updateThingMaker(delta: number, elapsed: number, avatarPosition: THREE.Vector3, active: boolean) {
  // Crafting continues even while the page is streamed out.
  updateCrafting();
  if (!thingMaker || !active) return;

  const state = getGameState();
  const activeCraft = state.world.thingMaker.activeCraft;
  const thingMakerLevel = state.world.thingMaker.level;
  const working = Boolean(activeCraft);
  const speed = working ? 6.4 + thingMakerLevel * 0.9 : 1.25;
  const bob = Math.sin(elapsed * (working ? 9 : 2.5)) * (working ? 0.026 : 0.01);

  if (makerBuiltLevel !== makerLookLevel(thingMakerLevel)) mountMakerRig(thingMakerLevel);
  const rig = thingMaker;

  rig.group.position.y = thingMakerPosition.y + bob;
  rig.crank.rotation.x += delta * speed;
  rig.rollers.forEach((roller, index) => {
    roller.rotation.y += delta * speed * (index === 0 ? 1 : -1.15);
  });
  rig.buttons.forEach((button, index) => {
    button.position.y = rig.buttonBaseY + Math.sin(elapsed * speed + index * 1.8) * (working ? 0.025 : 0.008);
  });
  if (rig.lever) rig.lever.rotation.z = Math.sin(elapsed * (working ? 5.2 : 1.4)) * (working ? 0.24 : 0.08);
  rig.planSlot.rotation.z = Math.sin(elapsed * (working ? 8 : 1.6)) * (working ? 0.025 : 0.006);
  if (rig.pressureNeedle) rig.pressureNeedle.rotation.z = -0.55 + Math.sin(elapsed * (working ? 5.8 : 1.1)) * (working ? 0.8 : 0.2);
  rig.strandBits.forEach((strand, index) => {
    strand.scale.y = 0.72 + Math.sin(elapsed * speed + index) * (working ? 0.28 : 0.08);
    strand.position.y = 0.18 + (index % 2) * 0.035 + Math.sin(elapsed * speed * 0.7 + index) * 0.012;
  });

  const localAvatar = rig.group.worldToLocal(avatarPosition.clone());
  const eyeOffsetX = THREE.MathUtils.clamp(localAvatar.x * 0.035, -0.04, 0.04);
  const eyeOffsetY = THREE.MathUtils.clamp((localAvatar.y - 0.75) * 0.025, -0.025, 0.025);
  const blink = Math.sin(elapsed * 1.7) > 0.975 && !working ? 0.35 : 1;
  rig.leftPupil.position.set(-rig.pupilRest.x + eyeOffsetX, rig.pupilRest.y + eyeOffsetY, rig.pupilRest.z);
  rig.rightPupil.position.set(rig.pupilRest.x + eyeOffsetX, rig.pupilRest.y + eyeOffsetY, rig.pupilRest.z);
  rig.leftPupil.scale.y = blink;
  rig.rightPupil.scale.y = blink;

  if (bellPulse > 0) {
    bellPulse = Math.max(0, bellPulse - delta * 1.6);
    const ring = Math.sin((1 - bellPulse) * Math.PI * 18) * bellPulse;
    rig.bell.rotation.z = ring * 0.2;
    rig.bellClapper.position.x = ring * 0.08;
  } else {
    rig.bell.rotation.z = Math.sin(elapsed * 1.2) * 0.015;
    rig.bellClapper.position.x = 0;
  }
}

/** Wire the DOM console events. Call once at startup. */
export function wireThingMakerDom() {
  makerPanel?.addEventListener('pointerdown', (event) => event.stopPropagation());
  makerPanel?.addEventListener('pointerup', (event) => event.stopPropagation());
  makerPanel?.addEventListener('wheel', (event) => event.stopPropagation());

  makerPanel?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const lessonButton = target.closest<HTMLButtonElement>('[data-open-plan-lesson]');
    if (lessonButton?.dataset.openPlanLesson) {
      event.preventDefault();
      const recipeId = lessonButton.dataset.openPlanLesson as RecipeId;
      if (!(recipeId in RECIPE_DEFS)) return;
      const nodeId = techNodeGrantingRecipe(recipeId);
      if (!nodeId) return;
      confirmingRemake = null;
      setMakerPanelOpen(false);
      openTechTreeView(nodeId);
      return;
    }

    const recipeButton = target.closest<HTMLButtonElement>('[data-recipe-id]');
    if (recipeButton?.dataset.recipeId) {
      const recipeId = recipeButton.dataset.recipeId as RecipeId;
      if (!(recipeId in RECIPE_DEFS)) return;
      const output = RECIPE_DEFS[recipeId].output;
      const state = getGameState();
      const owned = ownedOutputCount(output);
      // A spare to give away is a fair thing to want; losing a full set of
      // materials to a misread row is not. Owning one turns the first press
      // into a question.
      if (owned > 0 && confirmingRemake !== recipeId) {
        confirmingRemake = recipeId;
        makerMessage = `You already have a ${output.label}. Press again to make another — it costs the same.`;
        renderThingMakerPanel();
        return;
      }
      confirmingRemake = null;
      startCraft(recipeId);
      return;
    }
    // Any other click in the panel abandons a pending confirmation.
    if (confirmingRemake) {
      confirmingRemake = null;
      renderThingMakerPanel();
    }

    if (target.closest('[data-close-maker]')) {
      setMakerPanelOpen(false);
    }
  });

  makerUpgradeButton?.addEventListener('click', () => {
    upgradeThingMaker();
  });

  onGameStateChanged(() => {
    syncOutputVisuals();
    renderThingMakerPanel();
  });
}

export function isWheelInsideMakerPanel(event: WheelEvent) {
  return makerPanelOpen && makerPanel ? event.composedPath().includes(makerPanel) : false;
}
