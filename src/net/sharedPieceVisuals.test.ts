import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlacedPiece } from '../../shared/src/index';

vi.mock('../render/context', () => ({ scene: new THREE.Scene() }));
vi.mock('../game/interiorScene', () => ({ interiorScene: new THREE.Scene() }));
vi.mock('../game/cases', () => ({ registerCasePiece: vi.fn(), unregisterCasePiece: vi.fn() }));
vi.mock('../sim/state', () => ({ getGameState: () => ({ world: { pages: {} } }) }));
vi.mock('../world/buildPieceVisuals', () => ({ buildPlacedPieceVisual: () => new THREE.Group() }));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 4 }));

const {
  addSharedPiece,
  getSharedPieceVisual,
  initializeSharedPieceVisuals,
  removeSharedPiece,
  setSharedPieceInteriorOwner,
} = await import('./sharedPieceVisuals');
const { setSelfAccount } = await import('../game/guests');

const ids: string[] = [];

function piece(id: string, home = ''): PlacedPiece {
  ids.push(id);
  return {
    id,
    templateKey: 'paper-bench',
    x: 40_002,
    z: 40_001,
    rotY: 0,
    material: 'kraft-twigs',
    makerId: 'host-account',
    page: home ? 'in:home:0,0' : '0,0',
    home,
  };
}

afterEach(() => {
  for (const id of ids.splice(0)) removeSharedPiece(id);
  setSharedPieceInteriorOwner(null);
  setSelfAccount('');
});

describe('shared furniture visuals', () => {
  it('mounts interior pieces in the interior scene and shows only the home being visited', () => {
    initializeSharedPieceVisuals();
    setSelfAccount('visitor-account');
    addSharedPiece(piece('host-chair', 'host-account'));
    const visual = getSharedPieceVisual('host-chair');

    expect(visual?.parent?.name).toBe('shared-interior-pieces');
    expect(visual?.position.y).toBeCloseTo(0.01);
    expect(visual?.visible).toBe(false);

    setSharedPieceInteriorOwner('host-account');
    expect(visual?.visible).toBe(true);
    setSharedPieceInteriorOwner('some-other-home');
    expect(visual?.visible).toBe(false);
  });

  it('keeps outdoor pieces on terrain in the surface scene', () => {
    initializeSharedPieceVisuals();
    addSharedPiece(piece('garden-chair'));
    const visual = getSharedPieceVisual('garden-chair');

    expect(visual?.parent?.name).toBe('shared-surface-pieces');
    expect(visual?.position.y).toBeCloseTo(4.01);
    expect(visual?.visible).toBe(true);
  });
});
