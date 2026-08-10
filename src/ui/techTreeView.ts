import { getToolArt } from '../game/toolPresentation';
import { RECIPE_DEFS } from '../sim/catalogs/recipes';
import { RESOURCE_CORE_DEFS } from '../sim/catalogs/resources';
import {
  TECH_BRANCH_ORDER,
  TECH_DEFS,
  describeTechTask,
  formatLearningDuration,
  missingTechPrerequisites,
  techBranchLabel,
  techNodeColumn,
  techNodePreviewGrants,
  techNodeStatus,
  techNodeUnlocks,
  techNodesInBranch,
  techTreeColumnCount,
  type TechBranchId,
  type TechNodeId,
  type TechNodeStatus,
} from '../sim/catalogs/techTree';
import { TOOL_DEFS, type ToolId } from '../sim/catalogs/tools';
import { getGameState, onGameStateChanged } from '../sim/state';
import {
  describeLearningProgress,
  describeLearningRemaining,
  getLearningProgress,
  settleTechLearning,
  startTechLearning,
} from '../sim/learning';

// The knowledge tree's view — roadmap Phase 1.1. Redesigned 2026-08-07,
// second time that day, against an owner mockup: a shared timeline grid
// rather than independent per-branch lanes. Column position is now
// `techNodeColumn` — derived from the real `requires` graph, not
// hand-positioned — so "some branches start together, some gate on others"
// (the mockup's own framing) is a property of the data, visible for free.
//
// "The graph is a view over a list, and the list is the real thing"
// (knowledge-tree.md) still holds underneath the grid: every branch is a
// real <ol>, tab order follows dependency order within it, and a browser
// scrolls a focused card into view on its own inside the one shared
// horizontal-scroll container.
//
// Per the owner: the full requirement sentence is now screen-reader-only
// (`.sr-only` — present for assistive tech, takes no visual space). Sighted
// users get *no* visual requirement indicator from this pass on purpose —
// that is the owner's own visual-design work to add on top, not a guess of
// mine to make for them. `.tech-node-requirement-indicator` is an empty,
// unstyled hook already sitting on every card with a requirement, waiting
// for that design.
//
// 2026-08-08, the floating sticky-note pass, per the owner's rough draft:
// the big solid paper dialog is gone — `.tech-tree-viewport` is transparent
// over the dim backdrop, and the title, the branch labels, and every node
// card float as their own sticky notes (tape, tilt, torn corner). The
// grants tier now renders as real icon medallions — tool art through
// `getToolArt()` where a tool has a drawing, a plain monogram chip where it
// does not (the same "playable before the art lands" rule toolPresentation
// already uses) — with the tool name always beside it, per knowledge-tree.md's
// "Named, not just pictured." The small "Then reaches" tier and concept-node
// previews stay as labelled chips, since nothing behind them has art yet.
//
// What has to survive any redesign regardless of how it looks: status is
// never colour-only, a concept node is never dressed up to look more
// finished than it is, and the full requirement text always exists somewhere
// in the DOM even when nothing on screen shows it.

let overlay: HTMLElement | null = null;
let lastFocused: HTMLElement | null = null;
let isOpen = false;
let selectedNodeId: TechNodeId | null = null;
let learningActionMessage = '';

const STATUS_LABEL: Record<TechNodeStatus, string> = {
  owned: 'Learned',
  available: 'Ready to start',
  locked: 'Locked',
  'not-built': 'Not yet in the game',
};

