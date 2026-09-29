import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_CASE_TEMPLATE, type CaseItem } from '../../shared/src/index';
import type { CaseView } from './cases';

// Controllable stand-ins for the registries and stores the visuals read.
// The module under test never imports these helper names; they exist so the
// tests can drive each mocked module's answers.
const h = vi.hoisted(() => ({
  /** Local piece visuals, keyed by piece id (see placedPieceInteractions.ts). */
  localVisuals: new Map<string, unknown>(),
  /** Server-echo piece visuals, keyed by piece id (see sharedPieceVisuals.ts). */
  sharedVisuals: new Map<string, unknown>(),
  /** The local save's pages, as anchorFor's position fallback reads them. */
  pages: {} as Record<string, { placedPieces: Record<string, unknown> }>,
  views: [] as CaseView[],
}));

vi.mock('../sim/state', () => ({
  getGameState: () => ({ world: { pages: h.pages } }),
  onGameStateChanged: () => () => {},
}));

vi.mock('./placedPieceInteractions', () => ({
  getPlacedPieceVisual: (id: string) => h.localVisuals.get(id) ?? null,
}));

vi.mock('../net/sharedPieceVisuals', () => ({
  getSharedPieceVisual: (id: string) => h.sharedVisuals.get(id) ?? null,
}));

vi.mock('./cases', () => ({
  listCases: () => h.views,
  subscribeCases: () => () => {},
}));

vi.mock('../sim/catalogs/trinkets', () => ({
  getTrinketDef: () => ({ label: 'A keepsake' }),
}));

vi.mock('./trinketRigs', () => ({
  buildTrinketRig: () => {
    // A tall, wide keepsake, so fitting it to a slot has something to do.
    const rig = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6));
    body.position.y = 0.4;
    rig.add(body);
    return rig;
  },
  animateTrinketRig: (group: THREE.Group) => { group.userData.animated = (group.userData.animated ?? 0) + 1; },
}));

vi.mock('../world/resources', () => ({ RESOURCE_DEFS: {} }));
vi.mock('../render/materials', () => ({ getMaterial: () => new THREE.MeshBasicMaterial() }));

vi.mock('../world/buildPieceVisuals', () => ({
  DISPLAY_CASE_LID: 'display-case-lid',
  DISPLAY_CASE_SHAPE: {
    baseTop: 0.36, levelHeight: 0.62, sheetHalf: 0.0175,
    riser: { width: 1.1, height: 0.08, depth: 0.22, z: -0.15 },
    rows: [{ z: 0.12, raised: false }, { z: -0.15, raised: true }],
    columns: [-0.42, -0.14, 0.14, 0.42],
    slotFootprint: 0.3, slotHeight: 0.44,
  },
  displayCaseFloorY: (level: number) => 0.36 + level * 0.62,
  displayCaseLidY: (shelves: number) => 0.36 + shelves * 0.62 + 0.02,
  buildDisplayCaseLevel: (level: number) => Object.assign(new THREE.Group(), { name: `display-case-level-${level}` }),
}));

const { caseSlotPositions, syncCaseTrinketVisuals, updateCaseTrinkets } = await import('./caseTrinketVisuals');

const TRINKETS = 'case-trinkets';

function localPiece(id: string, x: number, z: number, page = '0,0') {
  return { id, templateKey: DISPLAY_CASE_TEMPLATE, x, z, rotY: 0, material: '', makerId: 'me', page };
}

function sharedView(id: string, x: number, z: number, items: CaseItem[], page = '0,0', shelves = 1): CaseView {
  return {
    handle: { key: `shared:${id}`, source: 'shared', id, x, z, page },
    mode: 'show', label: '', items, limit: null, shelves, capacity: shelves * 8, material: '', mine: true, detail: null,
  };
}

function trinketItem(defId = 'shell'): CaseItem {
  return { kind: 'trinket', defId, seed: 1 };
}

function findSlotGroup(anchor: THREE.Object3D): THREE.Object3D | undefined {
  return anchor.children.find((child) => child.name === TRINKETS);
}

beforeEach(() => {
  h.localVisuals.clear();
  h.sharedVisuals.clear();
  h.pages = {};
  h.views = [];
});

afterEach(() => {
  // An empty case list makes the module's own cleanup take everything down.
  h.views = [];
  syncCaseTrinketVisuals();
});

