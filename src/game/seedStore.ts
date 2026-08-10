import * as THREE from 'three';
import { shadowed } from '../render/builders';
import { createColorMaterial, getMaterial } from '../render/materials';
import { dispatchGameCommand } from '../sim/commands';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';
import { SEED_DEFS, formatGrowthTime, type SeedId } from '../sim/catalogs/seeds';
import {
  SEED_STORE,
  SEED_STORE_BARTER,
  seedStoreBuyPrice,
  seedStorePurchaseLimit,
  seedStoreSellPrice,
} from '../sim/catalogs/shops';
import { getGameState, onGameStateChanged } from '../sim/state';
import { registerMapFeature } from '../world/mapFeatures';
import { buildPlantStageVisual } from '../world/plantRuntime';
import {
  GREENHOUSE_COUNTER,
  GREENHOUSE_LENGTH,
  GREENHOUSE_PLANTERS,
  GREENHOUSE_POSITION,
  GREENHOUSE_WIDTH,
  PIP_LOCAL_POSITION,
  greenhouseWorldPoint,
  groundedLocalY,
} from '../world/seedStoreLayout';
import { sampleTerrainHeight } from '../world/terrain';
import { buildCritterRig, type CritterRig } from './critterRigs';
import { generateCritterParams } from './critterVariation';
import { registerCozyObject } from './cozyInteractions';
import { setMakerPanelOpen } from './thingMaker';

const panel = document.querySelector<HTMLElement>('#seed-store-panel');
const balanceElement = document.querySelector<HTMLElement>('#seed-store-balance');
const messageElement = document.querySelector<HTMLElement>('#seed-store-message');
const stockElement = document.querySelector<HTMLElement>('#seed-store-stock');
const basketElement = document.querySelector<HTMLElement>('#seed-store-basket');
const promptElement = document.querySelector<HTMLElement>('#seed-store-interaction-prompt');

let panelOpen = false;
let message = '“Every garden starts folded up small.” — Pip';
let shopkeeperRig: CritterRig | null = null;
const buyQuantities = new Map<SeedId, number>();
const sellQuantities = new Map<ResourceId, number>();

function chipBuyLimit(seedId: SeedId) {
  return seedStorePurchaseLimit(seedId, 'chips', getGameState().player);
}

function barterBuyLimit() {
  return seedStorePurchaseLimit(SEED_STORE.sells[0], 'barter', getGameState().player);
}

function buyQuantity(seedId: SeedId) {
  const limit = Math.max(1, chipBuyLimit(seedId), barterBuyLimit());
  const quantity = Math.max(1, Math.min(limit, buyQuantities.get(seedId) ?? 1));
  buyQuantities.set(seedId, quantity);
  return quantity;
}

function sellQuantity(resource: ResourceId) {
  const limit = Math.max(1, getGameState().player.inventory[resource] ?? 0);
  const quantity = Math.max(1, Math.min(limit, sellQuantities.get(resource) ?? 1));
  sellQuantities.set(resource, quantity);
  return quantity;
}

const pipWorldPosition = greenhouseWorldPoint(PIP_LOCAL_POSITION.x, PIP_LOCAL_POSITION.z);
export const seedStorePosition = new THREE.Vector3(pipWorldPosition.x, 0, pipWorldPosition.z);

export function isNearSeedStore(avatarPosition: THREE.Vector3) {
  return Math.hypot(avatarPosition.x - pipWorldPosition.x, avatarPosition.z - pipWorldPosition.z) < 3.25;
}

function packetColor(seedId: SeedId): string {
  const seed = SEED_DEFS[seedId];
  if ('accent' in seed && seed.accent) return seed.accent;
  return seed.effect === 'mending' ? '#84a768' : '#e5ad49';
}