function nodeRequirementText(nodeId: TechNodeId, status: TechNodeStatus): string {
  const node = TECH_DEFS[nodeId];
  const reqIds = node.requires as TechNodeId[];
  if (reqIds.length === 0) return 'No requirements — open to start with.';

  const describe = (reqId: TechNodeId) => {
    const req = TECH_DEFS[reqId];
    // Name the source branch when a requirement reaches outside this node's
    // own branch — with no connecting line drawn on screen, this is the
    // only place that fact is ever stated.
    return req.branch === node.branch ? req.name : `${req.name} (${techBranchLabel(req.branch)})`;
  };

  const names = reqIds.map(describe);
  if (status === 'not-built' || status === 'owned' || status === 'available') {
    return `Needs: ${names.join(', ')}.`;
  }
  const missingNames = missingTechPrerequisites(nodeId, getGameState()).map(describe);
  return `Needs: ${names.join(', ')}. Still waiting on: ${missingNames.join(', ')}.`;
}

function compactRequirementText(nodeId: TechNodeId, status: TechNodeStatus): string {
  const node = TECH_DEFS[nodeId];
  const reqIds = node.requires as TechNodeId[];
  if (reqIds.length === 0) return 'Starting point';

  const sourceIds = status === 'locked' ? missingTechPrerequisites(nodeId, getGameState()) : reqIds;
  const names = sourceIds.map((reqId) => TECH_DEFS[reqId].name);
  const first = names[0];
  const remainder = names.length > 1 ? ` + ${names.length - 1} more` : '';
  return status === 'locked'
    ? `Waiting on ${first}${remainder}`
    : `After ${first}${remainder}`;
}

function allTechNodeIds(): TechNodeId[] {
  return TECH_BRANCH_ORDER.flatMap(techNodesInBranch);
}

function availableTechNodeIds(): TechNodeId[] {
  const state = getGameState();
  const activeNodeId = state.player.activeLearning?.nodeId;
  return allTechNodeIds().filter((nodeId) => (
    nodeId !== activeNodeId && techNodeStatus(nodeId, state) === 'available'
  ));
}

function renderTreeOverview(): string {
  const state = getGameState();
  const nodeIds = allTechNodeIds();
  const progress = getLearningProgress(state, Date.now());
  const count = (status: TechNodeStatus) => (
    nodeIds.filter((nodeId) => techNodeStatus(nodeId, state) === status).length
  );
  const availableIds = availableTechNodeIds();
  const readyLinks = availableIds.length === 0
    ? '<span class="tech-tree-ready-empty">Nothing waiting right now</span>'
    : availableIds.map((nodeId) => `
        <button class="tech-tree-ready-link" type="button" data-tech-jump="${nodeId}">
          ${TECH_DEFS[nodeId].name}
        </button>`).join('');

  return `
    <div class="tech-tree-overview-summary" aria-label="Knowledge tree progress">
      ${progress ? '<span><strong>1</strong> learning</span>' : ''}
      <span><strong>${count('owned')}</strong> learned</span>
      <span><strong>${availableIds.length}</strong> ready next</span>
      <span><strong>${count('locked')}</strong> still locked</span>
      <span><strong>${count('not-built')}</strong> on the roadmap</span>
    </div>
    ${progress ? `
      <div class="tech-tree-current-learning" aria-label="Current lesson">
        <span class="tech-tree-ready-label">Learning now</span>
        <button class="tech-tree-ready-link" type="button" data-tech-jump="${progress.nodeId}">
          ${TECH_DEFS[progress.nodeId].name}
        </button>
        <span>${describeLearningProgress(progress.fraction)}</span>
      </div>` : ''}
    <div class="tech-tree-ready" aria-label="Skills ready next">
      <span class="tech-tree-ready-label">Ready next</span>
      ${readyLinks}
    </div>
    <p class="tech-tree-action-message" aria-live="polite">${learningActionMessage}</p>`;
}

/**
 * One grant, as a reusable icon medallion: a framed box with either the
 * tool's real artwork (via `getToolArt`, sized by the drawing's own aspect
 * ratio) or — for a tool whose drawing has not landed — a monogram chip,
 * the same "playable before the art arrives" treatment toolPresentation
 * already gives rail slots. The name always appears as a visible label:
 * knowledge-tree.md says "Named, not just pictured."
 */
