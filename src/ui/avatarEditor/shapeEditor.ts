// The shape editor — draw a cutout with a pencil, then reshape it by its points.
//
// A shape is a stack of PIECES. Each piece is a closed loop of movable points
// (smooth by default, corners where you turn sharply), and each either ADDS to
// the shape or CUTS OUT of it, in order — the same idea as "unite" and
// "subtract" in a vector app. Draw as many strokes as you like: a new stroke is
// a new piece, unless it starts at the end of the piece you were just drawing,
// in which case it carries that piece on. There is no limit to how long a line
// can be.
//
// Two tools:
//   * Pencil       — draw; the line is fitted to a few points when you lift.
//   * Edit points  — drag a point, drag a piece, double-click an edge to add a
//                    point, double-click a point to switch corner and smooth.
//
// Everything is reachable without a pointer: "Start from" adds an oval, square
// or triangle, every point is a focusable control (arrows move it, Enter
// switches corner and smooth, Delete removes it), and every action has a button.
//
// The geometry lives in shapeGeometry.ts (pure, tested). This file is the
// screen: it owns the state, the pointer handling and the announcements.

import {
  DESIGN_CUTOUT,
  DESIGN_GROUND_Y,
  DESIGN_LIMITS,
  DESIGN_SHEET,
  sanitizeCustomShape,
  type CustomShape,
  type ShapePiece,
} from '../../../shared/src/index';
import {
  MIN_ANCHORS,
  anchorCount,
  appendStroke,
  deletePoint,
  fitShapeToCutout,
  fitStroke,
  insertPoint,
  isSharp,
  movePoint,
  nearestOnPiece,
  outlineFromShape,
  pieceFromStroke,
  piecePoints,
  pieceSegments,
  pieceToPathD,
  pointInPiece,
  shapeBounds,
  shapeToPathD,
  simplifyLine,
  starterPiece,
  strokeClosesPiece,
  toggleSharp,
  translatePiece,
  type Detail,
  type Pt,
  type StarterKind,
} from './shapeGeometry';

export type ShapeEditorOptions = {
  /** Shape to start from (editing a saved shape, or the design's own). */
  initial: CustomShape | null;
  /** Name field's starting text. */
  initialName?: string;
  /** Heading line above the workspace. */
  lead: string;
  confirmLabel: string;
  backLabel: string;
  announce: (text: string) => void;
  /** Called (debounced) with the shape in progress; omit when it is not a new drawing. */
  onDraft?: (shape: CustomShape | null) => void;
  onConfirm: (shape: CustomShape, name: string) => void;
  onBack: () => void;
};

export type ShapeEditorHandle = {
  focus: () => void;
  /** Leaves the screen; keeps the shape in progress unless it was used. */
  destroy: () => void;
};

type Tool = 'draw' | 'edit';
type Snapshot = { pieces: ShapePiece[]; selected: number | null; open: number | null };
type Drag =
  | { kind: 'anchor'; index: number; piece: number; base: ShapePiece; origin: Pt; grab: Pt; snap: Snapshot; moved: boolean }
  | { kind: 'piece'; piece: number; base: ShapePiece; origin: Pt; snap: Snapshot; moved: boolean };

const HISTORY_LIMIT = 200;
/** How near (screen pixels) a press must be to grab a point, by kind of pointer. */
const GRAB_PX = { mouse: 11, touch: 20 };
/** How near a press must be to an edge to pick that piece or add a point on it. */
const EDGE_PX = 9;
const DETAIL_LABEL: Record<Detail, string> = {
  few: 'Fewer points, smoother',
  balanced: 'Balanced',
  many: 'More points, closer to my line',
};
const HATCH_ID = 'shape-editor-hatch';