function canvasSign(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#f8e9b8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#72502f';
    context.lineWidth = 18;
    context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    context.fillStyle = '#4c653b';
    context.font = '900 74px Georgia, serif';
    context.textAlign = 'center';
    context.fillText('PIP’S', canvas.width / 2, 95);
    context.fillStyle = '#72502f';
    context.font = '800 48px system-ui, sans-serif';
    context.fillText('WALK-IN GARDEN', canvas.width / 2, 164);
    context.fillStyle = '#6f8d4e';
    context.font = '700 25px system-ui, sans-serif';
    context.fillText('seeds • starts • trades', canvas.width / 2, 216);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.94 });
  return shadowed(new THREE.Mesh(new THREE.PlaneGeometry(2.25, 1.12), material));
}

function plantLabel(seedId: SeedId) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#fff2c8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#795638';
    context.lineWidth = 10;
    context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    context.fillStyle = '#3f5834';
    context.font = '800 32px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(SEED_DEFS[seedId].name.replace(/ Seeds$/, ''), canvas.width / 2, canvas.height / 2, 292);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.315),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.94, side: THREE.DoubleSide }),
  );
}

function seedPacket(seedId: SeedId, x: number, y: number, z: number) {
  const packet = new THREE.Group();
  const envelope = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.32, 0.035),
    createColorMaterial('#f7e7b1', 0.94),
  ));
  const label = shadowed(new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.13, 0.015),
    createColorMaterial(packetColor(seedId), 0.84),
  ));
  label.position.set(0, -0.015, -0.027);
  packet.add(envelope, label);
  packet.position.set(x, y, z);
  packet.rotation.x = -0.08;
  return packet;
}

function buildPip() {
  const params = generateCritterParams('squirrel', 7319);
  params.name = 'Pip';
  params.scale = 0.9;
  params.bodyTextureUrl = null;
  params.bodyColor = '#b87946';
  params.accentColor = '#f0d5a1';
  const rig = buildCritterRig('squirrel', params);

  // Three short back stripes are the clearest silhouette cue separating Pip
  // from the clearing's squirrels without forking the whole critter system.
  const stripeMaterial = createColorMaterial('#55351f', 0.86);
  for (const x of [-0.085, 0, 0.085]) {
    const stripe = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.42), stripeMaterial));
    stripe.position.set(x, 0.43, 0.04);
    stripe.rotation.x = -0.05;
    rig.group.add(stripe);
  }
  return rig;
}