function renderToolIcon(toolId: ToolId): string {
  const name = TOOL_DEFS[toolId].name;
  const art = getToolArt(toolId);
  const media = art
    ? `<img src="${art.sourceUrl}" alt="" />`
    : `<span class="tech-unlock-icon-mono" aria-hidden="true">${name.slice(0, 1)}</span>`;
  return `
    <li class="tech-unlock-icon" title="${name}">
      <span class="tech-unlock-icon-art">${media}</span>
      <span class="tech-unlock-icon-name">${name}</span>
    </li>`;
}

/** A labelled chip for the small tier — derived reaches and concept
 * previews, neither of which has artwork behind it yet. */
function renderUnlockChip(label: string): string {
  return `
    <li class="tech-unlock-chip">
      <span class="tech-unlock-chip-mono" aria-hidden="true">${label.slice(0, 1)}</span>
      <span class="tech-unlock-chip-label">${label}</span>
    </li>`;
}

function renderUnlocks(nodeId: TechNodeId): string {
  const node = TECH_DEFS[nodeId];
  if (node.readiness === 'concept') {
    const previewGrants = techNodePreviewGrants(nodeId);
    if (previewGrants.length === 0) return '';
    return `
      <div class="tech-node-unlock-tier tech-node-unlock-tier-preview">
        <span class="tech-node-unlock-label">Will eventually grant</span>
        <ul>${previewGrants.map(renderUnlockChip).join('')}</ul>
      </div>`;
  }

  const unlocks = techNodeUnlocks(nodeId);
  const grantToolIds = new Set(unlocks.grants);
  const resourceNames = unlocks.resources.map((resourceId) => RESOURCE_CORE_DEFS[resourceId].label);
  // Exclude any recipe whose own output is one of the tools already named in
  // "Grants" above it, so the same thing is never named twice on one card.
  const recipeNames = unlocks.recipes
    .filter((recipeId) => {
      const output = RECIPE_DEFS[recipeId].output;
      return !(output.kind === 'tool' && grantToolIds.has(output.toolId));
    })
    .map((recipeId) => RECIPE_DEFS[recipeId].output.label);

  const grantsBlock = `
    <div class="tech-node-unlock-tier tech-node-unlock-tier-large">
      <span class="tech-node-unlock-label">Grants</span>
      <ul>${unlocks.grants.map(renderToolIcon).join('')}</ul>
    </div>`;

  const smallItems = [...resourceNames, ...recipeNames];
  const smallBlock = smallItems.length === 0 ? '' : `
    <div class="tech-node-unlock-tier tech-node-unlock-tier-small">
      <span class="tech-node-unlock-label">Then reaches</span>
      <ul>${smallItems.map(renderUnlockChip).join('')}</ul>
    </div>`;

  return grantsBlock + smallBlock;
}

