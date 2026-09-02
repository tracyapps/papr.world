import * as THREE from 'three';
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

// The Manual Thing Maker: rig, idle/working animation, crafting simulation,
// and its DOM console panel. Lives on page 0,0.

type ThingMakerRig = {
  group: THREE.Group;
  crank: THREE.Group;
  rollers: THREE.Mesh[];
  lever: THREE.Group;
  buttons: THREE.Mesh[];
  bell: THREE.Group;
  bellClapper: THREE.Mesh;
  planSlot: THREE.Mesh;
  pressureNeedle: THREE.Group;
  outputItems: THREE.Group;
  leftPupil: THREE.Mesh;
  rightPupil: THREE.Mesh;
  strandBits: THREE.Mesh[];
};

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
const makerRaycaster = new THREE.Raycaster();
const makerPointer = new THREE.Vector2();

function createThingMakerRig(position: THREE.Vector3Tuple): ThingMakerRig {
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

  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 1.2), corkPaper));
  base.position.y = 0.4;
  group.add(base);

  const belly = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.58, 0.16), brownPaper));
  belly.position.set(0, 0.45, -0.68);
  group.add(belly);

  const topConsole = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 1.0), plaidPaper));
  topConsole.position.set(0, 0.83, -0.03);
  topConsole.rotation.x = -0.22;
  group.add(topConsole);

  const planSlot = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.035, 0.46), notebookPaper));
  planSlot.position.set(-0.36, 0.92, -0.2);
  planSlot.rotation.x = -0.22;
  group.add(planSlot);

  const centralColumn = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.46, 6), orangeWrapPaper));
  centralColumn.position.set(0.38, 1.06, -0.02);
  group.add(centralColumn);

  const eyeBridge = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.18), brownPaper));
  eyeBridge.position.set(0, 1.2, -0.56);
  eyeBridge.rotation.x = 0.12;
  group.add(eyeBridge);

  const leftEye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), creamMaterial));
  const rightEye = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), creamMaterial));
  leftEye.position.set(-0.24, 1.25, -0.67);
  rightEye.position.set(0.24, 1.25, -0.67);
  group.add(leftEye, rightEye);

  const leftPupil = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), pupilMaterial));
  const rightPupil = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), pupilMaterial));
  leftPupil.position.set(-0.24, 1.23, -0.81);
  rightPupil.position.set(0.24, 1.23, -0.81);
  group.add(leftPupil, rightPupil);

  const crank = new THREE.Group();
  crank.position.set(1.05, 0.57, -0.02);
  const crankWheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.034, 8, 34), darkMaterial));
  crankWheel.rotation.y = Math.PI / 2;
  const crankHandle = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), redButtonMaterial));
  crankHandle.position.set(0.04, 0.34, 0);
  crank.add(crankWheel, crankHandle);
  group.add(crank);

  const rollers: THREE.Mesh[] = [];
  for (const [index, y] of [0.62, 0.38].entries()) {
    const roller = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.34, 24), index === 0 ? blueMaterial : brassMaterial));
    roller.position.set(0, y, -0.78);
    roller.rotation.z = Math.PI / 2;
    rollers.push(roller);
    group.add(roller);
  }

  const strandBits: THREE.Mesh[] = [];
  for (let index = 0; index < 7; index += 1) {
    const strand = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), yellowButtonMaterial));
    strand.position.set(-0.36 + index * 0.12, 0.19 + (index % 2) * 0.035, -0.91);
    strand.rotation.z = (index % 2 === 0 ? 0.04 : -0.04);
    strandBits.push(strand);
    group.add(strand);
  }

  const lever = new THREE.Group();
  lever.position.set(-0.77, 0.98, 0.1);
  const leverPost = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 12), darkMaterial));
  leverPost.rotation.z = -0.55;
  const leverKnob = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), tealButtonMaterial));
  leverKnob.position.set(0.1, 0.17, 0);
  lever.add(leverPost, leverKnob);
  group.add(lever);

  const buttons: THREE.Mesh[] = [];
  const buttonMaterials = [redButtonMaterial, tealButtonMaterial, yellowButtonMaterial];
  for (let index = 0; index < 3; index += 1) {
    const button = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.045, 18), buttonMaterials[index]));
    button.position.set(0.12 + index * 0.2, 0.93, -0.36);
    button.rotation.x = Math.PI / 2 - 0.22;
    buttons.push(button);
    group.add(button);
  }

  const pressureNeedle = new THREE.Group();
  pressureNeedle.position.set(0.67, 0.95, -0.18);
  const gauge = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 28), creamMaterial));
  gauge.rotation.x = Math.PI / 2 - 0.22;
  const needle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.18, 0.018), redButtonMaterial));
  needle.position.y = 0.07;
  pressureNeedle.add(gauge, needle);
  group.add(pressureNeedle);

  const bell = new THREE.Group();
  bell.position.set(-0.66, 1.13, 0.2);
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

  const tray = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 0.42), notebookPaper));
  tray.position.set(0, 0.08, -1.1);
  tray.rotation.x = -0.18;
  group.add(tray);

  for (const x of [-0.7, 0.7]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.36, 8), darkMaterial));
    leg.position.set(x, 0.02, 0.42);
    group.add(leg);
  }

  return {
    bell,
    bellClapper,
    buttons,
    crank,
    group,
    leftPupil,
    outputItems,
    planSlot,
    pressureNeedle,
    rightPupil,
    rollers,
    strandBits,
    lever,
  };
}