export function mountShapeEditor(host: HTMLElement, options: ShapeEditorOptions): ShapeEditorHandle {
  const { announce } = options;
  const W = DESIGN_SHEET.width;
  const H = DESIGN_SHEET.height;

  let pieces: ShapePiece[] = options.initial ? options.initial.pieces.map((p) => ({ ...p })) : [];
  let selected: number | null = pieces.length === 1 ? 0 : null;
  let anchor: number | null = null;
  /** The piece whose last point a new stroke may carry on from. */
  let open: number | null = null;
  let tool: Tool = pieces.length > 0 ? 'edit' : 'draw';
  let mode: ShapePiece['op'] = 'add';
  let detail: Detail = 'balanced';
  let undoStack: Snapshot[] = [];
  let redoStack: Snapshot[] = [];
  let pendingFocus: number | null = null;
  let finished = false;

  // ---- The screen ---------------------------------------------------------------

  const root = document.createElement('div');
  root.className = 'shape-editor';
  root.innerHTML = `
    <div class="shape-editor-head">
      <p class="avatar-editor-lead" data-role="lead"></p>
      <div class="avatar-editor-swatches shape-editor-finish">
        <button type="button" data-action="back">${options.backLabel}</button>
        <button type="button" class="avatar-editor-save" data-action="confirm">${options.confirmLabel}</button>
      </div>
    </div>
    <div class="shape-editor-rail" role="group" aria-label="Shape tools">
      <fieldset class="avatar-editor-group">
        <legend>Tool</legend>
        <div class="avatar-editor-swatches">
          <button type="button" class="avatar-editor-swatch" data-action="tool-draw">Pencil</button>
          <button type="button" class="avatar-editor-swatch" data-action="tool-edit">Edit points</button>
        </div>
      </fieldset>
      <fieldset class="avatar-editor-group">
        <legend>New pieces</legend>
        <div class="avatar-editor-swatches">
          <button type="button" class="avatar-editor-swatch" data-action="mode-add">Add to shape</button>
          <button type="button" class="avatar-editor-swatch" data-action="mode-subtract">Cut out of shape</button>
        </div>
        <label class="shape-editor-field">
          <span>Points</span>
          <select data-role="detail">
            ${(Object.keys(DETAIL_LABEL) as Detail[])
              .map((key) => `<option value="${key}">${DETAIL_LABEL[key]}</option>`)
              .join('')}
          </select>
        </label>
        <div class="avatar-editor-swatches" role="group" aria-label="Start from a ready-made piece">
          <button type="button" data-action="starter-oval">Oval</button>
          <button type="button" data-action="starter-square">Square</button>
          <button type="button" data-action="starter-triangle">Triangle</button>
        </div>
      </fieldset>
      <fieldset class="avatar-editor-group">
        <legend>Shape</legend>
        <div class="avatar-editor-swatches">
          <button type="button" data-action="undo">Undo</button>
          <button type="button" data-action="redo">Redo</button>
          <button type="button" data-action="fit">Fit to the guide box</button>
          <button type="button" data-action="clear">Start over</button>
        </div>
      </fieldset>
    </div>

    <div class="shape-editor-stage">
      <div class="avatar-editor-sheet shape-editor-sheet" data-role="sheet"></div>
      <p class="studio-sheet-hint" data-role="hint"></p>
    </div>

    <div class="shape-editor-side">
      <h3 class="studio-heading">Pieces</h3>
      <p class="avatar-editor-hint">They apply in order, top to bottom: each one adds to the shape
        or cuts out of everything above it.</p>
      <ol class="shape-editor-pieces" data-role="pieces" aria-label="Pieces of the shape"></ol>
      <fieldset class="avatar-editor-group" data-role="piece-tools">
        <legend>Selected piece</legend>
        <div class="avatar-editor-swatches">
          <button type="button" class="avatar-editor-swatch" data-action="piece-add">Adds</button>
          <button type="button" class="avatar-editor-swatch" data-action="piece-subtract">Cuts out</button>
        </div>
        <div class="avatar-editor-swatches">
          <button type="button" data-action="piece-up">Move earlier</button>
          <button type="button" data-action="piece-down">Move later</button>
          <button type="button" data-action="piece-delete">Delete piece</button>
        </div>
        <div class="avatar-editor-swatches">
          <button type="button" data-action="point-add">Add a point</button>
          <button type="button" data-action="point-toggle">Corner / smooth</button>
          <button type="button" data-action="point-delete">Delete point</button>
        </div>
      </fieldset>
      <p class="shape-editor-summary" data-role="summary"></p>
      <label class="avatar-editor-name-row">
        <span class="swatch-label">Name this shape</span>
        <input class="avatar-editor-name" type="text" maxlength="${DESIGN_LIMITS.nameMaxLength}"
               data-role="name" placeholder="optional" />
      </label>
    </div>
    <p id="shape-anchor-help" hidden>Arrow keys move the point, Shift for bigger steps. Enter
      switches it between a corner and smooth. Delete removes it.</p>`;

  host.replaceChildren(root);

  const q = <T extends HTMLElement>(selector: string): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`shape editor: missing ${selector}`);
    return el;
  };
  q('[data-role="lead"]').textContent = options.lead;
  const sheet = q('[data-role="sheet"]');
  const hint = q('[data-role="hint"]');
  const pieceList = q<HTMLOListElement>('[data-role="pieces"]');
  const summary = q('[data-role="summary"]');
  const nameInput = q<HTMLInputElement>('[data-role="name"]');
  const detailSelect = q<HTMLSelectElement>('[data-role="detail"]');
  nameInput.value = options.initialName ?? '';

  const button = (action: string) => q<HTMLButtonElement>(`[data-action="${action}"]`);

  // ---- Where things are on screen ---------------------------------------------------

  const view = () => {
    const svg = sheet.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // The svg keeps the sheet's proportions with room to spare (meet), so
    // measure where the sheet itself sits inside it.
    const scale = Math.min(rect.width / W, rect.height / H);
    return { rect, scale, offX: (rect.width - W * scale) / 2, offY: (rect.height - H * scale) / 2 };
  };

  const toSheet = (event: { clientX: number; clientY: number }): Pt | null => {
    const v = view();
    if (!v) return null;
    return {
      x: (event.clientX - v.rect.left - v.offX) / v.scale,
      y: (event.clientY - v.rect.top - v.offY) / v.scale,
    };
  };

  /** Sheet units per screen pixel: handles and grab distances stay the same size on screen. */
  const unitsPerPixel = (): number => {
    const v = view();
    return v ? 1 / v.scale : 0.4;
  };

  // ---- History ----------------------------------------------------------------------

  const snap = (): Snapshot => ({ pieces: [...pieces], selected, open });
  const pushUndo = (from: Snapshot = snap()) => {
    undoStack.push(from);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  };
  const restore = (s: Snapshot) => {
    pieces = [...s.pieces];
    selected = s.selected !== null && s.selected < pieces.length ? s.selected : null;
    open = s.open !== null && s.open < pieces.length ? s.open : null;
    anchor = null;
  };

  // ---- Numbers and limits -----------------------------------------------------------

  const totalAnchors = () => pieces.reduce((sum, piece) => sum + anchorCount(piece), 0);
  const hasArea = () => {
    const clean = sanitizeCustomShape({ pieces });
    return clean ? outlineFromShape(clean) !== null : false;
  };
  const roomForPiece = (extraAnchors: number): boolean => {
    if (pieces.length >= DESIGN_LIMITS.maxShapePieces) {
      announce(`That is as many pieces as a shape can hold (${DESIGN_LIMITS.maxShapePieces}). Delete one first.`);
      return false;
    }
    return roomForPoints(extraAnchors);
  };
  const roomForPoints = (extra: number): boolean => {
    if (totalAnchors() + extra > DESIGN_LIMITS.maxShapeAnchors) {
      announce('That is as many points as a shape can hold. Try fewer points, or delete a piece.');
      return false;
    }
    return true;
  };

  // ---- Drawing the canvas -----------------------------------------------------------

  let liveSamples: Pt[] = [];

  const previewPath = (): string => {
    try {
      return shapeToPathD({ pieces });
    } catch {
      return '';
    }
  };

  const pointsAttr = (points: readonly Pt[]) => points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const anchorLabel = (pieceIndex: number, index: number, count: number, sharp: boolean) =>
    `Point ${index + 1} of ${count} on piece ${pieceIndex + 1}, ${sharp ? 'corner' : 'smooth'}`;

  const paint = () => {
    const upp = unitsPerPixel();
    const parts: string[] = [];
    parts.push(
      `<defs><pattern id="${HATCH_ID}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="4" stroke="#a5402e" stroke-width="0.9" stroke-opacity="0.5"/></pattern></defs>`,
    );
    // Guides: where the ready-made shapes live, and the ground they stand on.
    parts.push(
      `<rect x="${DESIGN_CUTOUT.x}" y="${DESIGN_CUTOUT.y}" width="${DESIGN_CUTOUT.width}" height="${DESIGN_CUTOUT.height}" ` +
        `fill="none" stroke="rgba(74,69,60,0.4)" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`,
      `<line x1="${DESIGN_CUTOUT.x - 6}" y1="${DESIGN_GROUND_Y}" x2="${DESIGN_CUTOUT.x + DESIGN_CUTOUT.width + 6}" y2="${DESIGN_GROUND_Y}" ` +
        `stroke="rgba(74,69,60,0.3)" stroke-width="1" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>`,
    );
    // What the cutout will actually be.
    const result = previewPath();
    if (result) {
      parts.push(
        `<path d="${result}" fill="#c9a876" fill-opacity="0.85" fill-rule="evenodd" stroke="#f3ecdc" stroke-width="2.4" stroke-linejoin="round"/>`,
      );
    }
    // Each piece's own edge — solid where it adds, dashed and hatched where it cuts.
    pieces.forEach((piece, i) => {
      const isSelected = i === selected;
      const cut = piece.op === 'subtract';
      parts.push(
        `<path d="${pieceToPathD(piece)}" fill="${cut ? `url(#${HATCH_ID})` : 'none'}" ` +
          `stroke="${cut ? '#a5402e' : '#4a453c'}" stroke-width="${isSelected ? 2.6 : 1.4}" ` +
          `${cut ? 'stroke-dasharray="6 4" ' : ''}opacity="${isSelected ? 1 : 0.7}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
      );
    });
    // The selected piece's points.
    const current = selected !== null ? pieces[selected] : undefined;
    if (current && selected !== null) {
      const points = piecePoints(current);
      const r = 5.5 * upp;
      const editing = tool === 'edit';
      points.forEach((p, i) => {
        const sharp = isSharp(current, i);
        const label = anchorLabel(selected!, i, points.length, sharp);
        const common =
          `class="shape-anchor${i === anchor ? ' is-selected' : ''}" data-anchor="${i}" ` +
          `${editing ? 'tabindex="0" role="button" aria-describedby="shape-anchor-help" ' : 'aria-hidden="true" '}` +
          `aria-label="${label}" stroke-width="1.6" vector-effect="non-scaling-stroke"`;
        parts.push(
          sharp
            ? `<rect x="${p.x - r}" y="${p.y - r}" width="${r * 2}" height="${r * 2}" ${common}/>`
            : `<circle cx="${p.x}" cy="${p.y}" r="${r}" ${common}/>`,
        );
      });
      if (!editing && open === selected && points.length > 0) {
        const end = points[points.length - 1]!;
        parts.push(
          `<circle cx="${end.x}" cy="${end.y}" r="${r * 2}" fill="none" stroke="#3f7d3a" stroke-width="1.6" ` +
            `stroke-dasharray="3 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`,
        );
      }
    }
    parts.push(
      `<polyline data-role="live" points="${pointsAttr(liveSamples)}" fill="none" stroke="${mode === 'add' ? '#2c5f8a' : '#a5402e'}" ` +
        `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
    );
    sheet.innerHTML =
      `<svg class="avatar-editor-svg shape-editor-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
      `role="group" aria-label="Shape canvas. Solid lines add to the shape; dashed hatched lines cut out of it.">${parts.join('')}</svg>`;
    if (pendingFocus !== null) {
      sheet.querySelector<SVGElement>(`[data-anchor="${pendingFocus}"]`)?.focus();
      pendingFocus = null;
    }
  };

  const HINT: Record<Tool, string> = {
    draw:
      'Draw with a mouse, finger or stylus. End near where you began to close a shape, or start a line at the ' +
      'green ring to keep going. Every other line is a new piece.',
    edit:
      'Drag a point to reshape, drag inside a piece to move it. Double-click an edge to add a point, or a point ' +
      'to switch corner and smooth. With a keyboard: Tab to a point, then the arrow keys.',
  };

  const syncUi = () => {
    const pressed = (action: string, on: boolean) => button(action).setAttribute('aria-pressed', String(on));
    pressed('tool-draw', tool === 'draw');
    pressed('tool-edit', tool === 'edit');
    pressed('mode-add', mode === 'add');
    pressed('mode-subtract', mode === 'subtract');
    hint.textContent = HINT[tool];
    sheet.classList.toggle('is-drawing-tool', tool === 'draw');

    pieceList.innerHTML =
      pieces.length === 0
        ? `<li class="shape-piece-empty">Nothing yet. Draw with the pencil, or start from an oval, square or triangle.</li>`
        : pieces
            .map(
              (piece, i) =>
                `<li><button type="button" class="shape-piece${i === selected ? ' is-selected' : ''}" ` +
                `data-pick="${i}" aria-pressed="${i === selected}">` +
                `<span class="shape-piece-name">Piece ${i + 1}</span>` +
                `<span class="shape-piece-kind">${piece.op === 'add' ? 'Adds' : 'Cuts out'}</span>` +
                `<span class="shape-piece-count">${anchorCount(piece)} points</span></button></li>`,
            )
            .join('');

    const current = selected !== null ? pieces[selected] : undefined;
    q('[data-role="piece-tools"]').hidden = !current;
    if (current) {
      pressed('piece-add', current.op === 'add');
      pressed('piece-subtract', current.op === 'subtract');
    }
    syncPointButtons();
    const count = pieces.length;
    summary.textContent =
      count === 0
        ? ''
        : `${count} piece${count === 1 ? '' : 's'}, ${totalAnchors()} points` +
          (hasArea() ? '' : ' — nothing is cut out yet: at least one piece has to add.');
  };

  const syncPointButtons = () => {
    const current = selected !== null ? pieces[selected] : undefined;
    button('point-add').disabled = !current;
    button('point-toggle').disabled = !current || anchor === null;
    button('point-delete').disabled = !current || anchor === null;
    for (const el of sheet.querySelectorAll<SVGElement>('[data-anchor]')) {
      el.classList.toggle('is-selected', Number(el.dataset.anchor) === anchor);
    }
  };

  const refresh = () => {
    paint();
    syncUi();
  };

  // ---- The shape in progress --------------------------------------------------------

  let draftTimer = 0;
  const flushDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = 0;
    options.onDraft?.(sanitizeCustomShape({ pieces }));
  };
  const changed = () => {
    if (options.onDraft) {
      window.clearTimeout(draftTimer);
      draftTimer = window.setTimeout(flushDraft, 300);
    }
    refresh();
  };

  // ---- Small operations -------------------------------------------------------------

  const setTool = (next: Tool) => {
    tool = next;
    liveSamples = [];
    refresh();
    announce(next === 'draw' ? 'Pencil. Draw on the sheet.' : 'Editing points. Pick a piece, then drag its points.');
  };

  const selectPiece = (index: number | null) => {
    if (selected !== index && open !== index) open = null;
    selected = index;
    anchor = null;
  };

  const addPiece = (piece: ShapePiece) => {
    pushUndo();
    pieces = [...pieces, piece];
    selected = pieces.length - 1;
    anchor = null;
  };

  const replaceSelected = (piece: ShapePiece) => {
    if (selected === null) return;
    pieces = pieces.map((p, i) => (i === selected ? piece : p));
  };

  const finishStroke = (end: Pt) => {
    const samples = liveSamples;
    liveSamples = [];
    const fitted = fitStroke(samples, detail);
    if (!fitted) {
      // A tap rather than a line: pick whatever is under it.
      const picked = pieceAt(end);
      selectPiece(picked);
      refresh();
      announce(picked === null ? 'Nothing there. Draw a line to make a piece.' : `Piece ${picked + 1} selected.`);
      return;
    }
    const continuing = open !== null && open === selected && selected !== null;
    if (continuing) {
      const base = pieces[selected!]!;
      if (!roomForPoints(fitted.points.length)) return refresh();
      const closes = strokeClosesPiece(base, fitted);
      pushUndo();
      replaceSelected(appendStroke(base, fitted));
      if (closes) open = null;
      anchor = null;
      changed();
      announce(
        closes
          ? `Piece ${selected! + 1} closed. ${anchorCount(pieces[selected!]!)} points.`
          : `Piece ${selected! + 1} carried on. ${anchorCount(pieces[selected!]!)} points.`,
      );
      return;
    }
    let piece = pieceFromStroke(fitted, mode);
    if (anchorCount(piece) < MIN_ANCHORS) piece = insertPoint(piece, 0);
    if (!roomForPiece(anchorCount(piece))) return refresh();
    addPiece(piece);
    open = fitted.closed ? null : pieces.length - 1;
    changed();
    const what = mode === 'add' ? 'adds to the shape' : 'cuts out of the shape';
    const noBase = mode === 'subtract' && !pieces.slice(0, -1).some((p) => p.op === 'add');
    announce(
      `Piece ${pieces.length} ${what}, ${anchorCount(piece)} points.` +
        (noBase ? ' There is nothing above it to cut from yet.' : '') +
        (fitted.closed ? '' : ' Start the next line at its end to carry on.'),
    );
  };

  /** The piece under a point: the selected one first, then the top-most. */
  const pieceAt = (p: Pt): number | null => {
    const near = EDGE_PX * unitsPerPixel();
    if (selected !== null && pieces[selected] && pointInPiece(pieces[selected]!, p)) return selected;
    for (let i = pieces.length - 1; i >= 0; i--) if (pointInPiece(pieces[i]!, p)) return i;
    let best: number | null = null;
    let bestDistance = near;
    for (let index = 0; index < pieces.length; index++) {
      const hit = nearestOnPiece(pieces[index]!, p);
      if (hit && hit.distance <= bestDistance) {
        best = index;
        bestDistance = hit.distance;
      }
    }
    return best;
  };

  const anchorAt = (p: Pt, pointerType: string): number | null => {
    const current = selected !== null ? pieces[selected] : undefined;
    if (!current) return null;
    const reach = (pointerType === 'mouse' ? GRAB_PX.mouse : GRAB_PX.touch) * unitsPerPixel();
    let best: number | null = null;
    let bestDistance = reach;
    const points = piecePoints(current);
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i]!.x - p.x, points[i]!.y - p.y);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    return best;
  };

  // ---- Pointer handling -------------------------------------------------------------

  let activePointer: number | null = null;
  let stroking = false;
  let drag: Drag | null = null;

  sheet.addEventListener('contextmenu', (event) => event.preventDefault());

  sheet.addEventListener('pointerdown', (event) => {
    if (activePointer !== null) return; // a second finger is not a second pen
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const p = toSheet(event);
    if (!p) return;
    activePointer = event.pointerId;
    try {
      sheet.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; the drag still works.
    }
    const upp = unitsPerPixel();

    if (tool === 'draw') {
      // Carry on the piece just drawn if the line starts at its last point.
      const current = selected !== null ? pieces[selected] : undefined;
      if (current && open === selected) {
        const points = piecePoints(current);
        const end = points[points.length - 1]!;
        const reach = (event.pointerType === 'mouse' ? GRAB_PX.mouse : GRAB_PX.touch) * 1.4 * upp;
        if (Math.hypot(end.x - p.x, end.y - p.y) > reach) open = null;
        else liveSamples = [end];
      } else {
        open = null;
      }
      if (liveSamples.length === 0) liveSamples = [p];
      stroking = true;
      paint();
      return;
    }

    // Edit tool.
    const index = anchorAt(p, event.pointerType);
    if (index !== null && selected !== null) {
      anchor = index;
      const base = pieces[selected]!;
      const at = piecePoints(base)[index]!;
      drag = { kind: 'anchor', index, piece: selected, base, origin: p, grab: { x: p.x - at.x, y: p.y - at.y }, snap: snap(), moved: false };
      syncPointButtons();
      return;
    }
    const picked = pieceAt(p);
    if (picked === null) {
      selectPiece(null);
      refresh();
      activePointer = null;
      announce('Nothing selected.');
      return;
    }
    const wasSelected = picked === selected;
    selectPiece(picked);
    drag = { kind: 'piece', piece: picked, base: pieces[picked]!, origin: p, snap: snap(), moved: false };
    refresh();
    if (!wasSelected) announce(`Piece ${picked + 1} selected — ${pieces[picked]!.op === 'add' ? 'adds' : 'cuts out'}, ${anchorCount(pieces[picked]!)} points.`);
  });

  sheet.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    if (stroking) {
      const upp = unitsPerPixel();
      const gap = 2 * upp;
      const batch = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      for (const e of batch.length > 0 ? batch : [event]) {
        const p = toSheet(e);
        const last = liveSamples[liveSamples.length - 1];
        if (!p || (last && Math.hypot(p.x - last.x, p.y - last.y) < gap)) continue;
        liveSamples.push(p);
      }
      // A very long line stays light: thin the middle rather than stop.
      if (liveSamples.length > 4000) liveSamples = simplifyLine(liveSamples, 0.3);
      sheet.querySelector('[data-role="live"]')?.setAttribute('points', pointsAttr(liveSamples));
      return;
    }
    if (!drag) return;
    const p = toSheet(event);
    if (!p) return;
    if (!drag.moved) {
      // A press that barely moves is a click, not a drag: no history entry, no change.
      if (Math.hypot(p.x - drag.origin.x, p.y - drag.origin.y) < 2.5 * unitsPerPixel()) return;
      drag.moved = true;
      pushUndo(drag.snap);
    }
    const active = drag;
    pieces = pieces.map((piece, i) => {
      if (i !== active.piece) return piece;
      return active.kind === 'anchor'
        ? movePoint(active.base, active.index, { x: p.x - active.grab.x, y: p.y - active.grab.y })
        : translatePiece(active.base, p.x - active.origin.x, p.y - active.origin.y);
    });
    paint();
  });

  const endPointer = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (stroking) {
      stroking = false;
      finishStroke(toSheet(event) ?? liveSamples[liveSamples.length - 1] ?? { x: 0, y: 0 });
      return;
    }
    const finished = drag;
    drag = null;
    if (finished?.moved) {
      changed();
      announce(finished.kind === 'anchor' ? `Point ${finished.index + 1} moved.` : `Piece ${finished.piece + 1} moved.`);
    }
  };
  sheet.addEventListener('pointerup', endPointer);
  sheet.addEventListener('pointercancel', (event) => {
    if (event.pointerId !== activePointer) return;
    if (stroking) {
      stroking = false;
      liveSamples = [];
      refresh();
    } else if (drag) {
      // A cancelled drag puts things back.
      restore(drag.snap);
      drag = null;
      refresh();
    }
    activePointer = null;
  });

  sheet.addEventListener('dblclick', (event) => {
    if (tool !== 'edit' || selected === null) return;
    const p = toSheet(event);
    const current = pieces[selected];
    if (!p || !current) return;
    const onAnchor = anchorAt(p, 'mouse');
    if (onAnchor !== null) {
      pushUndo();
      replaceSelected(toggleSharp(current, onAnchor));
      anchor = onAnchor;
      changed();
      announce(`Point ${onAnchor + 1} is now a ${isSharp(pieces[selected]!, onAnchor) ? 'corner' : 'smooth point'}.`);
      return;
    }
    const hit = nearestOnPiece(current, p);
    if (hit && hit.distance <= EDGE_PX * unitsPerPixel() * 1.5) {
      if (!roomForPoints(1)) return;
      pushUndo();
      replaceSelected(insertPoint(current, hit.segment, hit.t));
      anchor = hit.segment + 1;
      changed();
      announce(`Point added. Piece ${selected + 1} has ${anchorCount(pieces[selected]!)} points.`);
    }
  });

  // ---- Keyboard ---------------------------------------------------------------------

  let nudgeKey = '';
  let nudgeAt = 0;

  sheet.addEventListener('focusin', (event) => {
    const target = event.target as Element;
    if (!(target instanceof SVGElement) || target.dataset.anchor === undefined) return;
    anchor = Number(target.dataset.anchor);
    syncPointButtons();
  });

  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
    }
    if (!(target instanceof SVGElement) || target.dataset.anchor === undefined || selected === null) return;
    const index = Number(target.dataset.anchor);
    const current = pieces[selected];
    if (!current) return;
    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, Pt> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const at = piecePoints(current)[index]!;
      const key = `${selected}:${index}`;
      const now = Date.now();
      if (key !== nudgeKey || now - nudgeAt > 900) pushUndo();
      nudgeKey = key;
      nudgeAt = now;
      replaceSelected(movePoint(current, index, { x: at.x + move.x, y: at.y + move.y }));
      anchor = index;
      pendingFocus = index;
      changed();
      const moved = piecePoints(pieces[selected]!)[index]!;
      announce(`Point ${index + 1} at ${Math.round(moved.x)}, ${Math.round(moved.y)}.`);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removePoint(index);
    } else if (event.key === 'Enter' || event.key.toLowerCase() === 'c') {
      event.preventDefault();
      flipPoint(index);
    }
  });

  // ---- Actions ----------------------------------------------------------------------

  const flipPoint = (index: number) => {
    const current = selected !== null ? pieces[selected] : undefined;
    if (!current) return;
    pushUndo();
    replaceSelected(toggleSharp(current, index));
    anchor = index;
    pendingFocus = index;
    changed();
    announce(`Point ${index + 1} is now a ${isSharp(pieces[selected!]!, index) ? 'corner' : 'smooth point'}.`);
  };

  const removePoint = (index: number) => {
    const current = selected !== null ? pieces[selected] : undefined;
    if (!current) return;
    if (anchorCount(current) <= MIN_ANCHORS) {
      announce('A piece needs at least three points. Delete the whole piece instead.');
      return;
    }
    pushUndo();
    replaceSelected(deletePoint(current, index));
    anchor = null;
    open = null;
    changed();
    announce(`Point deleted. ${anchorCount(pieces[selected!]!)} left on piece ${selected! + 1}.`);
  };

  const undo = () => {
    const previous = undoStack.pop();
    if (!previous) return announce('Nothing to undo.');
    redoStack.push(snap());
    restore(previous);
    changed();
    announce('Undone.');
  };
  const redo = () => {
    const next = redoStack.pop();
    if (!next) return announce('Nothing to redo.');
    undoStack.push(snap());
    restore(next);
    changed();
    announce('Redone.');
  };

  const addStarter = (kind: StarterKind) => {
    const centre: Pt = { x: DESIGN_CUTOUT.x + DESIGN_CUTOUT.width / 2, y: DESIGN_CUTOUT.y + DESIGN_CUTOUT.height * 0.6 };
    const base = shapeBounds({ pieces: pieces.filter((p) => p.op === 'add') });
    const cutting = mode === 'subtract';
    const at: Pt = cutting && base ? { x: (base.minX + base.maxX) / 2, y: (base.minY + base.maxY) / 2 } : centre;
    const half: Pt = cutting
      ? { x: base ? Math.max(6, (base.maxX - base.minX) / 6) : 12, y: base ? Math.max(6, (base.maxX - base.minX) / 6) : 12 }
      : { x: DESIGN_CUTOUT.width * 0.3, y: DESIGN_CUTOUT.height * 0.3 };
    const piece = starterPiece(kind, mode, at, half);
    if (!roomForPiece(anchorCount(piece))) return;
    addPiece(piece);
    open = null;
    tool = 'edit';
    changed();
    announce(
      `${kind[0]!.toUpperCase()}${kind.slice(1)} ${mode === 'add' ? 'added' : 'cut out'} as piece ${pieces.length}. ` +
        'Tab to its points and use the arrow keys, or drag them.',
    );
  };

  const movePiece = (by: number) => {
    if (selected === null) return;
    const target = selected + by;
    if (target < 0 || target >= pieces.length) return announce(by < 0 ? 'Already the first piece.' : 'Already the last piece.');
    pushUndo();
    const next = [...pieces];
    [next[selected], next[target]] = [next[target]!, next[selected]!];
    pieces = next;
    selected = target;
    open = null;
    changed();
    announce(`Piece moved to position ${target + 1} of ${pieces.length}.`);
  };

  const confirm = () => {
    const clean = sanitizeCustomShape({ pieces });
    if (!clean || outlineFromShape(clean) === null) {
      announce('There is nothing cut out yet. Draw a piece that adds to the shape, or start from an oval.');
      button('tool-draw').focus();
      return;
    }
    finished = true;
    window.clearTimeout(draftTimer);
    options.onConfirm(clean, nameInput.value);
  };

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const pick = target.closest<HTMLElement>('[data-pick]');
    if (pick) {
      const index = Number(pick.dataset.pick);
      selectPiece(index);
      refresh();
      pieceList.querySelector<HTMLElement>(`[data-pick="${index}"]`)?.focus();
      announce(`Piece ${index + 1} selected — ${pieces[index]!.op === 'add' ? 'adds' : 'cuts out'}, ${anchorCount(pieces[index]!)} points.`);
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action) return;
    const current = selected !== null ? pieces[selected] : undefined;
    switch (action) {
      case 'tool-draw':
        return setTool('draw');
      case 'tool-edit':
        return setTool('edit');
      case 'mode-add':
      case 'mode-subtract':
        mode = action === 'mode-add' ? 'add' : 'subtract';
        syncUi();
        return announce(mode === 'add' ? 'New pieces add to the shape.' : 'New pieces cut out of the shape.');
      case 'starter-oval':
      case 'starter-square':
      case 'starter-triangle':
        return addStarter(action.slice('starter-'.length) as StarterKind);
      case 'piece-add':
      case 'piece-subtract': {
        if (!current) return;
        const op = action === 'piece-add' ? 'add' : 'subtract';
        if (current.op === op) return;
        pushUndo();
        replaceSelected({ ...current, op });
        changed();
        return announce(`Piece ${selected! + 1} now ${op === 'add' ? 'adds to' : 'cuts out of'} the shape.`);
      }
      case 'piece-up':
        return movePiece(-1);
      case 'piece-down':
        return movePiece(1);
      case 'piece-delete': {
        if (selected === null) return;
        pushUndo();
        const removed = selected;
        pieces = pieces.filter((_, i) => i !== removed);
        selected = pieces.length > 0 ? Math.min(removed, pieces.length - 1) : null;
        open = null;
        anchor = null;
        changed();
        return announce(`Piece ${removed + 1} deleted.`);
      }
      case 'point-add': {
        if (!current || selected === null) return;
        if (!roomForPoints(1)) return;
        const segments = pieceSegments(current);
        let segment = anchor ?? 0;
        if (anchor === null) {
          let longest = -1;
          segments.forEach((s, i) => {
            const length = Math.hypot(s.p3.x - s.p0.x, s.p3.y - s.p0.y);
            if (length > longest) {
              longest = length;
              segment = i;
            }
          });
        }
        pushUndo();
        replaceSelected(insertPoint(current, segment));
        anchor = segment + 1;
        pendingFocus = tool === 'edit' ? anchor : null;
        changed();
        return announce(`Point added on piece ${selected + 1}. ${anchorCount(pieces[selected]!)} points.`);
      }
      case 'point-toggle':
        if (anchor !== null) flipPoint(anchor);
        return;
      case 'point-delete':
        if (anchor !== null) removePoint(anchor);
        return;
      case 'undo':
        return undo();
      case 'redo':
        return redo();
      case 'fit': {
        if (!hasArea()) return announce('Nothing to fit yet.');
        pushUndo();
        pieces = fitShapeToCutout({ pieces }).pieces;
        changed();
        return announce('Shape resized to fill the guide box.');
      }
      case 'clear': {
        if (pieces.length === 0) return announce('Already empty.');
        pushUndo();
        pieces = [];
        selected = null;
        open = null;
        anchor = null;
        changed();
        return announce('Cleared. Undo brings it back.');
      }
      case 'back':
        flushDraft();
        return options.onBack();
      case 'confirm':
        return confirm();
    }
  });

  detailSelect.addEventListener('change', () => {
    detail = detailSelect.value as Detail;
    announce(`${DETAIL_LABEL[detail]}. This applies to lines you draw from now on.`);
  });
  detailSelect.value = detail;

  // ---- Start ------------------------------------------------------------------------

  let resizeFrame = 0;
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (resizeFrame) return;
          resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = 0;
            if (!stroking && !drag) paint();
          });
        })
      : null;
  observer?.observe(sheet);

  refresh();

  return {
    focus: () => button(tool === 'draw' ? 'tool-draw' : 'tool-edit').focus(),
    destroy: () => {
      observer?.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(draftTimer);
      if (!finished && options.onDraft) flushDraft();
    },
  };
}