function renderLearningDetails(nodeId: TechNodeId, status: TechNodeStatus): string {
  const node = TECH_DEFS[nodeId];
  if (node.readiness !== 'ready') return '';
  const state = getGameState();
  const progress = getLearningProgress(state, Date.now());
  const isActive = progress?.nodeId === nodeId;
  if (isActive) {
    const percent = Math.round(progress.fraction * 100);
    return `
      <section class="tech-learning-panel" aria-label="Learning progress">
        <p class="tech-learning-eyebrow">Learning now</p>
        <p class="tech-learning-copy">
          <strong>${describeLearningProgress(progress.fraction)}</strong>
          <span>${describeLearningRemaining(progress.remainingMs)}</span>
        </p>
        <div class="tech-learning-meter" aria-hidden="true">
          <span style="width: ${percent}%"></span>
        </div>
        <p class="tech-learning-choice">Wait, or finish every task — either path completes the lesson.</p>
        <ul class="tech-learning-tasks">
          ${progress.tasks.map((task) => `
            <li class="${task.completed ? 'is-complete' : ''}">
              <span class="tech-learning-task-state">${task.completed ? 'Done' : 'To do'}</span>
              <span>${task.description}</span>
              ${task.target > 1 && !task.completed
                ? `<small>${task.current} of ${task.target}</small>` : ''}
            </li>`).join('')}
        </ul>
      </section>`;
  }

  const activeNodeId = state.player.activeLearning?.nodeId as TechNodeId | undefined;
  const activeName = activeNodeId && TECH_DEFS[activeNodeId] ? TECH_DEFS[activeNodeId].name : null;
  const action = status === 'available'
    ? activeName
      ? `<button class="tech-learning-start" type="button" disabled>Finish ${activeName} first</button>`
      : `<button class="tech-learning-start" type="button" data-tech-start="${nodeId}">Start learning</button>`
    : '';
  return `
    <p class="tech-node-cost">
      Cost: ${formatLearningDuration(node.learningHours)} to learn, or ${node.tasks.length}
      ${node.tasks.length === 1 ? 'task' : 'tasks'}.
    </p>
    <ul class="tech-node-tasks">
      ${node.tasks.map((task) => `<li>${describeTechTask(task)}</li>`).join('')}
    </ul>
    ${action}
    ${status === 'available' ? '<p class="tech-learning-start-note">Only one lesson at a time. Closing the game does not stop the clock.</p>' : ''}`;
}

/** `column`/`row` place the card in the branch's shared grid — see renderBranch. */
function renderNode(nodeId: TechNodeId, column: number, row: number): string {
  const node = TECH_DEFS[nodeId];
  const status = techNodeStatus(nodeId, getGameState());
  const isLearning = getGameState().player.activeLearning?.nodeId === nodeId;
  const isSelected = selectedNodeId === nodeId;
  const summaryId = `tech-node-summary-${nodeId}`;
  const requirementId = `tech-node-requirement-${nodeId}`;
  const detailsId = `tech-node-details-${nodeId}`;
  // +2: grid columns are 1-based, and column 1 is the sticky branch label.
  const style = `grid-column: ${column + 2}; grid-row: ${row + 1};`;
  return `
    <li class="tech-node tech-node-${status}${isLearning ? ' tech-node-learning' : ''}" data-tech-node="${nodeId}" style="${style}">
      <article class="tech-node-card${isSelected ? ' is-selected' : ''}">
        <div class="tech-node-heading">
          <h4>
            <button
              class="tech-node-select"
              type="button"
              data-tech-select="${nodeId}"
              aria-expanded="${isSelected}"
              aria-controls="${detailsId}"
              aria-describedby="${summaryId} ${requirementId}"
            >
              <span class="tech-node-select-name">${node.name}</span>
              <span class="tech-node-select-state" aria-hidden="true">${isSelected ? 'In focus' : 'View'}</span>
            </button>
          </h4>
          <span class="tech-node-status-badge tech-node-status-badge-${isLearning ? 'learning' : status}">${isLearning ? 'Learning now' : STATUS_LABEL[status]}</span>
        </div>
        <p class="tech-node-summary" id="${summaryId}">${node.summary}</p>
        <p class="tech-node-path tech-node-path-${status}" aria-hidden="true">
          ${compactRequirementText(nodeId, status)}
        </p>
        <p class="tech-node-requirement sr-only" id="${requirementId}">${nodeRequirementText(nodeId, status)}</p>
        <div class="tech-node-details" id="${detailsId}"${isSelected ? '' : ' hidden'}>
          ${renderUnlocks(nodeId)}
          ${renderLearningDetails(nodeId, status)}
        </div>
      </article>
    </li>`;
}

/**
 * One branch as a single flat CSS grid: column 1 is the sticky label,
 * columns 2..N+1 are the shared timeline tracks (`techTreeColumnCount()`,
 * identical across every branch so tracks line up), and a branch with more
 * than one node sharing a column stacks them into extra grid rows.
 *
 * Deliberately one flat grid rather than a label sidebar plus a nested
 * grid for the cards — nesting a `1fr`-sized track next to fixed-width
 * timeline columns makes the overflow-scroll math ambiguous. One grid with
 * only fixed-width tracks keeps "how wide is this row" unambiguous, which
 * is what lets every branch's columns agree on where column 5 actually is.
 */
