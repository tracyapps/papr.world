// The avatar editor overlay — pick a cutout shape (or draw your own), then
// make it yours.
//
// Three steps, in the order a scissors-and-paper craft actually happens:
//
//   1. "shape"   — choose the cutout. Searchable, sortable grid; the FIRST
//                  tile is always "Draw your avatar" (a big question mark),
//                  which adds one extra step:
//   2. "outline" — (custom only) draw the cutout outline, confirm it.
//   3. "studio"  — a full-screen workshop: the paper stack on one side, the
//                  cutout on a work table in the middle, and a bench with
//                  three tools — Faces, Arms & hair, Draw. Changing the shape
//                  from here warns that selections reset, and offers a save to
//                  the wardrobe first.
//
// Why a room rather than a modal card (2026-08-15): the card forced every
// palette into one scrolling column, and that scroll competed with the game's
// wheel-zoom underneath. A full-screen studio gives the palettes somewhere to
// spread out, freezes the world behind it (see isAvatarStudioOpen), and makes
// it obvious the world is not listening.
//
// Why three tools rather than one panel: dragging a stamp and drawing a stroke
// are the same gesture on the same surface. Instead of guessing which you
// meant, the studio asks which tool you picked up — and only that tool's
// pointer interactions are wired up at all.
//
// Dialog conventions follow hudMenus.ts: role="dialog", aria-modal, Escape
// cancels, focus returns to the opener.
//
// Accessibility spine:
//   * Templates + paper + crayons are labeled buttons — a complete avatar
//     needs zero freehand drawing (the template path IS the accessible path).
//   * The shape grid is searchable by typed keywords, and every tile's
//     accessible name includes its spoken description.
//   * Every state change is announced through one polite live region.
//   * Whole-stroke eraser + unlimited undo: mistakes are cheap.
//   * Pointer capture keeps strokes smooth past the sheet edge — but no
//     logic depends on pointerleave (see memory: capture fires a lying one).

import {
  DESIGN_CUTOUT,
  DESIGN_GROUND_Y,
  DESIGN_LIMITS,
  DESIGN_SHEET,
  type AvatarDesign,
  type DesignStamp,
  type DesignStroke,
  type StrokeMedium,
} from '../../../shared/src/index';
import {
  BRUSH_WIDTHS,
  STROKE_MEDIA,
  CATEGORY_ORDER,
  CRAYONS,
  PAPER_COLORS,
  PAPER_PATTERNS,
  SILHOUETTES,
  STAMPS,
  STAMP_CATEGORY_ORDER,
  findSilhouette,
  findStamp,
  type SilhouetteTemplate,
  type StampTemplate,
} from './catalog';
import { designToSvg, silhouettePathFor } from './render';
import { refreshAllBacking, refreshBacking } from './stampBacking';
import { saveDesign } from './wardrobe';

export type AvatarEditorResult = {
  design: AvatarDesign;
};

export type AvatarEditorOptions = {
  /** Edit this design (opens on the style step); omit to start at shapes. */
  initial?: AvatarDesign;
  onSave: (result: AvatarEditorResult) => void;
  onCancel?: () => void;
};

/** A blank sheet: round pal on kraft paper, nothing drawn yet. */
export function newDesign(): AvatarDesign {
  const now = Date.now();
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: 'untitled cutout',
    silhouette: 'round-pal',
    paper: { color: 'kraft', pattern: 'plain' },
    strokes: [],
    preset: findSilhouette('round-pal').preset,
    sharedOnCard: false,
    createdAt: now,
    updatedAt: now,
  };
}

type Step = 'shape' | 'outline' | 'style';

/**
 * The three tools on the studio bench.
 *
 * Split out of one combined panel (2026-08-15) because they compete for the
 * same gesture: dragging a stamp and drawing a stroke are both "press and move
 * on the sheet". Rather than guessing which one you meant, the studio asks
 * which tool you picked up, and only that one is live.
 */
type Tool = 'stamps' | 'limbs' | 'draw';

/** Distance below which pointer samples are dropped (sheet units). */
const MIN_SAMPLE_DIST = 0.8;

function sortedShapes(): SilhouetteTemplate[] {
  return [...SILHOUETTES].sort((a, b) => {
    const cat = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return cat !== 0 ? cat : a.label.localeCompare(b.label);
  });
}

function matchesQuery(
  item: SilhouetteTemplate | StampTemplate,
  query: string,
): boolean {
  if (query.length === 0) return true;
  const haystack = [item.label, item.category, ...item.keywords].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}

function sortedStamps(): StampTemplate[] {
  return [...STAMPS].sort((a, b) => {
    const category =
      STAMP_CATEGORY_ORDER.indexOf(a.category) - STAMP_CATEGORY_ORDER.indexOf(b.category);
    return category !== 0 ? category : a.label.localeCompare(b.label);
  });
}

/**
 * Where a stamp lands when you add it — near where it belongs, so the common
 * case needs no adjusting at all and the fiddly case starts close.
 *
 * Not a slot system: the stamp is free to be dragged anywhere afterwards
 * (including right off the cutout, which is the point of appendages). This is
 * only a first guess, and it guesses from the stamp's own category and key.
 */
function defaultPlacement(template: StampTemplate): { x: number; y: number } {
  const centreX = DESIGN_CUTOUT.x + DESIGN_CUTOUT.width / 2;
  const top = DESIGN_CUTOUT.y;
  const height = DESIGN_CUTOUT.height;

  if (template.category === 'hair') return { x: centreX, y: top + height * 0.06 };
  if (template.key.startsWith('legs') || template.key.startsWith('feet')) {
    return { x: centreX, y: DESIGN_GROUND_Y - 4 };
  }
  if (template.key.startsWith('arm')) {
    // Off to one side, deliberately outside the cutout — an arm that lands on
    // top of the body reads as a mistake even though it is easy to drag.
    return { x: DESIGN_CUTOUT.x + DESIGN_CUTOUT.width + 4, y: top + height * 0.55 };
  }
  if (template.category === 'eyes') return { x: centreX, y: top + height * 0.3 };
  if (template.key.startsWith('brows')) return { x: centreX, y: top + height * 0.22 };
  if (template.key.startsWith('mouth') || template.key === 'whiskers') {
    return { x: centreX, y: top + height * 0.52 };
  }
  if (template.key.startsWith('nose')) return { x: centreX, y: top + height * 0.42 };
  if (template.key.startsWith('cheeks') || template.key === 'freckles') {
    return { x: centreX, y: top + height * 0.45 };
  }
  return { x: centreX, y: top + height * 0.5 };
}

/**
 * True while the studio is up.
 *
 * `main.ts` reads this to park the frame loop: the studio is opaque and
 * full-screen, so rendering the world behind it is wasted work, and letting it
 * keep simulating means time of day and critters drift while you are busy.
 * Coming out resumes exactly where you were.
 */
let studioOpen = false;

export function isAvatarStudioOpen(): boolean {
  return studioOpen;
}

