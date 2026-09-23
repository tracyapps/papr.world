import {
  cancelCarryingPiece,
  clearSelectedPlacedPieces,
  commitCarryInPlace,
  enterMoveMode,
  getPendingPieceRotation,
  getSelectedPieceScreenBounds,
  getSelectedPlacedPieceIds,
  hasPendingPieceChanges,
  rotateSelectedPiecesTo,
} from '../game/placement';

let editor: HTMLElement | null = null;
let mode: 'move' | 'rotate' = 'move';
let lastSelection = '';

/** The selected furniture's nearby, reversible editing controls. */
export function initializePlacedPieceEditor(): void {
  if (editor) return;
  editor = document.createElement('div');
  editor.className = 'placed-piece-editor';
  editor.hidden = true;
  editor.innerHTML = `
    <div class="placed-piece-editor-menu" role="toolbar" aria-label="Edit selected pieces">
      <button type="button" data-piece-action="move" aria-pressed="true">Move</button>
      <button type="button" data-piece-action="rotate" aria-pressed="false">Rotate</button>
      <button type="button" data-piece-action="commit" aria-label="Commit changes" title="Commit changes (Enter)">✓</button>
      <button type="button" data-piece-action="cancel" aria-label="Cancel changes" title="Cancel changes (Escape)">×</button>
    </div>
    <button type="button" class="placed-piece-rotate-handle" data-corner="0" aria-label="Rotate from top left"></button>
    <button type="button" class="placed-piece-rotate-handle" data-corner="1" aria-label="Rotate from top right"></button>
    <button type="button" class="placed-piece-rotate-handle" data-corner="2" aria-label="Rotate from bottom right"></button>
    <button type="button" class="placed-piece-rotate-handle" data-corner="3" aria-label="Rotate from bottom left"></button>`;
  document.body.append(editor);
  editor.addEventListener('pointerdown', (event) => event.stopPropagation());
  editor.addEventListener('pointerup', (event) => event.stopPropagation());
  editor.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-piece-action]')?.dataset.pieceAction;
    if (action === 'move') mode = 'move';
    if (action === 'rotate') {
      mode = 'rotate';
      enterMoveMode();
    }
    if (action === 'commit') commitCarryInPlace();
    if (action === 'cancel') {
      cancelCarryingPiece();
      clearSelectedPlacedPieces();
    }
    updatePlacedPieceEditor();
  });
  for (const handle of editor.querySelectorAll<HTMLButtonElement>('[data-corner]')) {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!rotateSelectedPiecesTo(getPendingPieceRotation())) return;
      const bounds = getSelectedPieceScreenBounds();
      if (!bounds) return;
      const cx = (bounds.left + bounds.right) / 2;
      const cy = (bounds.top + bounds.bottom) / 2;
      const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
      const startRotation = getPendingPieceRotation();
      handle.setPointerCapture(event.pointerId);
      const move = (next: PointerEvent) => {
        rotateSelectedPiecesTo(startRotation + Math.atan2(next.clientY - cy, next.clientX - cx) - startAngle);
        updatePlacedPieceEditor();
      };
      const end = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  }
}

export function updatePlacedPieceEditor(): void {
  if (!editor) return;
  const ids = [...getSelectedPlacedPieceIds()].sort().join('|');
  if (ids !== lastSelection) {
    mode = 'move';
    lastSelection = ids;
  }
  const bounds = ids ? getSelectedPieceScreenBounds() : null;
  editor.hidden = !bounds;
  if (!bounds) return;
  const menu = editor.querySelector<HTMLElement>('.placed-piece-editor-menu')!;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - 230, (bounds.left + bounds.right) / 2 - 110))}px`;
  menu.style.top = `${Math.max(8, Math.min(window.innerHeight - 48, bounds.top - 48))}px`;
  for (const action of ['move', 'rotate'] as const) {
    editor.querySelector(`[data-piece-action="${action}"]`)?.setAttribute('aria-pressed', String(mode === action));
  }
  const commit = editor.querySelector<HTMLButtonElement>('[data-piece-action="commit"]');
  if (commit) commit.disabled = !hasPendingPieceChanges();
  const corners = [
    [bounds.left, bounds.top], [bounds.right, bounds.top],
    [bounds.right, bounds.bottom], [bounds.left, bounds.bottom],
  ];
  for (const handle of editor.querySelectorAll<HTMLButtonElement>('[data-corner]')) {
    handle.hidden = mode !== 'rotate';
    const [x, y] = corners[Number(handle.dataset.corner)];
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
  }
}