export function buildSeedStore(parent: THREE.Group) {
  const groundY = sampleTerrainHeight(GREENHOUSE_POSITION.x, GREENHOUSE_POSITION.z);
  const store = new THREE.Group();
  store.name = 'Pip’s Seed & Garden';
  store.position.set(GREENHOUSE_POSITION.x, groundY, GREENHOUSE_POSITION.z);

  const cork = getMaterial('paper.cork');
  const brown = getMaterial('paper.brown');
  const green = getMaterial('paper.green');
  const notebook = getMaterial('paper.notebook');
  const soil = getMaterial('paper.brown.warm');

  const localTerrainY = (x: number, z: number, offset = 0) => {
    const world = greenhouseWorldPoint(x, z);
    return groundedLocalY(groundY, sampleTerrainHeight(world.x, world.z), offset);
  };

  // A pale notebook aisle connects both open ends. Planters sit on leafy
  // meadow ground beside it rather than on one giant shop-floor rectangle.
  const aisleLength = GREENHOUSE_LENGTH + 1.5;
  const aisleSegments = Math.ceil(aisleLength / 1.35);
  const aisleSegmentLength = aisleLength / aisleSegments + 0.04;
  for (let index = 0; index < aisleSegments; index += 1) {
    const x = -aisleLength / 2 + aisleSegmentLength / 2 + index * (aisleLength / aisleSegments);
    const aisle = shadowed(new THREE.Mesh(new THREE.BoxGeometry(aisleSegmentLength, 0.035, 1.55), notebook));
    aisle.position.set(x, localTerrainY(x, 0, 0.025), 0);
    store.add(aisle);
  }

  for (const planter of GREENHOUSE_PLANTERS) {
    const bed = new THREE.Group();
    bed.position.set(planter.x, localTerrainY(planter.x, planter.z), planter.z);

    const box = shadowed(new THREE.Mesh(new THREE.BoxGeometry(planter.width, 0.48, planter.depth), cork));
    box.position.y = 0.25;
    const soilBed = shadowed(new THREE.Mesh(new THREE.BoxGeometry(planter.width - 0.22, 0.08, planter.depth - 0.22), soil));
    soilBed.position.y = 0.5;
    bed.add(box, soilBed);

    const plant = buildPlantStageVisual(planter.seedId, 'bloom', 1);
    const plantScale = SEED_DEFS[planter.seedId].visual === 'stalk' ? 1.45 : 1.6;
    plant.scale.setScalar(plantScale);
    plant.position.y = 0.55;
    bed.add(plant);

    const label = plantLabel(planter.seedId);
    const aisleSide = planter.z < 0 ? 1 : -1;
    label.position.set(0, 0.8, aisleSide * (planter.depth / 2 + 0.025));
    label.rotation.y = planter.z < 0 ? 0 : Math.PI;
    const labelStem = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.55, 0.045), brown));
    labelStem.position.set(0, 0.55, aisleSide * (planter.depth / 2 - 0.02));
    bed.add(labelStem, label);
    store.add(bed);
  }

  // Tall open frames make this a place to walk through, not another low
  // counter awning. The rafters stay uncovered: a broad translucent sheet
  // becomes a full-screen filter from the game's elevated camera, whereas the
  // open paper skeleton keeps every plant and the meadow visible.
  const eaveY = 2.65;
  const ridgeY = 3.58;
  const halfWidth = GREENHOUSE_WIDTH / 2;
  const roofSpan = Math.hypot(halfWidth, ridgeY - eaveY);
  const roofAngle = Math.atan2(ridgeY - eaveY, halfWidth);
  const frameCount = Math.max(3, Math.ceil(GREENHOUSE_LENGTH / 2.5) + 1);
  for (let index = 0; index < frameCount; index += 1) {
    const x = -GREENHOUSE_LENGTH / 2 + index * (GREENHOUSE_LENGTH / (frameCount - 1));
    for (const side of [-1, 1] as const) {
      const ground = localTerrainY(x, side * halfWidth);
      const height = eaveY - ground;
      const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, height, 0.11), brown));
      post.position.set(x, ground + height / 2, side * halfWidth);
      store.add(post);

      const rafter = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, roofSpan), brown));
      rafter.position.set(x, (eaveY + ridgeY) / 2, side * halfWidth / 2);
      rafter.rotation.x = side * roofAngle;
      store.add(rafter);
    }
  }
  for (const z of [-halfWidth, 0, halfWidth]) {
    const beam = shadowed(new THREE.Mesh(
      new THREE.BoxGeometry(GREENHOUSE_LENGTH + 0.15, 0.1, 0.11),
      z === 0 ? green : brown,
    ));
    beam.position.set(0, z === 0 ? ridgeY : eaveY, z);
    store.add(beam);
  }

  // The old full-width sales counter becomes a small side potting desk, so it
  // cannot close the aisle. Seed packets still give the shopping interaction
  // a visible home beside the living displays.
  const counterY = localTerrainY(GREENHOUSE_COUNTER.x, GREENHOUSE_COUNTER.z);
  const counter = shadowed(new THREE.Mesh(new THREE.BoxGeometry(
    GREENHOUSE_COUNTER.width, 0.68, GREENHOUSE_COUNTER.depth,
  ), cork));
  counter.position.set(GREENHOUSE_COUNTER.x, counterY + 0.34, GREENHOUSE_COUNTER.z);
  const counterTop = shadowed(new THREE.Mesh(new THREE.BoxGeometry(
    GREENHOUSE_COUNTER.width + 0.16, 0.07, GREENHOUSE_COUNTER.depth + 0.12,
  ), notebook));
  counterTop.position.set(GREENHOUSE_COUNTER.x, counterY + 0.72, GREENHOUSE_COUNTER.z);
  store.add(counter, counterTop);
  SEED_STORE.sells.forEach((seedId, index) => {
    const packet = seedPacket(seedId, 0, 0, 0);
    packet.scale.setScalar(0.72);
    packet.position.set(
      GREENHOUSE_COUNTER.x - 0.65 + index * 0.215,
      counterY + 0.91,
      GREENHOUSE_COUNTER.z,
    );
    packet.rotation.y = -0.12;
    store.add(packet);
  });

  const signX = -GREENHOUSE_LENGTH / 2 - 0.08;
  const signZ = -GREENHOUSE_WIDTH / 2 + 0.65;
  const signGround = localTerrainY(signX, signZ);
  const sign = canvasSign();
  sign.position.set(signX, signGround + 1.6, signZ);
  sign.rotation.y = -Math.PI / 2;
  const signPost = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.25, 0.11), brown));
  signPost.position.set(signX + 0.03, signGround + 1.13, signZ);
  store.add(signPost, sign);

  shopkeeperRig = buildPip();
  shopkeeperRig.group.position.set(
    PIP_LOCAL_POSITION.x,
    localTerrainY(PIP_LOCAL_POSITION.x, PIP_LOCAL_POSITION.z, shopkeeperRig.groundOffset),
    PIP_LOCAL_POSITION.z,
  );
  shopkeeperRig.group.rotation.y = Math.PI / 2;
  store.add(shopkeeperRig.group);

  // Two overlapping interaction volumes cover the long house while keeping
  // each volume's origin within cozy-interaction reach from its half.
  const interactionTargets = [-1, 1].map((side) => {
    const target = new THREE.Mesh(
      new THREE.BoxGeometry(GREENHOUSE_LENGTH / 2 + 0.5, 3.4, GREENHOUSE_WIDTH),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    target.position.set(side * GREENHOUSE_LENGTH / 4, 1.7, 0);
    store.add(target);
    return target;
  });
  parent.add(store);

  interactionTargets.forEach((target, index) => {
    registerCozyObject({
      id: `pips-seed-store:${index}`,
      label: 'Pip’s Seed & Garden',
      messages: ['Grown plants line both sides of the path. Pip keeps every seed on display.'],
      object: target,
      reaction: 'bob',
      sound: 'rustle',
      onInteract: () => setSeedStorePanelOpen(true),
    });
  });
  registerMapFeature({
    id: 'pips-seed-store',
    kind: 'building',
    x: GREENHOUSE_POSITION.x,
    z: GREENHOUSE_POSITION.z,
    radiusX: GREENHOUSE_LENGTH / 2,
    radiusZ: GREENHOUSE_WIDTH / 2,
    color: '#6f8d4e',
    shape: 'rect',
  });
}