function renderBranch(branch: TechBranchId, columnCount: number): string {
  const nodeIds = techNodesInBranch(branch);
  if (nodeIds.length === 0) return '';

  const byColumn = new Map<number, TechNodeId[]>();
  for (const id of nodeIds) {
    const column = techNodeColumn(id);
    const list = byColumn.get(column) ?? [];
    list.push(id);
    byColumn.set(column, list);
  }

  const rowCount = Math.max(1, ...[...byColumn.values()].map((list) => list.length));
  const cards = nodeIds.map((id) => {
    const column = techNodeColumn(id);
    const row = byColumn.get(column)!.indexOf(id);
    return renderNode(id, column, row);
  }).join('');

  const gridTemplateColumns = `var(--tech-label-width) repeat(${columnCount}, var(--tech-col-width))`;
  const gridTemplateRows = `repeat(${rowCount}, auto)`;

  return `
    <li
      class="tech-branch-row"
      data-branch="${branch}"
      style="grid-template-columns: ${gridTemplateColumns}; grid-template-rows: ${gridTemplateRows};"
    >
      <h3 class="tech-branch-label" style="grid-column: 1; grid-row: 1 / span ${rowCount};">
        ${techBranchLabel(branch)}
      </h3>
      <ol class="tech-branch-nodes">${cards}</ol>
    </li>`;
}

function buildOverlay(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hud-overlay tech-tree-overlay';
  const columnCount = techTreeColumnCount();
  element.innerHTML = `
    <div
      class="tech-tree-viewport"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tech-tree-title"
      aria-describedby="tech-tree-intro"
    >
      <button class="hud-overlay-close" type="button" aria-label="Close the knowledge tree">×</button>
      <header class="tech-tree-header">
        <p class="hud-overlay-kicker">Pencil and Paper</p>
        <h2 id="tech-tree-title">The knowledge tree</h2>
        <p id="tech-tree-intro" class="tech-tree-intro">
          See what you already know, what can come next, and where every branch leads.
          Skills farther right build on earlier lessons, sometimes from another subject.
        </p>
      </header>
      <section class="tech-tree-overview" aria-label="Your learning overview">
        ${renderTreeOverview()}
      </section>
      <div class="tech-tree-timeline-controls">
        <span class="tech-tree-timeline-hint">Follow the shared timeline</span>
        <div class="tech-tree-scroll-actions" role="group" aria-label="Move along the knowledge tree">
          <button type="button" data-tech-scroll="-1">Earlier</button>
          <span class="tech-tree-scroll-position" aria-live="polite">Start of the tree</span>
          <button type="button" data-tech-scroll="1">Later</button>
        </div>
      </div>
      <div class="tech-tree-grid">
        <ol class="tech-tree-branches">
          ${TECH_BRANCH_ORDER.map((branch) => renderBranch(branch, columnCount)).join('')}
        </ol>
      </div>
    </div>`;
  return element;
}

function render() {
  if (!overlay) return;
  if (!selectedNodeId) {
    const activeNodeId = getGameState().player.activeLearning?.nodeId as TechNodeId | undefined;
    selectedNodeId = activeNodeId ?? availableTechNodeIds()[0] ?? allTechNodeIds()[0] ?? null;
  }
  const list = overlay.querySelector<HTMLElement>('.tech-tree-branches');
  if (!list) return;
  const columnCount = techTreeColumnCount();
  list.innerHTML = TECH_BRANCH_ORDER.map((branch) => renderBranch(branch, columnCount)).join('');
  const overview = overlay.querySelector<HTMLElement>('.tech-tree-overview');
  if (overview) overview.innerHTML = renderTreeOverview();
  updateTimelineControls();
}

