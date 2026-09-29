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
  buildTrinketRig: () => new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)),
}));

vi.mock('../world/resources', () => ({ RESOURCE_DEFS: {} }));
vi.mock('../render/materials', () => ({ getMaterial: () => new THREE.MeshBasicMaterial() }));

const { syncCaseTrinketVisuals } = await import('./caseTrinketVisuals');

const TRINKETS = 'case-trinkets';

function localPiece(id: string, x: number, z: number, page = '0,0') {
  return { id, templateKey: DISPLAY_CASE_TEMPLATE, x, z, rotY: 0, material: '', makerId: 'me', page };
}

function sharedView(id: string, x: number, z: number, items: CaseItem[], page = '0,0'): CaseView {
  return {
    handle: { key: `shared:${id}`, source: 'shared', id, x, z, page },
    mode: 'show', label: '', items, limit: null, mine: true, detail: null,
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
});