export function buildThingMaker(parent: THREE.Group) {
  thingMakerPosition.y = sampleTerrainHeight(thingMakerPosition.x, thingMakerPosition.z);
  thingMaker = createThingMakerRig(thingMakerPosition.toArray());
  parent.add(thingMaker.group);
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

function renderRecipeRung(recipeId: RecipeId, makerLevel: number, activeCraft: RecipeId | null): string {
  const recipe = RECIPE_DEFS[recipeId];
  const state = getGameState();
  const blockers = craftBlockersFor(recipeId);
  const owned = recipe.output.kind === 'tool'
    ? state.player.tools[recipe.output.toolId] ?? 0
    : recipe.output.kind === 'resource'
      ? state.player.inventory[recipe.output.resource] ?? 0
      : state.player.items[recipe.output.itemId] ?? 0;
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
  return makerRaycaster.intersectObject(thingMaker.group, true).length > 0;
}

export function isMakerPanelOpen() {
  return makerPanelOpen;
}

export function setMakerPanelOpen(open: boolean) {
  makerPanelOpen = open;
  renderThingMakerPanel();
}

function addOutputThingVisual(recipe: RecipeDefinition, stackIndex: number) {
  if (!thingMaker) return;
  const colors: Record<string, string> = {
    'bound-lumber': '#6b4423',
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

export function updateMakerPrompt(avatarPosition: THREE.Vector3) {
  if (!makerPrompt) return;
  makerPrompt.hidden = makerPanelOpen || !isNearThingMaker(avatarPosition);
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

  thingMaker.group.position.y = thingMakerPosition.y + bob;
  thingMaker.crank.rotation.x += delta * speed;
  thingMaker.rollers.forEach((roller, index) => {
    roller.rotation.y += delta * speed * (index === 0 ? 1 : -1.15);
  });
  thingMaker.buttons.forEach((button, index) => {
    button.position.y = 0.93 + Math.sin(elapsed * speed + index * 1.8) * (working ? 0.025 : 0.008);
  });
  thingMaker.lever.rotation.z = Math.sin(elapsed * (working ? 5.2 : 1.4)) * (working ? 0.24 : 0.08);
  thingMaker.planSlot.rotation.z = Math.sin(elapsed * (working ? 8 : 1.6)) * (working ? 0.025 : 0.006);
  thingMaker.pressureNeedle.rotation.z = -0.55 + Math.sin(elapsed * (working ? 5.8 : 1.1)) * (working ? 0.8 : 0.2);
  thingMaker.strandBits.forEach((strand, index) => {
    strand.scale.y = 0.72 + Math.sin(elapsed * speed + index) * (working ? 0.28 : 0.08);
    strand.position.y = 0.18 + (index % 2) * 0.035 + Math.sin(elapsed * speed * 0.7 + index) * 0.012;
  });

  const localAvatar = thingMaker.group.worldToLocal(avatarPosition.clone());
  const eyeOffsetX = THREE.MathUtils.clamp(localAvatar.x * 0.035, -0.04, 0.04);
  const eyeOffsetY = THREE.MathUtils.clamp((localAvatar.y - 0.75) * 0.025, -0.025, 0.025);
  const blink = Math.sin(elapsed * 1.7) > 0.975 && !working ? 0.35 : 1;
  thingMaker.leftPupil.position.set(-0.24 + eyeOffsetX, 1.23 + eyeOffsetY, -0.81);
  thingMaker.rightPupil.position.set(0.24 + eyeOffsetX, 1.23 + eyeOffsetY, -0.81);
  thingMaker.leftPupil.scale.y = blink;
  thingMaker.rightPupil.scale.y = blink;

  if (bellPulse > 0) {
    bellPulse = Math.max(0, bellPulse - delta * 1.6);
    const ring = Math.sin((1 - bellPulse) * Math.PI * 18) * bellPulse;
    thingMaker.bell.rotation.z = ring * 0.2;
    thingMaker.bellClapper.position.x = ring * 0.08;
  } else {
    thingMaker.bell.rotation.z = Math.sin(elapsed * 1.2) * 0.015;
    thingMaker.bellClapper.position.x = 0;
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
      const owned = output.kind === 'tool'
        ? state.player.tools[output.toolId] ?? 0
        : output.kind === 'resource'
          ? state.player.inventory[output.resource] ?? 0
          : state.player.items[output.itemId] ?? 0;
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