describe('display case trinket visuals', () => {
  it('anchors a shared case you built to your own visible piece, not the hidden echo', () => {
    // The echo the server sends back carries its own id, and
    // sharedPieceVisuals.ts has hidden it because your local piece stands in
    // for it -- parenting the trinkets to the echo would hide them with it.
    const own = new THREE.Group();
    const echo = new THREE.Group();
    echo.visible = false;
    h.pages['0,0'] = { placedPieces: { 'local-1': localPiece('local-1', 10, 10) } };
    h.localVisuals.set('local-1', own);
    h.sharedVisuals.set('echo-1', echo);
    h.views = [sharedView('echo-1', 10, 10, [trinketItem()])];

    syncCaseTrinketVisuals();

    expect(findSlotGroup(own)).toBeDefined();
    expect(findSlotGroup(echo)).toBeUndefined();
  });

  it('anchors a neighbor\'s case to the shared echo when nothing local stands there', () => {
    const echo = new THREE.Group();
    h.sharedVisuals.set('echo-2', echo);
    h.views = [sharedView('echo-2', 20, 20, [trinketItem()])];

    syncCaseTrinketVisuals();

    expect(findSlotGroup(echo)).toBeDefined();
  });

  it('ties a shared case back to the local piece on the case\'s own page only', () => {
    // An interior page reuses surface coordinates; a local piece inside the
    // home must not answer for a surface case standing at the same spot.
    const surfaceEcho = new THREE.Group();
    h.sharedVisuals.set('echo-3', surfaceEcho);
    h.pages['in:home:0,0'] = { placedPieces: { 'local-3': localPiece('local-3', 10, 10, 'in:home:0,0') } };
    h.localVisuals.set('local-3', new THREE.Group());
    h.views = [sharedView('echo-3', 10, 10, [trinketItem()], '0,0')];

    syncCaseTrinketVisuals();

    expect(findSlotGroup(surfaceEcho)).toBeDefined();
  });

  it('keeps a case\'s group while nothing changes, and follows a replaced anchor', () => {
    const own = new THREE.Group();
    h.pages['0,0'] = { placedPieces: { 'local-4': localPiece('local-4', 3, 4) } };
    h.localVisuals.set('local-4', own);
    h.views = [sharedView('echo-4', 3, 4, [trinketItem()])];

    syncCaseTrinketVisuals();
    const first = findSlotGroup(own);
    syncCaseTrinketVisuals();
    expect(findSlotGroup(own)).toBe(first);

    // A page rebuild replaces the piece visual; the trinkets move to it.
    const rebuilt = new THREE.Group();
    h.localVisuals.set('local-4', rebuilt);
    syncCaseTrinketVisuals();
    expect(findSlotGroup(rebuilt)).toBeDefined();
    expect(findSlotGroup(own)).toBeUndefined();
    expect(findSlotGroup(rebuilt)).not.toBe(first);
  });

  it('rebuilds the group when the case\'s contents change', () => {
    const own = new THREE.Group();
    h.pages['0,0'] = { placedPieces: { 'local-5': localPiece('local-5', 5, 5) } };
    h.localVisuals.set('local-5', own);
    h.views = [sharedView('echo-5', 5, 5, [trinketItem('shell')])];

    syncCaseTrinketVisuals();
    const before = findSlotGroup(own);

    h.views = [sharedView('echo-5', 5, 5, [trinketItem('shell'), trinketItem('stone')])];
    syncCaseTrinketVisuals();

    expect(findSlotGroup(own)).toBeDefined();
    expect(findSlotGroup(own)).not.toBe(before);
  });

  it('takes a case\'s trinkets back down when the case goes', () => {
    const own = new THREE.Group();
    h.pages['0,0'] = { placedPieces: { 'local-6': localPiece('local-6', 7, 7) } };
    h.localVisuals.set('local-6', own);
    h.views = [sharedView('echo-6', 7, 7, [trinketItem()])];

    syncCaseTrinketVisuals();
    expect(findSlotGroup(own)).toBeDefined();

    h.views = [];
    syncCaseTrinketVisuals();
    expect(findSlotGroup(own)).toBeUndefined();
  });

  it('draws the added levels and lifts the lid, even with nothing inside', () => {
    const own = new THREE.Group();
    const lid = Object.assign(new THREE.Mesh(), { name: 'display-case-lid' });
    lid.position.y = 0.36 + 0.62 + 0.02;
    own.add(lid);
    h.pages['0,0'] = { placedPieces: { 'local-7': localPiece('local-7', 8, 8) } };
    h.localVisuals.set('local-7', own);
    h.views = [sharedView('echo-7', 8, 8, [], '0,0', 3)];

    syncCaseTrinketVisuals();

    const group = findSlotGroup(own)!;
    expect(group.children.map((child) => child.name)).toEqual(['display-case-level-1', 'display-case-level-2']);
    expect(lid.position.y).toBeCloseTo(0.36 + 3 * 0.62 + 0.02);

    // The case going away puts the lid back where the piece drew it.
    h.views = [];
    syncCaseTrinketVisuals();
    expect(lid.position.y).toBeCloseTo(0.36 + 0.62 + 0.02);
  });

  it('lays out eight slots a shelf, front row first, the back row raised', () => {
    const slots = caseSlotPositions(2);
    expect(slots).toHaveLength(16);
    expect(slots[0].z).toBeGreaterThan(slots[4].z);
    expect(slots[4].y).toBeGreaterThan(slots[0].y);
    expect(slots[8].y).toBeCloseTo(slots[0].y + 0.62);
  });

  it('fits a big keepsake under the shelf above it', () => {
    const own = new THREE.Group();
    h.pages['0,0'] = { placedPieces: { 'local-8': localPiece('local-8', 9, 9) } };
    h.localVisuals.set('local-8', own);
    h.views = [sharedView('echo-8', 9, 9, [trinketItem()])];

    syncCaseTrinketVisuals();

    const rig = findSlotGroup(own)!.children[0];
    rig.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    expect(box.max.y - box.min.y).toBeLessThanOrEqual(0.44);
    expect(Math.max(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThanOrEqual(0.3);
  });

  it('animates keepsakes only while their case is drawn', () => {
    const scene = new THREE.Scene();
    const own = new THREE.Group();
    scene.add(own);
    h.pages['0,0'] = { placedPieces: { 'local-9': localPiece('local-9', 11, 11) } };
    h.localVisuals.set('local-9', own);
    h.views = [sharedView('echo-9', 11, 11, [trinketItem()])];
    syncCaseTrinketVisuals();
    const rig = findSlotGroup(own)!.children[0];

    updateCaseTrinkets(0.016, 1);
    expect(rig.userData.animated).toBe(1);

    own.visible = false;
    updateCaseTrinkets(0.016, 2);
    expect(rig.userData.animated).toBe(1);

    own.visible = true;
    scene.remove(own);
    updateCaseTrinkets(0.016, 3);
    expect(rig.userData.animated).toBe(1);
  });
});
