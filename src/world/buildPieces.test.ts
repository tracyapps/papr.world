import { describe, expect, it } from 'vitest';
import {
  BUILD_PIECE_DEFS,
  buildPieceDef,
  buildPieceDefsConflict,
  buildPiecesConflict,
  placedPieceFootprint,
  type BuildPieceKey,
  type ResolvedBuildPiece,
} from './buildPieces';

describe('build-piece catalog', () => {
  it('gives every piece a distinct name and a plain description', () => {
    const entries = Object.entries(BUILD_PIECE_DEFS);
    expect(entries.length).toBeGreaterThan(1);
    const labels = new Set(entries.map(([, def]) => def.label));
    expect(labels.size).toBe(entries.length);
    for (const [, def] of entries) {
      // A summary must actually say something a player could act on, not just
      // restate the name — the palette prints it verbatim.
      expect(def.summary.length).toBeGreaterThan(12);
      expect(def.summary).not.toBe(def.label);
    }
  });

  it('claims a real footprint and declares how overlap behaves', () => {
    for (const def of Object.values(BUILD_PIECE_DEFS)) {
      expect(def.radiusX).toBeGreaterThan(0);
      expect(def.radiusZ).toBeGreaterThan(0);
      expect(['none', 'same-template', 'any']).toContain(def.overlap);
    }
  });

  it('lets planks be walked across and keeps everything else solid', () => {
    expect(BUILD_PIECE_DEFS['path-plank'].solid).toBe(false);
    for (const key of Object.keys(BUILD_PIECE_DEFS) as BuildPieceKey[]) {
      if (key !== 'path-plank') expect(BUILD_PIECE_DEFS[key].solid).toBe(true);
    }
  });

  it('turns an unknown template into a solid mystery rather than nothing', () => {
    // A save from a newer version can carry a template we do not know. The
    // piece must still claim its ground — silently erasing an old bench would
    // let the player build inside it.
    const unknown = buildPieceDef('bench-from-the-future');
    expect(unknown.solid).toBe(true);
    expect(unknown.label).toMatch(/mystery/);
    expect(unknown.radiusX).toBeGreaterThan(0);
    expect(unknown.overlap).toBe('none');
  });

  it('describes a placed piece in footprint terms', () => {
    const footprint = placedPieceFootprint({
      id: 'piece-x',
      templateKey: 'paper-bench',
      x: 1,
      z: 2,
      rotY: 0,
      makerId: 'local',
      page: '0,0',
    });
    expect(footprint.id).toBe('placed:piece-x');
    expect(footprint.solid).toBe(true);
    expect(footprint.radiusX).toBe(BUILD_PIECE_DEFS['paper-bench'].radiusX);
    expect(footprint.label).toBe('the Paper bench');
  });

  it('rotates a rectangular physical footprint with the saved piece', () => {
    const footprint = placedPieceFootprint({
      id: 'turned-plank', templateKey: 'path-plank', x: 1, z: 2,
      rotY: Math.PI / 2, makerId: 'local', page: '0,0',
    });

    expect(footprint.radiusX).toBeCloseTo(BUILD_PIECE_DEFS['path-plank'].radiusZ);
    expect(footprint.radiusZ).toBeCloseTo(BUILD_PIECE_DEFS['path-plank'].radiusX);
  });
});

describe('build-piece overlap rules', () => {
  const pose = (templateKey: BuildPieceKey, x: number, z: number, rotY = 0) => ({ templateKey, x, z, rotY });

  it('allows ordinary pieces to sit edge-to-edge without broad personal space', () => {
    const first = pose('paper-bench', 0, 0);
    const touching = pose('paper-bench', BUILD_PIECE_DEFS['paper-bench'].radiusX * 2, 0);
    const overlapping = pose('paper-bench', BUILD_PIECE_DEFS['paper-bench'].radiusX * 2 - 0.05, 0);

    expect(buildPiecesConflict(first, touching)).toBe(false);
    expect(buildPiecesConflict(first, overlapping)).toBe(true);
  });

  it('uses rotation when deciding whether two long pieces collide', () => {
    const horizontal = pose('path-plank', 0, 0);
    const verticalNearEnd = pose('paper-bench', 1.2, 0, Math.PI / 2);
    const verticalClear = pose('paper-bench', 1.55, 0, Math.PI / 2);

    expect(buildPiecesConflict(horizontal, verticalNearEnd)).toBe(true);
    expect(buildPiecesConflict(horizontal, verticalClear)).toBe(false);
  });

  it('lets path planks overlap their own kind for seamless rows', () => {
    expect(buildPiecesConflict(
      pose('path-plank', 0, 0),
      pose('path-plank', 1.2, 0),
    )).toBe(false);
    // Still stop an accidental exact double-placement.
    expect(buildPiecesConflict(
      pose('path-plank', 0, 0),
      pose('path-plank', 0.02, 0),
    )).toBe(true);
  });

  it('supports future soft furnishings that may overlap any built piece', () => {
    const rug: ResolvedBuildPiece = {
      ...BUILD_PIECE_DEFS['path-plank'],
      key: 'future-rug',
      overlap: 'any',
      solid: false,
    };

    expect(buildPieceDefsConflict(
      rug, { x: 0, z: 0, rotY: 0 },
      BUILD_PIECE_DEFS['paper-bench'], { x: 0, z: 0, rotY: 0 },
    )).toBe(false);
  });
});
