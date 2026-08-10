export type TimedActionKind = 'assemble' | 'build' | 'cook' | 'decorate' | 'harvest' | 'plant';

export type TimedActionStep = {
  id?: string;
  kind: TimedActionKind;
  /** Overrides the standard action word when a step benefits from specificity. */
  label?: string;
  durationMs: number;
};

export type TimedActionRequest = {
  steps: readonly TimedActionStep[];
  onStepComplete?: (step: TimedActionStep) => void;
  onComplete?: () => void;
  onCancel?: (reason: string) => void;
};

export type TimedActionSnapshot = { active: false } | {
  active: true;
  kind: TimedActionKind;
  label: string;
  progress: number;
  stepIndex: number;
  stepCount: number;
};

const ACTION_LABELS: Record<TimedActionKind, string> = {
  assemble: 'Assembling',
  build: 'Building',
  cook: 'Cooking',
  decorate: 'Decorating',
  harvest: 'Harvesting',
  plant: 'Planting',
};

type ActiveAction = {
  request: TimedActionRequest;
  stepIndex: number;
  stepStartedAt: number;
  stepCompletesAt: number;
};

/**
 * Renderer-free timed work state machine.
 *
 * Gameplay owns validation and mutation; this controller owns only elapsed
 * time and ordered callbacks. Keeping those responsibilities separate makes
 * a two-second garden action and a five-step structure build use the same
 * display without moving inventory rules into the HUD.
 */
export function createTimedActionController() {
  let active: ActiveAction | null = null;

  function start(request: TimedActionRequest, now: number): boolean {
    if (active || request.steps.length === 0) return false;
    if (request.steps.some((step) => !Number.isFinite(step.durationMs) || step.durationMs <= 0)) return false;
    active = {
      request,
      stepIndex: 0,
      stepStartedAt: now,
      stepCompletesAt: now + request.steps[0].durationMs,
    };
    return true;
  }

  function update(now: number) {
    while (active && now >= active.stepCompletesAt) {
      const finished = active.request.steps[active.stepIndex];
      const finishedAt = active.stepCompletesAt;
      active.request.onStepComplete?.(finished);
      active.stepIndex += 1;

      if (active.stepIndex >= active.request.steps.length) {
        const complete = active.request.onComplete;
        active = null;
        complete?.();
        return;
      }

      const next = active.request.steps[active.stepIndex];
      active.stepStartedAt = finishedAt;
      active.stepCompletesAt = finishedAt + next.durationMs;
    }
  }

  function snapshot(now: number): TimedActionSnapshot {
    if (!active) return { active: false };
    const step = active.request.steps[active.stepIndex];
    const duration = active.stepCompletesAt - active.stepStartedAt;
    return {
      active: true,
      kind: step.kind,
      label: step.label ?? ACTION_LABELS[step.kind],
      progress: Math.max(0, Math.min(1, (now - active.stepStartedAt) / duration)),
      stepIndex: active.stepIndex,
      stepCount: active.request.steps.length,
    };
  }

  function cancel(reason: string): boolean {
    if (!active) return false;
    const onCancel = active.request.onCancel;
    active = null;
    onCancel?.(reason);
    return true;
  }

  return {
    start,
    update,
    snapshot,
    cancel,
    isActive: () => active !== null,
  };
}

const timedActionController = createTimedActionController();
let root: HTMLElement | null = null;
let word: HTMLElement | null = null;
let fill: HTMLElement | null = null;
let stepCount: HTMLElement | null = null;

export function initializeTimedAction() {
  if (root || typeof document === 'undefined') return;
  root = document.createElement('section');
  root.className = 'timed-action';
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <strong class="timed-action-word"></strong>
    <div class="timed-action-track" aria-hidden="true"><span class="timed-action-fill"></span></div>
    <small class="timed-action-step"></small>`;
  document.body.append(root);
  word = root.querySelector('.timed-action-word');
  fill = root.querySelector('.timed-action-fill');
  stepCount = root.querySelector('.timed-action-step');

  // Development-only composition hook: keeps visual QA independent of a
  // particular save or a long walk to a build site. Production strips this
  // branch entirely.
  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(window.location.search).get('timedActionPreview');
    if (preview && preview in ACTION_LABELS) {
      const now = performance.now();
      timedActionController.start({
        steps: [{ kind: preview as TimedActionKind, durationMs: 100_000 }],
      }, now - 52_000);
      renderTimedAction(now);
    }
  }
}

function renderTimedAction(now: number) {
  const snapshot = timedActionController.snapshot(now);
  root?.classList.toggle('is-active', snapshot.active);
  root?.setAttribute('aria-hidden', String(!snapshot.active));
  document.documentElement.classList.toggle('is-timed-action', snapshot.active);
  if (!snapshot.active) return;
  if (word) {
    word.textContent = snapshot.label;
    word.dataset.actionKind = snapshot.kind;
  }
  if (fill) fill.style.transform = `scaleX(${snapshot.progress})`;
  if (stepCount) {
    stepCount.textContent = snapshot.stepCount > 1
      ? `Step ${snapshot.stepIndex + 1} of ${snapshot.stepCount} · Esc to stop`
      : 'Esc to stop';
  }
}

export function startTimedAction(request: TimedActionRequest): boolean {
  initializeTimedAction();
  const now = performance.now();
  const started = timedActionController.start(request, now);
  if (started) renderTimedAction(now);
  return started;
}

export function updateTimedAction(now = performance.now()) {
  timedActionController.update(now);
  renderTimedAction(now);
}

export function cancelTimedAction(reason = 'cancelled') {
  const cancelled = timedActionController.cancel(reason);
  if (cancelled) renderTimedAction(performance.now());
  return cancelled;
}

export function isTimedActionActive() {
  return timedActionController.isActive();
}