export function openAvatarEditor(options: AvatarEditorOptions): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let design: AvatarDesign = structuredClone(options.initial ?? newDesign());

  let step: Step = options.initial ? 'style' : 'shape';
  let crayon = CRAYONS[1]!.color;
  let brush = BRUSH_WIDTHS[1]!.width;
  let erasing = false;
  let dirty = false;
  /**
   * Undo covers strokes AND stamps together — one history, because "undo"
   * meaning different things depending on what you touched last is exactly
   * the kind of surprise unlimited undo exists to prevent.
   */
  type Snapshot = { strokes: DesignStroke[]; stamps: DesignStamp[] };
  let undoStack: Snapshot[] = [];
  let redoStack: Snapshot[] = [];
  /** Index into design.stamps of the stamp being adjusted, if any. */
  let selectedStamp: number | null = null;
  /**
   * Which tool is in your hand. This is the guard that keeps a drag on an arm
   * from leaving a crayon line behind it, and a scribble from nudging an eye:
   * only the active tool's pointer interactions are wired up at all.
   */
  let tool: Tool = 'stamps';
  let stampQuery = '';
  let limbQuery = '';
  let medium: StrokeMedium = 'crayon';
  /** Outline-in-progress for the "draw your avatar" step. */
  let outlinePoints: number[] = [];

  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay avatar-editor avatar-studio is-open';
  overlay.innerHTML = `
    <div class="hud-overlay-card avatar-editor-card" role="dialog" aria-modal="true"
         aria-labelledby="avatar-editor-title">
      <button class="hud-overlay-close" type="button" aria-label="Close the avatar editor">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="avatar-editor-title">The studio</h2>
      <p class="avatar-editor-status" role="status" aria-live="polite"></p>
      <div data-role="step"></div>
    </div>`;

  const $ = <T extends HTMLElement>(selector: string, root: HTMLElement = overlay): T => {
    const el = root.querySelector<T>(selector);
    if (!el) throw new Error(`avatar editor: missing ${selector}`);
    return el;
  };
  const stepHost = $('[data-role="step"]');
  const status = $('.avatar-editor-status');
  const announce = (text: string) => {
    status.textContent = text;
  };

  const markDirty = () => {
    dirty = true;
    design.updatedAt = Date.now();
  };

  // ==== Step 1: choose the cutout shape =====================================

  const renderShapeStep = () => {
    step = 'shape';
    stepHost.innerHTML = `
      <p class="avatar-editor-lead">First: what shape gets cut out? Search, browse, or draw your own.</p>
      <label class="avatar-editor-search-row">
        <span>Search shapes</span>
        <input type="search" class="avatar-editor-search"
               placeholder="try: dragon, token, fold, animal…" />
      </label>
      <div class="avatar-editor-shape-grid" data-role="grid" role="list"
           aria-label="Cutout shapes. First option: draw your own."></div>`;
    const grid = $('[data-role="grid"]', stepHost);
    const search = $<HTMLInputElement>('.avatar-editor-search', stepHost);

    const fillGrid = () => {
      const query = search.value.trim();
      grid.innerHTML = '';

      // "Draw your avatar" is ALWAYS the first tile, search or no search.
      const draw = document.createElement('button');
      draw.type = 'button';
      draw.className = 'avatar-editor-shape-tile avatar-editor-shape-tile-draw';
      draw.setAttribute('role', 'listitem');
      draw.setAttribute(
        'aria-label',
        'Draw your avatar — draw the cutout outline yourself, then decorate it',
      );
      draw.innerHTML = `<span class="avatar-editor-draw-mark" aria-hidden="true">?</span>
        <span class="avatar-editor-shape-label">Draw your avatar</span>`;
      draw.addEventListener('click', () => {
        outlinePoints = [];
        renderOutlineStep();
        announce('Draw your cutout outline on the sheet, then confirm it.');
      });
      grid.appendChild(draw);

      let shown = 0;
      let lastCategory = '';
      for (const shape of sortedShapes()) {
        if (!matchesQuery(shape, query)) continue;
        shown += 1;
        if (shape.category !== lastCategory && query.length === 0) {
          lastCategory = shape.category;
          const header = document.createElement('h3');
          header.className = 'avatar-editor-shape-category';
          header.textContent = shape.category;
          grid.appendChild(header);
        }
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'avatar-editor-shape-tile';
        tile.setAttribute('role', 'listitem');
        tile.setAttribute('aria-label', `${shape.label} — ${shape.spoken}`);
        tile.title = shape.keywords.join(', ');
        // Frame the CUTOUT box, not the whole sheet: shape paths are fitted to
        // that box, and the ring around it is empty appendage room. Framing
        // the sheet would letterbox every thumbnail; framing 0,0 would crop
        // them, which is what it did until this was noticed. The 3-unit bleed
        // clears the 2.4-wide cut edge.
        tile.innerHTML = `<svg viewBox="${DESIGN_CUTOUT.x - 3} ${DESIGN_CUTOUT.y - 3} ${
          DESIGN_CUTOUT.width + 6
        } ${DESIGN_CUTOUT.height + 6}" aria-hidden="true">
            <path d="${shape.path}" fill="#c9a876" stroke="#f3ecdc" stroke-width="2.4" stroke-linejoin="round"/>
          </svg><span class="avatar-editor-shape-label">${shape.label}</span>`;
        tile.addEventListener('click', () => pickShape(shape));
        grid.appendChild(tile);
      }
      if (shown === 0) {
        const none = document.createElement('p');
        none.className = 'avatar-editor-shape-none';
        none.textContent = 'No shapes match — but the drawing option never goes away.';
        grid.appendChild(none);
      }
      if (query.length > 0) announce(`${shown} shape${shown === 1 ? '' : 's'} match.`);
    };

    search.addEventListener('input', fillGrid);
    fillGrid();
    search.focus();
  };

  const pickShape = (shape: SilhouetteTemplate) => {
    const fresh = newDesign();
    fresh.silhouette = shape.key;
    fresh.preset = shape.preset;
    fresh.name = design.name;
    design = fresh;
    dirty = false;
    undoStack = [];
    redoStack = [];
    renderStyleStep();
    announce(`Cutout shape: ${shape.label}. Now pick paper, pattern, and crayons.`);
  };

  // ==== Step 2 (custom only): draw the outline ==============================

  const renderOutlineStep = () => {
    step = 'outline';
    stepHost.innerHTML = `
      <p class="avatar-editor-lead">Draw the outline of your cutout — one continuous line works best.
        We'll close the loop and cut along it.</p>
      <div class="avatar-editor-columns">
        <div class="avatar-editor-controls">
          <div class="avatar-editor-swatches">
            <button type="button" data-action="outline-restart">Start over</button>
            <button type="button" data-action="outline-back">Back to shapes</button>
            <button type="button" class="avatar-editor-save" data-action="outline-confirm" disabled>
              Use this shape</button>
          </div>
          <p class="avatar-editor-sheet-hint">Prefer not to draw? "Back to shapes" has ready-made
            cutouts — they're a full avatar on their own.</p>
        </div>
        <div class="avatar-editor-sheet-wrap">
          <div class="avatar-editor-sheet" data-role="sheet"
               aria-label="Outline sheet. Draw the cutout edge with a mouse, finger, or stylus."></div>
        </div>
      </div>`;
    const confirm = $<HTMLButtonElement>('[data-action="outline-confirm"]', stepHost);

    const redrawOutline = () => {
      const pts: string[] = [];
      for (let i = 0; i + 1 < outlinePoints.length; i += 2) {
        pts.push(`${outlinePoints[i]},${outlinePoints[i + 1]}`);
      }
      const preview =
        outlinePoints.length >= 6
          ? `<polygon points="${pts.join(' ')}" fill="rgba(201,168,118,0.55)" stroke="#4a453c" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="4 2"/>`
          : `<polyline points="${pts.join(' ')}" fill="none" stroke="#4a453c" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 2"/>`;
      // The dashed guide is where template cutouts live. Drawing outside it is
      // allowed — it is your cutout — but the ring is where arms and hair go,
      // so a body drawn out there will have stamps landing on top of it.
      const guide =
        `<rect x="${DESIGN_CUTOUT.x}" y="${DESIGN_CUTOUT.y}" width="${DESIGN_CUTOUT.width}" ` +
        `height="${DESIGN_CUTOUT.height}" fill="none" stroke="rgba(74,69,60,0.3)" ` +
        `stroke-width="0.8" stroke-dasharray="4 3"/>`;
      $('[data-role="sheet"]', stepHost).innerHTML =
        `<svg class="avatar-editor-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DESIGN_SHEET.width} ${DESIGN_SHEET.height}">${guide}${preview}</svg>`;
      confirm.disabled = outlinePoints.length < 6;
    };

    wireSheetDrawing(
      $('[data-role="sheet"]', stepHost),
      (x, y) => {
        if (outlinePoints.length >= DESIGN_LIMITS.maxOutlinePoints * 2) return;
        outlinePoints.push(x, y);
        redrawOutline();
      },
      () => announce('Outline continued. Confirm when it looks right.'),
    );

    stepHost.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
        .action;
      if (action === 'outline-restart') {
        outlinePoints = [];
        redrawOutline();
        announce('Outline cleared — draw a new one.');
      }
      if (action === 'outline-back') renderShapeStep();
      if (action === 'outline-confirm' && outlinePoints.length >= 6) {
        const fresh = newDesign();
        fresh.silhouette = 'custom';
        fresh.customOutline = [...outlinePoints];
        fresh.name = design.name;
        design = fresh;
        dirty = true; // a drawn outline is already work worth warning about
        undoStack = [];
        redoStack = [];
        renderStyleStep();
        announce('Custom cutout confirmed. Now pick paper, pattern, and crayons.');
      }
    });
    redrawOutline();
  };

  // ==== Step 3: paper color, paper pattern, crayons =========================

  const renderStyleStep = () => {
    step = 'style';
    const shapeLabel =
      design.silhouette === 'custom'
        ? 'your own drawn cutout'
        : findSilhouette(design.silhouette).label;
    stepHost.innerHTML = `
      <div class="studio-bar">
        <div class="studio-bar-left">
          <label class="avatar-editor-name-row">
            <span class="swatch-label">Name this cutout</span>
            <input class="avatar-editor-name" type="text" maxlength="40"
                   placeholder="name of the avatar" />
          </label>
          <p class="studio-cutout"><strong>${shapeLabel}</strong>
            <button type="button" data-action="change-shape">Change shape…</button></p>
        </div>
        <div class="studio-bar-right">
          <button type="button" data-action="cancel">Cancel</button>
          <button type="button" class="avatar-editor-save" data-action="save">Save</button>
        </div>
      </div>
      <div class="avatar-editor-warning" data-role="warning" hidden>
        <p>Changing the shape starts a fresh cutout — the paper, stamps, and drawing you picked
        here will reset. Save this one to your wardrobe first?</p>
        <div class="avatar-editor-swatches">
          <button type="button" class="avatar-editor-save" data-action="warn-save">Save to wardrobe, then change</button>
          <button type="button" data-action="warn-discard">Change without saving</button>
          <button type="button" data-action="warn-keep">Keep editing this one</button>
        </div>
      </div>

      <div class="studio-room">
        <aside class="studio-shelf">
          <h3 class="studio-heading">Paper stack</h3>
          <p class="avatar-editor-hint">The stock your cutout is scissored from. Change it any
            time — it never interrupts what you are doing.</p>
          <fieldset class="avatar-editor-group">
            <legend>Colour</legend>
            <div class="avatar-editor-swatches" data-role="papers"></div>
          </fieldset>
          <fieldset class="avatar-editor-group">
            <legend>Pattern</legend>
            <div class="avatar-editor-swatches" data-role="patterns"></div>
          </fieldset>
        </aside>

        <section class="studio-table">
          <div class="avatar-editor-sheet" data-role="sheet"></div>
          <p class="studio-sheet-hint" data-role="sheet-hint"></p>
        </section>

        <aside class="studio-layers">
          <h3 class="studio-heading">Layers</h3>
          <p class="avatar-editor-hint">Top of the list is nearest the front. The drawing is a
            layer too, so faces can sit over it or under it.</p>
          <ul class="layer-list" data-role="layers"></ul>
          <div class="avatar-editor-swatches" data-role="stamp-colors"></div>
          <div class="avatar-editor-swatches avatar-editor-stamp-controls" data-role="stamp-actions"></div>
        </aside>

        <aside class="studio-bench">
          <div class="studio-tabs" role="tablist" aria-label="What you are working with">
            <button type="button" role="tab" data-tab="stamps" id="studio-tab-stamps"
                    aria-controls="studio-panel-stamps">Faces</button>
            <button type="button" role="tab" data-tab="limbs" id="studio-tab-limbs"
                    aria-controls="studio-panel-limbs">Arms &amp; hair</button>
            <button type="button" role="tab" data-tab="draw" id="studio-tab-draw"
                    aria-controls="studio-panel-draw">Draw</button>
          </div>

          <div class="studio-panel" role="tabpanel" data-panel="stamps" id="studio-panel-stamps"
               aria-labelledby="studio-tab-stamps">
            <p class="avatar-editor-hint">Eyes, mouths, noses — these stick <em>on</em> the
              cutout and stay inside its edge.</p>
            <label class="avatar-editor-search-row">
              <span>Search faces</span>
              <input class="avatar-editor-search" type="search" data-role="stamp-search"
                     placeholder="eyes, smile, freckles…" />
            </label>
            <div class="avatar-editor-stamp-tray" data-role="stamp-tray" role="list"></div>
          </div>

          <div class="studio-panel" role="tabpanel" data-panel="limbs" id="studio-panel-limbs"
               aria-labelledby="studio-tab-limbs" hidden>
            <p class="avatar-editor-hint">Arms, legs, hair and wings are glued <em>behind</em>
              the cutout, so they can hang right off the edge of it.</p>
            <label class="avatar-editor-search-row">
              <span>Search arms &amp; hair</span>
              <input class="avatar-editor-search" type="search" data-role="limb-search"
                     placeholder="arm, boots, curls…" />
            </label>
            <div class="avatar-editor-stamp-tray" data-role="limb-tray" role="list"></div>
          </div>

          <div class="studio-panel" role="tabpanel" data-panel="draw" id="studio-panel-draw"
               aria-labelledby="studio-tab-draw" hidden>
            <p class="avatar-editor-hint">Drawing stays inside the cutout. It is one layer, so
              you can send it behind a face or bring it in front, over in Layers.</p>
            <fieldset class="avatar-editor-group">
              <legend>Colour</legend>
              <div class="avatar-editor-swatches" data-role="crayons"></div>
            </fieldset>
            <fieldset class="avatar-editor-group">
              <legend>Medium</legend>
              <p class="avatar-editor-hint">Watercolour and spray are see-through — pass over the
                same place again to deepen it, and the paper still shows through.</p>
              <div class="avatar-editor-swatches" data-role="media"></div>
            </fieldset>
            <fieldset class="avatar-editor-group">
              <legend>Brush</legend>
              <div class="avatar-editor-swatches" data-role="brushes"></div>
            </fieldset>
            <div class="avatar-editor-swatches" data-role="tools">
              <button type="button" data-action="eraser" aria-pressed="false">Eraser — remove a whole stroke</button>
              <button type="button" data-action="undo">Undo</button>
              <button type="button" data-action="redo">Redo</button>
              <button type="button" data-action="clear">Clear drawing</button>
            </div>
          </div>
        </aside>
      </div>`;

    const nameInput = $<HTMLInputElement>('.avatar-editor-name', stepHost);
    nameInput.value = design.name;
    nameInput.addEventListener('input', () => {
      markDirty();
    });

    const sheet = $('[data-role="sheet"]', stepHost);
    const sheetHint = $('[data-role="sheet-hint"]', stepHost);

    // ==== Tools: which one is in your hand ==================================

    /** Which stamp layer this tool works with, or null when it draws. */
    const layerForTool = (t: Tool) => (t === 'stamps' ? 'on' : t === 'limbs' ? 'behind' : null);

    const SHEET_LABEL: Record<Tool, string> = {
      stamps: 'Your cutout. Drag a face piece to move it; crayon is off on this tab.',
      limbs: 'Your cutout. Drag an arm, leg or hair piece to move it; crayon is off on this tab.',
      draw: 'Your cutout. Draw on it with a mouse, finger, or stylus. Stamps are locked.',
    };
    const SHEET_HINT: Record<Tool, string> = {
      stamps: 'Drag a face piece to move it, or use the buttons — they do the same things.',
      limbs: 'These sit behind the cutout, so you can drag them right off the edge of it.',
      draw: 'Draw on the cutout. Nothing you stamped on can be nudged while you are drawing.',
    };

    const setTool = (next: Tool) => {
      tool = next;
      // Leaving a stamp tool drops the selection: a stamp that stayed selected
      // while you drew would offer buttons that move something whose handles
      // are no longer on screen.
      if (layerForTool(next) === null) selectedStamp = null;
      else if (selectedStamp !== null) {
        const current = design.stamps?.[selectedStamp];
        const template = current ? findStamp(current.key) : null;
        if (!template || template.layer !== layerForTool(next)) selectedStamp = null;
      }
      erasing = erasing && next === 'draw';

      for (const button of stepHost.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
        const active = button.dataset.tab === next;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      }
      for (const panel of stepHost.querySelectorAll<HTMLElement>('[data-panel]')) {
        panel.hidden = panel.dataset.panel !== next;
      }
      sheet.setAttribute('aria-label', SHEET_LABEL[next]);
      sheet.classList.toggle('is-drawing-tool', next === 'draw');
      sheetHint.textContent = SHEET_HINT[next];
      refreshControls();
      renderTray();
      renderLayers();
      redraw();
      announce(
        next === 'draw'
          ? 'Drawing. Stamps are locked while you draw.'
          : next === 'limbs'
            ? 'Arms and hair. Crayon is off.'
            : 'Faces. Crayon is off.',
      );
    };

    for (const button of stepHost.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      button.addEventListener('click', () => setTool(button.dataset.tab as Tool));
      button.addEventListener('keydown', (event) => {
        // Roving tablist: arrows move between tabs, per the WAI-ARIA pattern.
        const order: Tool[] = ['stamps', 'limbs', 'draw'];
        const index = order.indexOf(button.dataset.tab as Tool);
        const to =
          event.key === 'ArrowRight'
            ? order[(index + 1) % order.length]
            : event.key === 'ArrowLeft'
              ? order[(index + order.length - 1) % order.length]
              : null;
        if (!to) return;
        event.preventDefault();
        setTool(to);
        stepHost.querySelector<HTMLButtonElement>(`[data-tab="${to}"]`)?.focus();
      });
    }

    const redraw = () => {
      sheet.innerHTML = designToSvg(design, { shadow: true });
      const svg = sheet.querySelector('svg');
      if (!svg) return;
      svg.classList.add('avatar-editor-svg');
      svg.insertAdjacentHTML('beforeend', handlesSvg());

      for (const handle of svg.querySelectorAll<SVGElement>('[data-handle]')) {
        handle.addEventListener('pointerdown', (event) => {
          event.stopPropagation();
          beginStampTransform(
            event as PointerEvent,
            handle.dataset.handle === 'corner' ? 'corner' : 'rotate',
          );
        });
      }

      // Dragging is the *fast* path, never the only one — every adjustment a
      // drag makes also exists as a button (see renderPlacedStamps).
      const grabbable = layerForTool(tool);
      svg.querySelectorAll<SVGGElement>('[data-stamp]').forEach((node) => {
        const index = Number(node.dataset.stamp);
        const template = findStamp(design.stamps?.[index]?.key ?? '');
        // Only the active tool's own layer is grabbable. That is the whole
        // point of the tabs: no ambiguity about what a drag is going to hit.
        if (!template || template.layer !== grabbable) return;
        node.classList.add('is-stamp');
        if (index === selectedStamp) node.classList.add('is-selected');
        node.addEventListener('pointerdown', (event) => {
          event.stopPropagation(); // never start a crayon stroke on a stamp
          selectStamp(index);
          beginStampDrag(event, index);
        });
      });

      if (erasing && tool === 'draw') {
        svg.querySelectorAll('polyline').forEach((line, index) => {
          line.classList.add('is-erasable');
          line.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            pushUndo();
            design.strokes.splice(index, 1);
            markDirty();
            redraw();
            announce('Stroke erased.');
          });
        });
      }
    };

    const snapshot = (): Snapshot => ({
      strokes: structuredClone(design.strokes),
      stamps: structuredClone(design.stamps ?? []),
    });
    const restore = (state: Snapshot) => {
      design.strokes = state.strokes;
      design.stamps = state.stamps;
      if (selectedStamp !== null && selectedStamp >= state.stamps.length) selectedStamp = null;
    };
    const pushUndo = () => {
      undoStack.push(snapshot());
      redoStack = [];
    };

    // ==== Stamps ============================================================

    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));

    /** Pointer position in sheet coordinates, or null if the sheet has no size. */
    const sheetPoint = (event: PointerEvent): { x: number; y: number } | null => {
      const svg = sheet.querySelector('svg');
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((event.clientX - rect.left) / rect.width) * DESIGN_SHEET.width,
        y: ((event.clientY - rect.top) / rect.height) * DESIGN_SHEET.height,
      };
    };

    const stampAt = (index: number | null): DesignStamp | null =>
      index === null ? null : (design.stamps?.[index] ?? null);

    const describeStamp = (stamp: DesignStamp): string =>
      findStamp(stamp.key)?.label ?? stamp.key;

    // ==== Direct manipulation: handles on the selected stamp ================
    //
    // The Adobe grammar, because it is the one everybody already knows: drag
    // the body to move, drag a corner to resize, drag just *outside* the box
    // to turn. Handles are drawn in sheet space rather than inside the stamp's
    // own transform, so they stay the same size however small the stamp is —
    // a handle you cannot hit is not a handle.
    //
    // Every one of these also has a keyboard equivalent (see onSheetKey):
    // handles are precise pointer work, and precise pointer work must never be
    // the only way to do something.

    /** Corners of a placed stamp, in sheet coordinates, in TL TR BR BL order. */
    const stampCorners = (stamp: DesignStamp, template: StampTemplate) => {
      const scale = stamp.scale * template.defaultScale;
      const halfWidth = (template.width / 2) * scale;
      const halfHeight = (template.height / 2) * scale;
      const radians = (stamp.rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return (
        [
          [-halfWidth, -halfHeight],
          [halfWidth, -halfHeight],
          [halfWidth, halfHeight],
          [-halfWidth, halfHeight],
        ] as Array<[number, number]>
      ).map(([x, y]): [number, number] => [
        stamp.x + x * cos - y * sin,
        stamp.y + x * sin + y * cos,
      ]);
    };

    const handlesSvg = (): string => {
      const stamp = stampAt(selectedStamp);
      const template = stamp ? findStamp(stamp.key) : null;
      if (!stamp || !template) return '';

      const corners = stampCorners(stamp, template);
      const points = corners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

      // The rotate ring is a real, hittable band just outside the box: an
      // even-odd polygon of "corners pushed outward" minus "the box itself".
      const RING = 9;
      const grown = corners
        .map(([x, y]) => {
          const length = Math.hypot(x - stamp.x, y - stamp.y) || 1;
          const gx = x + ((x - stamp.x) / length) * RING;
          const gy = y + ((y - stamp.y) / length) * RING;
          return `${gx.toFixed(2)},${gy.toFixed(2)}`;
        })
        .join(' ');

      const dots = corners
        .map(
          ([x, y], i) =>
            `<circle class="stamp-handle" data-handle="corner" data-corner="${i}" ` +
            `cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.6"/>`,
        )
        .join('');

      return (
        `<g class="stamp-handles">` +
        `<polygon class="stamp-handle-ring" data-handle="rotate" points="${grown} ${points}" ` +
        `fill-rule="evenodd"/>` +
        `<polygon class="stamp-handle-box" points="${points}"/>` +
        dots +
        `</g>`
      );
    };

    /** Resize (from a corner) or rotate (from the ring), both about the centre. */
    const beginStampTransform = (event: PointerEvent, mode: 'corner' | 'rotate') => {
      const index = selectedStamp;
      const stamp = stampAt(index);
      const template = stamp ? findStamp(stamp.key) : null;
      const start = sheetPoint(event);
      if (!stamp || !template || index === null || !start) return;

      const startScale = stamp.scale;
      const startRotation = stamp.rotation;
      const startDistance = Math.hypot(start.x - stamp.x, start.y - stamp.y) || 1;
      const startAngle = Math.atan2(start.y - stamp.y, start.x - stamp.x);
      pushUndo();
      let moved = false;

      const onMove = (move: PointerEvent) => {
        const point = sheetPoint(move);
        if (!point) return;
        moved = true;
        if (mode === 'corner') {
          const distance = Math.hypot(point.x - stamp.x, point.y - stamp.y);
          stamp.scale = clamp(
            (startScale * distance) / startDistance,
            DESIGN_LIMITS.stampScaleMin,
            DESIGN_LIMITS.stampScaleMax,
          );
        } else {
          const angle = Math.atan2(point.y - stamp.y, point.x - stamp.x);
          let next = startRotation + ((angle - startAngle) * 180) / Math.PI;
          // Shift snaps to 15 degrees — the same increment the keyboard uses.
          if (move.shiftKey) next = Math.round(next / 15) * 15;
          stamp.rotation = (((next % 360) + 540) % 360) - 180;
        }
        markDirty();
        redraw();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        if (!moved) {
          undoStack.pop();
          return;
        }
        if (refreshBacking(design, index)) redraw();
        announce(
          mode === 'corner'
            ? `${describeStamp(stamp)} resized.`
            : `${describeStamp(stamp)} turned to ${Math.round(stamp.rotation)} degrees.`,
        );
      };
      // Capture phase, for the same reason the move drag uses it: the studio
      // stops pointerup at its own edge so the world never sees it.
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    };

    /**
     * The non-pointer path for everything the handles do: arrows nudge,
     * shift+arrows resize, [ and ] turn, Delete removes. The sheet is
     * focusable so a keyboard user can reach all of it.
     */
    const onSheetKey = (event: KeyboardEvent) => {
      const index = selectedStamp;
      const stamp = stampAt(index);
      if (!stamp || index === null) return;
      const nudge = event.altKey ? 0.5 : 2;
      const grow = 1.1;
      let handled = true;

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        if (event.shiftKey) {
          stamp.scale = clamp(
            stamp.scale * (direction < 0 ? grow : 1 / grow),
            DESIGN_LIMITS.stampScaleMin,
            DESIGN_LIMITS.stampScaleMax,
          );
        } else {
          stamp.y = clamp(stamp.y + direction * nudge, 0, DESIGN_SHEET.height);
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        if (event.shiftKey) {
          stamp.scale = clamp(
            stamp.scale * (direction < 0 ? 1 / grow : grow),
            DESIGN_LIMITS.stampScaleMin,
            DESIGN_LIMITS.stampScaleMax,
          );
        } else {
          stamp.x = clamp(stamp.x + direction * nudge, 0, DESIGN_SHEET.width);
        }
      } else if (event.key === '[' || event.key === ']') {
        stamp.rotation = (((stamp.rotation + (event.key === '[' ? -15 : 15) + 540) % 360)) - 180;
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        adjustStamp('remove');
        return;
      } else {
        handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      pushUndo();
      refreshBacking(design, index);
      markDirty();
      redraw();
    };

    const selectStamp = (index: number | null) => {
      selectedStamp = index;
      renderLayers();
      redraw();
      const stamp = stampAt(index);
      if (stamp) announce(`${describeStamp(stamp)} selected. Move it with the arrows below.`);
    };

    const beginStampDrag = (event: PointerEvent, index: number) => {
      const stamp = stampAt(index);
      const start = sheetPoint(event);
      if (!stamp || !start) return;
      const originX = stamp.x;
      const originY = stamp.y;
      pushUndo();
      let moved = false;

      // Listeners live on the window rather than using pointer capture: capture
      // fires a lying pointerleave (see the editor header note), and a drag
      // that ends off the sheet is completely normal for an arm.
      const onMove = (move: PointerEvent) => {
        const point = sheetPoint(move);
        if (!point) return;
        moved = true;
        stamp.x = clamp(originX + (point.x - start.x), 0, DESIGN_SHEET.width);
        stamp.y = clamp(originY + (point.y - start.y), 0, DESIGN_SHEET.height);
        markDirty();
        redraw();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        // A click that never moved is a selection, not an edit — don't leave
        // a no-op on the undo stack for it.
        if (!moved) {
          undoStack.pop();
          return;
        }
        // Where it landed decides whether it needs its own paper.
        if (refreshBacking(design, index)) redraw();
        announce(`${describeStamp(stamp)} moved.`);
      };
      // CAPTURE phase, deliberately. The studio stops `pointerup` at its own
      // edge so the world never sees it — which also means a bubble-phase
      // listener up on the window never fires, and the stamp stays glued to
      // the cursor forever. Capture runs on the way *down*, before that.
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
    };

    const addStamp = (template: StampTemplate) => {
      const stamps = design.stamps ?? [];
      if (stamps.length >= DESIGN_LIMITS.maxStamps) {
        announce(`That is all the stamps one cutout can hold (${DESIGN_LIMITS.maxStamps}).`);
        return;
      }
      pushUndo();
      const { x, y } = defaultPlacement(template);
      design.stamps = [...stamps, { key: template.key, x, y, scale: 1, rotation: 0, flip: false, color: crayon }];
      selectedStamp = design.stamps.length - 1;
      refreshBacking(design, selectedStamp);
      markDirty();
      renderLayers();
      redraw();
      announce(
        `${template.label} added${template.layer === 'behind' ? ' behind the cutout' : ''}. ` +
          'Drag it, or use the buttons below.',
      );
    };

    /** Every adjustment a drag can make also exists here, as a button. */
    const adjustStamp = (action: string) => {
      const index = selectedStamp;
      const stamp = stampAt(index);
      if (!stamp || index === null) return announce('Pick a stamp first.');
      pushUndo();
      if (action === 'flip') stamp.flip = !stamp.flip;
      if (action === 'hide') {
        if (stamp.hidden) delete stamp.hidden;
        else stamp.hidden = true;
        announce(`${describeStamp(stamp)} ${stamp.hidden ? 'hidden' : 'showing'}.`);
      }
      if (action === 'forward' || action === 'back') {
        const to = action === 'forward' ? index + 1 : index - 1;
        const stamps = design.stamps ?? [];
        if (to < 0 || to >= stamps.length) {
          undoStack.pop();
          return announce(action === 'forward' ? 'Already on top.' : 'Already at the back.');
        }
        [stamps[index], stamps[to]] = [stamps[to]!, stamps[index]!];
        selectedStamp = to;
      }
      if (action === 'remove') {
        design.stamps = (design.stamps ?? []).filter((_, i) => i !== index);
        selectedStamp = null;
        announce(`${describeStamp(stamp)} removed. Undo brings it back.`);
      }
      if (selectedStamp !== null) refreshBacking(design, selectedStamp);
      markDirty();
      renderLayers();
      redraw();
    };

    /** A little swatch of the stamp itself, so the tray is browsable by eye. */
    const stampThumb = (template: StampTemplate): string => {
      const parts = template.parts
        .map(
          (part) =>
            `<path d="${part.path}" fill="${part.role === 'paper' ? '#f0ead9' : part.role === 'shadow' ? '#9c8a6a' : '#2b2620'}"/>`,
        )
        .join('');
      return `<svg viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">${parts}</svg>`;
    };

    /** The tray for whichever stamp tool is active. */
    const renderTray = () => {
      const layer = layerForTool(tool);
      if (layer === null) return; // the Draw tab has crayons, not a tray
      const host = $(`[data-role="${layer === 'on' ? 'stamp' : 'limb'}-tray"]`, stepHost);
      const query = layer === 'on' ? stampQuery : limbQuery;
      const matches = sortedStamps().filter(
        (template) => template.layer === layer && matchesQuery(template, query),
      );
      host.innerHTML = '';
      if (matches.length === 0) {
        host.innerHTML =
          '<p class="avatar-editor-hint">Nothing matches that. Try "eye", "arm" or "hair".</p>';
        return;
      }
      for (const template of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-editor-stamp-tile';
        button.setAttribute('role', 'listitem');
        button.setAttribute(
          'aria-label',
          `${template.label} — ${template.spoken}. ` +
            (template.layer === 'behind' ? 'Goes behind the cutout.' : 'Sticks on the cutout.'),
        );
        button.innerHTML = `${stampThumb(template)}<span>${template.label}</span>`;
        button.addEventListener('click', () => addStamp(template));
        host.appendChild(button);
      }
    };

    /**
     * The layers panel — everything on the cutout, bottom of the stack at the
     * bottom of the list, the way every graphics app does it.
     *
     * Rows are: "behind" stamps, then the cutout itself (fixed, never moves),
     * then the "on" stamps with the DRAWING interleaved among them. Hide and
     * delete live on the row rather than in a toolbar somewhere else, because
     * a control that acts on one thing belongs next to that thing.
     */
    type LayerRow =
      | { kind: 'stamp'; index: number; stamp: DesignStamp; label: string; hidden: boolean }
      | { kind: 'drawing'; label: string; hidden: boolean }
      | { kind: 'cutout'; label: string };

    /** On-stamps in paint order, with the drawing slotted in at drawingIndex. */
    const onStampEntries = () =>
      (design.stamps ?? [])
        .map((stamp, index) => ({ stamp, index }))
        .filter(({ stamp }) => findStamp(stamp.key)?.layer === 'on');

    const layerRows = (): LayerRow[] => {
      const behind = (design.stamps ?? [])
        .map((stamp, index) => ({ stamp, index }))
        .filter(({ stamp }) => findStamp(stamp.key)?.layer === 'behind')
        .map(
          ({ stamp, index }): LayerRow => ({
            kind: 'stamp',
            index,
            stamp,
            label: describeStamp(stamp),
            hidden: stamp.hidden === true,
          }),
        );

      const on = onStampEntries();
      const cut = Math.min(design.drawingIndex ?? on.length, on.length);
      const toRow = ({ stamp, index }: { stamp: DesignStamp; index: number }): LayerRow => ({
        kind: 'stamp',
        index,
        stamp,
        label: describeStamp(stamp),
        hidden: stamp.hidden === true,
      });

      const drawing: LayerRow[] =
        design.strokes.length > 0
          ? [
              {
                kind: 'drawing',
                label: `drawing (${design.strokes.length} ${
                  design.strokes.length === 1 ? 'stroke' : 'strokes'
                })`,
                hidden: design.drawingHidden === true,
              },
            ]
          : [];

      // Top of the stack first, so the list reads the way the picture stacks.
      return [
        ...on.slice(cut).map(toRow).reverse(),
        ...drawing,
        ...on.slice(0, cut).map(toRow).reverse(),
        { kind: 'cutout', label: `cutout — ${shapeLabel}` },
        ...behind.reverse(),
      ];
    };

    /** Move a stamp within design.stamps, or the drawing within the on-stack. */
    const moveLayer = (row: LayerRow, to: 'up' | 'down' | 'front' | 'back') => {
      pushUndo();
      if (row.kind === 'drawing') {
        const count = onStampEntries().length;
        const current = Math.min(design.drawingIndex ?? count, count);
        const next =
          to === 'front' ? count : to === 'back' ? 0 : to === 'up' ? current + 1 : current - 1;
        const clamped = clamp(next, 0, count);
        if (clamped === current) {
          undoStack.pop();
          return announce(to === 'up' || to === 'front' ? 'Drawing is on top.' : 'Drawing is at the back.');
        }
        design.drawingIndex = clamped;
      } else if (row.kind === 'stamp') {
        const stamps = design.stamps ?? [];
        // Reorder within this stamp's own pass: "behind" pieces never
        // interleave with faces, so moving an arm up should not jump it in
        // front of an eye.
        const layer = findStamp(row.stamp.key)?.layer;
        const siblings = stamps
          .map((stamp, index) => ({ stamp, index }))
          .filter(({ stamp }) => findStamp(stamp.key)?.layer === layer);
        const position = siblings.findIndex(({ index }) => index === row.index);
        const target =
          to === 'front'
            ? siblings.length - 1
            : to === 'back'
              ? 0
              : to === 'up'
                ? position + 1
                : position - 1;
        if (target < 0 || target >= siblings.length || target === position) {
          undoStack.pop();
          return announce(to === 'up' || to === 'front' ? 'Already on top.' : 'Already at the back.');
        }
        const order = siblings.map(({ index }) => index);
        const moved = order.splice(position, 1)[0]!;
        order.splice(target, 0, moved);
        // Write the reordered stamps back into the slots they occupied.
        const slots = siblings.map(({ index }) => index).sort((a, b) => a - b);
        const picked = order.map((index) => stamps[index]!);
        slots.forEach((slot, i) => {
          stamps[slot] = picked[i]!;
        });
        // Follow the moved layer with the selection, so the handles stay on
        // the thing you just reordered.
        selectedStamp = slots[target] ?? null;
      }
      markDirty();
      renderLayers();
      redraw();
    };

    /**
     * What you can do to the selected stamp beyond dragging it: colour, flip,
     * remove. Kept in the layers rail rather than under the sheet, because a
     * panel that grows and shrinks under the artwork resizes the artwork with
     * it — which is exactly what it used to do.
     */
    const renderSelection = () => {
      const colors = $('[data-role="stamp-colors"]', stepHost);
      const actions = $('[data-role="stamp-actions"]', stepHost);
      const stamp = stampAt(selectedStamp);
      colors.innerHTML = '';
      actions.innerHTML = '';
      if (!stamp || layerForTool(tool) === null) return;

      // Any add-on takes any colour. Only the `ink` role recolours; paper and
      // shadow stay tied to the stock, so a stamp never stops looking like it
      // was cut from the same pack as the cutout.
      for (const option of CRAYONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-editor-dot';
        button.setAttribute('aria-pressed', String(stamp.color === option.color));
        button.setAttribute('aria-label', option.label);
        button.title = option.label;
        button.style.setProperty('--swatch', option.color);
        button.addEventListener('click', () => {
          pushUndo();
          stamp.color = option.color;
          markDirty();
          renderSelection();
          redraw();
          announce(`${describeStamp(stamp)}: ${option.label}.`);
        });
        colors.appendChild(button);
      }

      for (const [action, label] of [
        ['flip', 'Flip'],
        ['hide', stamp.hidden ? 'Show' : 'Hide'],
        ['remove', 'Remove'],
      ] as Array<[string, string]>) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => adjustStamp(action));
        actions.appendChild(button);
      }
    };

    const renderLayers = () => {
      renderSelection();
      const host = $('[data-role="layers"]', stepHost);
      const rows = layerRows();
      host.innerHTML = rows
        .map((row, position) => {
          const isSelected =
            row.kind === 'stamp' && row.index === selectedStamp && layerForTool(tool) !== null;
          const hidden = row.kind === 'cutout' ? false : row.hidden;
          const controls =
            row.kind === 'cutout'
              ? '<span class="layer-fixed">always here</span>'
              : `<button type="button" class="layer-eye" data-layer="${position}" data-layer-action="hide"
                     aria-pressed="${hidden}" title="${hidden ? 'Show' : 'Hide'}"
                     aria-label="${hidden ? 'Show' : 'Hide'} ${row.label}">${hidden ? '◌' : '◉'}</button>
                 <button type="button" data-layer="${position}" data-layer-action="up" aria-label="Move ${row.label} up">↑</button>
                 <button type="button" data-layer="${position}" data-layer-action="down" aria-label="Move ${row.label} down">↓</button>
                 <button type="button" data-layer="${position}" data-layer-action="front" aria-label="Bring ${row.label} to the front">⤒</button>
                 <button type="button" data-layer="${position}" data-layer-action="back" aria-label="Send ${row.label} to the back">⤓</button>
                 <button type="button" class="layer-delete" data-layer="${position}" data-layer-action="delete"
                     aria-label="Delete ${row.label}">✕</button>`;
          return `<li class="layer-row${isSelected ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}">
              <button type="button" class="layer-name" data-layer="${position}" data-layer-action="select"
                  aria-pressed="${isSelected}">${row.label}</button>
              <span class="layer-controls">${controls}</span>
            </li>`;
        })
        .join('');

      for (const button of host.querySelectorAll<HTMLButtonElement>('[data-layer-action]')) {
        button.addEventListener('click', () => {
          const row = rows[Number(button.dataset.layer)];
          if (!row) return;
          const action = button.dataset.layerAction;
          if (action === 'select') {
            if (row.kind !== 'stamp') return announce(`${row.label} — nothing to select.`);
            // Selecting a face from the layers list while holding the arm tool
            // would give handles you cannot see; switch tools with it.
            const layer = findStamp(row.stamp.key)?.layer;
            if (layer && layerForTool(tool) !== layer) setTool(layer === 'on' ? 'stamps' : 'limbs');
            selectStamp(row.index);
            return;
          }
          if (action === 'hide') {
            pushUndo();
            if (row.kind === 'drawing') {
              if (design.drawingHidden) delete design.drawingHidden;
              else design.drawingHidden = true;
            } else if (row.kind === 'stamp') {
              if (row.stamp.hidden) delete row.stamp.hidden;
              else row.stamp.hidden = true;
            }
            markDirty();
            renderLayers();
            redraw();
            announce(`${row.label} ${row.kind !== 'cutout' && row.hidden ? 'showing' : 'hidden'}.`);
            return;
          }
          if (action === 'delete') {
            pushUndo();
            if (row.kind === 'drawing') {
              design.strokes = [];
              announce('Drawing cleared. Undo brings it back.');
            } else if (row.kind === 'stamp') {
              design.stamps = (design.stamps ?? []).filter((_, i) => i !== row.index);
              selectedStamp = null;
              announce(`${row.label} removed. Undo brings it back.`);
            }
            markDirty();
            renderLayers();
            redraw();
            return;
          }
          moveLayer(row, action as 'up' | 'down' | 'front' | 'back');
        });
      }
    };

    for (const role of ['stamp-search', 'limb-search'] as const) {
      const input = $<HTMLInputElement>(`[data-role="${role}"]`, stepHost);
      input.value = role === 'stamp-search' ? stampQuery : limbQuery;
      input.addEventListener('input', () => {
        if (role === 'stamp-search') stampQuery = input.value.trim();
        else limbQuery = input.value.trim();
        renderTray();
      });
      // Typing "w" in a search box must not walk the avatar around outside.
      input.addEventListener('keydown', (event) => event.stopPropagation());
    }

    type SwatchSpec = {
      label: string;
      pressed: boolean;
      swatchColor?: string;
      /** Inline SVG/markup shown instead of a colour chip (brush previews). */
      preview?: string;
      onPick: () => void;
    };
    const fillSwatches = (role: string, specs: SwatchSpec[]) => {
      const host = $(`[data-role="${role}"]`, stepHost);
      host.innerHTML = '';
      for (const spec of specs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-editor-swatch';
        button.setAttribute('aria-pressed', String(spec.pressed));
        button.title = spec.label;
        if (spec.preview) {
          button.innerHTML = `${spec.preview}<span class="swatch-label">${spec.label}</span>`;
        } else if (spec.swatchColor) {
          button.style.setProperty('--swatch', spec.swatchColor);
          button.innerHTML =
            `<span class="avatar-editor-swatch-chip" aria-hidden="true"></span>` +
            `<span class="swatch-label">${spec.label}</span>`;
        } else {
          button.innerHTML = `<span class="swatch-label">${spec.label}</span>`;
        }
        button.addEventListener('click', () => {
          spec.onPick();
          refreshControls();
          redraw();
        });
        host.appendChild(button);
      }
    };

    const refreshControls = () => {
      fillSwatches(
        'papers',
        PAPER_COLORS.map((p) => ({
          label: p.label,
          pressed: design.paper.color === p.key,
          swatchColor: p.fill,
          onPick: () => {
            design.paper.color = p.key;
            markDirty();
            announce(`Paper: ${p.label}.`);
          },
        })),
      );
      fillSwatches(
        'patterns',
        PAPER_PATTERNS.map((p) => ({
          label: p.label,
          pressed: design.paper.pattern === p.key,
          onPick: () => {
            design.paper.pattern = p.key;
            markDirty();
            announce(`Paper pattern: ${p.label}.`);
          },
        })),
      );
      fillSwatches(
        'crayons',
        CRAYONS.map((c) => ({
          label: c.label,
          pressed: !erasing && crayon === c.color,
          swatchColor: c.color,
          onPick: () => {
            crayon = c.color;
            erasing = false;
            announce(`Crayon: ${c.label}.`);
          },
        })),
      );
      fillSwatches(
        'media',
        STROKE_MEDIA.map((m) => ({
          label: `${m.label} — ${m.hint}`,
          pressed: medium === m.key,
          onPick: () => {
            medium = m.key;
            erasing = false;
            announce(`Medium: ${m.label}.`);
          },
        })),
      );
      fillSwatches(
        'brushes',
        BRUSH_WIDTHS.map((b) => ({
          label: b.label,
          pressed: brush === b.width,
          // The swatch IS the brush: a dab at the width it will actually draw.
          preview:
            `<svg class="brush-preview" viewBox="0 0 40 16" aria-hidden="true">` +
            `<line x1="4" y1="8" x2="36" y2="8" stroke="currentColor" ` +
            `stroke-width="${b.width * 1.8}" stroke-linecap="round"/></svg>`,
          onPick: () => {
            brush = b.width;
            announce(`Brush: ${b.label}.`);
          },
        })),
      );
      $('[data-action="eraser"]', stepHost).setAttribute('aria-pressed', String(erasing));
    };

    // Freehand drawing on the styled cutout.
    let liveStroke: DesignStroke | null = null;

    wireSheetDrawing(
      sheet,
      (x, y, phase) => {
        // The tab is the only guard now. Drawing always lands on the sheet;
        // whether a stamp ends up over or under it is a question of layer
        // order, answered in the layers panel.
        if (tool !== 'draw' || erasing) return;
        if (phase === 'start') {
          pushUndo();
          liveStroke = {
            color: crayon,
            width: brush,
            points: [x, y],
            ...(medium === 'crayon' ? {} : { medium }),
          };
          design.strokes.push(liveStroke);
          markDirty();
          renderLayers();
        } else if (liveStroke) {
          liveStroke.points.push(x, y);
          redraw();
        }
      },
      () => {
        if (!liveStroke) return;
        if (liveStroke.points.length === 2) {
          liveStroke.points.push(liveStroke.points[0]! + 0.6, liveStroke.points[1]! + 0.6);
        }
        liveStroke = null;
        redraw();
        announce('Stroke drawn.');
      },
    );

    const warning = $('[data-role="warning"]', stepHost);
    stepHost.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
        .action;
      if (!action) return;
      if (action === 'change-shape') {
        if (!dirty) {
          renderShapeStep();
          return;
        }
        warning.hidden = false;
        announce('Changing the shape resets this cutout. Save it to your wardrobe first?');
        $<HTMLButtonElement>('[data-action="warn-save"]', stepHost).focus();
      }
      if (action === 'warn-keep') {
        warning.hidden = true;
        announce('Keeping this cutout.');
      }
      if (action === 'warn-save') {
        design.name = nameInput.value.replace(/\s+/g, ' ').trim() || 'untitled cutout';
        design.updatedAt = Date.now();
        if (!saveDesign(structuredClone(design))) {
          announce('Your wardrobe is stuffed — delete a design there first.');
          return;
        }
        announce(`Saved "${design.name}" to your wardrobe.`);
        renderShapeStep();
      }
      if (action === 'warn-discard') renderShapeStep();
      if (action === 'save') {
        design.name = nameInput.value.replace(/\s+/g, ' ').trim() || 'untitled cutout';
        design.updatedAt = Date.now();
        close();
        options.onSave({ design: structuredClone(design) });
      }
      if (action === 'cancel') cancel();
      if (action === 'eraser') {
        erasing = !erasing;
        refreshControls();
        redraw();
        announce(erasing ? 'Eraser on — pick a stroke to remove it.' : 'Eraser off.');
      }
      if (action === 'undo') {
        const prev = undoStack.pop();
        if (!prev) return announce('Nothing to undo.');
        redoStack.push(snapshot());
        restore(prev);
        markDirty();
        refreshControls();
        renderLayers();
        redraw();
        announce('Undone.');
      }
      if (action === 'redo') {
        const next = redoStack.pop();
        if (!next) return announce('Nothing to redo.');
        undoStack.push(snapshot());
        restore(next);
        markDirty();
        refreshControls();
        renderLayers();
        redraw();
        announce('Redone.');
      }
      if (action === 'clear') {
        if (design.strokes.length === 0) return announce('Nothing drawn yet.');
        pushUndo();
        design.strokes = [];
        markDirty();
        redraw();
        announce('Drawing cleared. Undo brings it back.');
      }
    });

    refreshAllBacking(design);
    // setTool does the first paint of everything it governs.
    setTool(tool);
    nameInput.focus();
  };

  // ==== Shared sheet-drawing wiring =========================================

  function wireSheetDrawing(
    sheet: HTMLElement,
    onPoint: (x: number, y: number, phase: 'start' | 'move') => void,
    onEnd: () => void,
  ): void {
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    const toSheetPoint = (event: PointerEvent): { x: number; y: number } | null => {
      const svg = sheet.querySelector('svg');
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((event.clientX - rect.left) / rect.width) * DESIGN_SHEET.width,
        y: ((event.clientY - rect.top) / rect.height) * DESIGN_SHEET.height,
      };
    };
    sheet.addEventListener('pointerdown', (event) => {
      const point = toSheetPoint(event);
      if (!point) return;
      sheet.setPointerCapture(event.pointerId);
      drawing = true;
      lastX = point.x;
      lastY = point.y;
      onPoint(point.x, point.y, 'start');
    });
    sheet.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const point = toSheetPoint(event);
      if (!point) return;
      if (Math.hypot(point.x - lastX, point.y - lastY) < MIN_SAMPLE_DIST) return;
      lastX = point.x;
      lastY = point.y;
      onPoint(point.x, point.y, 'move');
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      onEnd();
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  }

  // ==== Open/close ==========================================================

  const close = () => {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keydown', swallowStrayKeys, true);
    window.removeEventListener('keyup', swallowStrayKeys, true);
    overlay.remove();
    studioOpen = false;
    opener?.focus();
  };

  const cancel = () => {
    if (dirty && !window.confirm('Discard the changes to this cutout?')) return;
    close();
    options.onCancel?.();
  };

  overlay.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('hud-overlay-close')) cancel();
  });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    }
  };

  /**
   * Keys aimed at nothing in particular (focus on the body, a stray W) must
   * not reach the world's window listener. Keys inside the studio are left
   * alone — capture-phase stopPropagation here would eat our own inputs.
   */
  const swallowStrayKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    if (event.target instanceof Node && overlay.contains(event.target)) return;
    event.stopPropagation();
  };
  document.addEventListener('keydown', onKeydown, true);

  // ---- Sealing the studio off from the world -------------------------------
  //
  // The world listens on the window, so without this a scroll meant for the
  // stamp tray also zooms the camera, and a WASD keypress walks you somewhere
  // while you are choosing eyebrows. Overlays in hudMenus.ts do the same
  // thing; this one additionally freezes the world (see isAvatarStudioOpen),
  // because it is meant to feel like a different room, not a panel over one.
  for (const eventName of ['pointerdown', 'pointerup', 'wheel', 'click', 'contextmenu'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }

  document.body.appendChild(overlay);
  studioOpen = true;
  window.addEventListener('keydown', swallowStrayKeys, true);
  window.addEventListener('keyup', swallowStrayKeys, true);
  if (step === 'style') renderStyleStep();
  else renderShapeStep();
}

/** Re-exported so Phase B wiring can render the confirmed cutout path. */
export { silhouettePathFor };