function updateTimelineControls() {
  if (!overlay) return;
  const grid = overlay.querySelector<HTMLElement>('.tech-tree-grid');
  if (!grid) return;
  const earlier = overlay.querySelector<HTMLButtonElement>('[data-tech-scroll="-1"]');
  const later = overlay.querySelector<HTMLButtonElement>('[data-tech-scroll="1"]');
  const position = overlay.querySelector<HTMLElement>('.tech-tree-scroll-position');
  const maxScroll = Math.max(0, grid.scrollWidth - grid.clientWidth);
  const atStart = grid.scrollLeft <= 2;
  const atEnd = maxScroll - grid.scrollLeft <= 2;
  if (earlier) earlier.disabled = atStart;
  if (later) later.disabled = atEnd;
  if (position) {
    position.textContent = atStart
      ? 'Start of the tree'
      : atEnd ? 'End of the tree' : 'Exploring later skills';
  }
}

function focusNode(nodeId: TechNodeId) {
  if (!overlay) return;
  selectedNodeId = nodeId;
  render();
  const button = overlay.querySelector<HTMLButtonElement>(`[data-tech-select="${nodeId}"]`);
  button?.focus({ preventScroll: true });
  button?.closest('.tech-node')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

export function isTechTreeViewOpen() {
  return isOpen;
}

export function closeTechTreeView(): boolean {
  if (!isOpen || !overlay) return false;
  overlay.classList.remove('is-open');
  isOpen = false;
  lastFocused?.focus();
  lastFocused = null;
  return true;
}

export function openTechTreeView(requestedNodeId?: TechNodeId) {
  if (isOpen) {
    if (requestedNodeId) focusNode(requestedNodeId);
    return;
  }
  settleTechLearning(Date.now());
  if (!overlay) {
    overlay = buildOverlay();
    for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
      overlay.addEventListener(eventName, (event) => event.stopPropagation());
    }
    overlay.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === overlay || target.closest('.hud-overlay-close')) {
        closeTechTreeView();
        return;
      }
      const start = target.closest<HTMLButtonElement>('[data-tech-start]');
      if (start) {
        const nodeId = start.dataset.techStart as TechNodeId;
        const result = startTechLearning(nodeId, Date.now());
        learningActionMessage = result.ok ? result.message : result.reason;
        focusNode(nodeId);
        return;
      }
      const select = target.closest<HTMLButtonElement>('[data-tech-select]');
      const jump = target.closest<HTMLButtonElement>('[data-tech-jump]');
      const nodeId = (select?.dataset.techSelect ?? jump?.dataset.techJump) as TechNodeId | undefined;
      if (nodeId && TECH_DEFS[nodeId]) {
        focusNode(nodeId);
        return;
      }
      const scroll = target.closest<HTMLButtonElement>('[data-tech-scroll]');
      if (scroll) {
        const direction = Number(scroll.dataset.techScroll);
        const grid = overlay?.querySelector<HTMLElement>('.tech-tree-grid');
        grid?.scrollBy({ left: direction * 552, behavior: 'smooth' });
      }
    });
    overlay.querySelector<HTMLElement>('.tech-tree-grid')?.addEventListener('scroll', updateTimelineControls);
    document.body.append(overlay);
  }
  render();
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.add('is-open');
  isOpen = true;
  if (requestedNodeId) focusNode(requestedNodeId);
  else overlay.querySelector<HTMLElement>('.hud-overlay-close')?.focus();
}

/**
 * Escape is handled through the game's own `onEscape` chain in main.ts
 * (the same one `closeHudMenu` uses), not a second document-level listener
 * here — two independent Escape handlers is how a dialog ends up eating a
 * keypress twice, or the world reacting to a key the dialog just consumed.
 */
export function initializeTechTreeView() {
  onGameStateChanged(() => {
    if (isOpen) render();
  });
}