function renderStock() {
  if (!stockElement) return;
  const state = getGameState();
  stockElement.innerHTML = SEED_STORE.sells.map((seedId) => {
    const seed = SEED_DEFS[seedId];
    const price = seedStoreSellPrice(seedId);
    const quantity = buyQuantity(seedId);
    const chipLimit = chipBuyLimit(seedId);
    const barterLimit = barterBuyLimit();
    const overallLimit = Math.max(chipLimit, barterLimit);
    const chipsShort = quantity > chipLimit;
    const fiberShort = quantity > barterLimit;
    return `
      <article class="seed-shop-card">
        <span class="seed-shop-swatch" style="--seed-color: ${packetColor(seedId)}" aria-hidden="true"></span>
        <div class="seed-shop-card-copy">
          <div class="seed-shop-card-title"><strong>${seed.name.replace(/ Seeds$/, '')}</strong><span>You have ${state.player.inventory[seedId] ?? 0}</span></div>
          <p>${seed.description} <span class="seed-shop-grow-time">Grows in ${formatGrowthTime(seedId)}.</span></p>
          <div class="seed-shop-quantity" aria-label="${seed.name} quantity">
            <span>Amount</span>
            <button type="button" data-adjust-buy="${seedId}" data-quantity-delta="-1" ${quantity <= 1 ? 'disabled' : ''} aria-label="Buy one fewer">−</button>
            <input type="number" min="1" max="${Math.max(1, overallLimit)}" value="${quantity}" inputmode="numeric" data-buy-quantity="${seedId}" aria-label="Number of ${seed.name}">
            <button type="button" data-adjust-buy="${seedId}" data-quantity-delta="1" ${quantity >= overallLimit ? 'disabled' : ''} aria-label="Buy one more">+</button>
            <button type="button" class="seed-shop-max" data-max-buy="${seedId}" data-payment="chips" ${chipLimit < 1 ? 'disabled' : ''}>Max ₡</button>
            <button type="button" class="seed-shop-max" data-max-buy="${seedId}" data-payment="barter" ${barterLimit < 1 ? 'disabled' : ''}>Max trade</button>
          </div>
          <div class="seed-shop-actions">
            <button type="button" data-buy-seed="${seedId}" data-payment="chips" ${chipsShort ? 'disabled' : ''}>Buy ${quantity} · ₡${price * quantity}</button>
            <button type="button" data-buy-seed="${seedId}" data-payment="barter" ${fiberShort ? 'disabled' : ''}>Trade ${quantity} · ${SEED_STORE_BARTER.quantity * quantity} fiber</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

function renderBasket() {
  if (!basketElement) return;
  const state = getGameState();
  const held = SEED_STORE.buys.filter((resource) => (state.player.inventory[resource] ?? 0) > 0);
  basketElement.innerHTML = held.length
    ? held.map((resource) => {
      const owned = state.player.inventory[resource] ?? 0;
      const quantity = sellQuantity(resource);
      return `
      <div class="seed-shop-basket-row">
        <span>${RESOURCE_CORE_DEFS[resource].shortLabel}<small>${owned} in your scrapbook</small></span>
        <div class="seed-shop-sell-controls">
          <div class="seed-shop-quantity" aria-label="${RESOURCE_CORE_DEFS[resource].shortLabel} quantity">
            <button type="button" data-adjust-sell="${resource}" data-quantity-delta="-1" ${quantity <= 1 ? 'disabled' : ''} aria-label="Sell one fewer">−</button>
            <input type="number" min="1" max="${owned}" value="${quantity}" inputmode="numeric" data-sell-quantity="${resource}" aria-label="Number of ${RESOURCE_CORE_DEFS[resource].shortLabel} to sell">
            <button type="button" data-adjust-sell="${resource}" data-quantity-delta="1" ${quantity >= owned ? 'disabled' : ''} aria-label="Sell one more">+</button>
            <button type="button" class="seed-shop-max" data-max-sell="${resource}">Max</button>
          </div>
          <button type="button" data-sell-resource="${resource}">Sell ${quantity} · ₡${seedStoreBuyPrice(resource) * quantity}</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="seed-shop-empty">Your basket is empty. Pip buys anything you can gather or grow.</p>';
}

export function renderSeedStorePanel() {
  if (!panel) return;
  const state = getGameState();
  panel.classList.toggle('is-open', panelOpen);
  panel.setAttribute('aria-hidden', String(!panelOpen));
  if (balanceElement) balanceElement.textContent = `Your pouch · ₡${state.player.chips}`;
  if (messageElement) messageElement.textContent = message;
  renderStock();
  renderBasket();
}

export function setSeedStorePanelOpen(open: boolean) {
  if (open) setMakerPanelOpen(false);
  panelOpen = open;
  renderSeedStorePanel();
}

export function isSeedStorePanelOpen() {
  return panelOpen;
}

export function closeSeedStorePanel() {
  if (!panelOpen) return false;
  setSeedStorePanelOpen(false);
  return true;
}

export function wireSeedStoreDom() {
  panel?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-close-seed-store]')) {
      setSeedStorePanelOpen(false);
      return;
    }
    const adjustBuy = target.closest<HTMLButtonElement>('[data-adjust-buy]');
    if (adjustBuy?.dataset.adjustBuy) {
      const seedId = adjustBuy.dataset.adjustBuy as SeedId;
      buyQuantities.set(seedId, buyQuantity(seedId) + Number(adjustBuy.dataset.quantityDelta ?? 0));
      renderSeedStorePanel();
      return;
    }
    const maxBuy = target.closest<HTMLButtonElement>('[data-max-buy]');
    if (maxBuy?.dataset.maxBuy) {
      const seedId = maxBuy.dataset.maxBuy as SeedId;
      buyQuantities.set(seedId, maxBuy.dataset.payment === 'barter' ? barterBuyLimit() : chipBuyLimit(seedId));
      renderSeedStorePanel();
      return;
    }
    const adjustSell = target.closest<HTMLButtonElement>('[data-adjust-sell]');
    if (adjustSell?.dataset.adjustSell) {
      const resource = adjustSell.dataset.adjustSell as ResourceId;
      sellQuantities.set(resource, sellQuantity(resource) + Number(adjustSell.dataset.quantityDelta ?? 0));
      renderSeedStorePanel();
      return;
    }
    const maxSell = target.closest<HTMLButtonElement>('[data-max-sell]');
    if (maxSell?.dataset.maxSell) {
      const resource = maxSell.dataset.maxSell as ResourceId;
      sellQuantities.set(resource, getGameState().player.inventory[resource] ?? 1);
      renderSeedStorePanel();
      return;
    }
    const buy = target.closest<HTMLButtonElement>('[data-buy-seed]');
    if (buy?.dataset.buySeed) {
      const result = dispatchGameCommand({
        type: 'buySeed',
        shopId: SEED_STORE.id,
        seedId: buy.dataset.buySeed as SeedId,
        payment: buy.dataset.payment === 'barter' ? 'barter' : 'chips',
        quantity: buyQuantity(buy.dataset.buySeed as SeedId),
      });
      message = result.ok ? result.message : result.reason;
      renderSeedStorePanel();
      return;
    }
    const sell = target.closest<HTMLButtonElement>('[data-sell-resource]');
    if (sell?.dataset.sellResource) {
      const result = dispatchGameCommand({
        type: 'sellResource',
        shopId: SEED_STORE.id,
        resource: sell.dataset.sellResource as ResourceId,
        quantity: sellQuantity(sell.dataset.sellResource as ResourceId),
      });
      message = result.ok ? result.message : result.reason;
      renderSeedStorePanel();
    }
  });
  panel?.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const value = Number(input.value);
    if (input.dataset.buyQuantity) {
      const seedId = input.dataset.buyQuantity as SeedId;
      buyQuantities.set(seedId, Number.isSafeInteger(value) ? value : 1);
      renderSeedStorePanel();
    }
    if (input.dataset.sellQuantity) {
      const resource = input.dataset.sellQuantity as ResourceId;
      sellQuantities.set(resource, Number.isSafeInteger(value) ? value : 1);
      renderSeedStorePanel();
    }
  });
  onGameStateChanged(renderSeedStorePanel);
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('seedStorePreview') === '1') {
    panelOpen = true;
  }
  renderSeedStorePanel();
}

export function isWheelInsideSeedStorePanel(event: WheelEvent) {
  return panelOpen && panel ? event.composedPath().includes(panel) : false;
}

export function updateSeedStorePrompt(avatarPosition: THREE.Vector3) {
  if (!promptElement) return;
  promptElement.hidden = panelOpen || !isNearSeedStore(avatarPosition);
}

export function updateSeedStore(delta: number, elapsed: number, active: boolean) {
  if (!active || !shopkeeperRig) return;
  shopkeeperRig.animate(elapsed, delta, false, 0, false);
}
