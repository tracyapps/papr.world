import {
  TECH_DEFS,
  describeTechTask,
  formatLearningDuration,
  techNodeStatus,
  type TechNodeId,
  type TechTaskDef,
} from './catalogs/techTree';
import {
  getGameState,
  updateGameState,
  type ActiveLearningState,
  type GameState,
} from './state';

const HOUR_MS = 60 * 60 * 1000;
const SETTLE_INTERVAL_MS = 60 * 1000;

export type LearningTaskProgress = {
  completed: boolean;
  current: number;
  description: string;
  target: number;
  weight: number;
};

export type LearningProgress = {
  fraction: number;
  nodeId: TechNodeId;
  remainingMs: number;
  tasks: LearningTaskProgress[];
};

export type StartLearningResult =
  | { ok: true; message: string }
  | { ok: false; reason: string };

function isTechNodeId(value: string): value is TechNodeId {
  return value in TECH_DEFS;
}

function completedOutputCount(state: Readonly<GameState>, recipeId: string): number {
  return state.world.thingMaker.completedOutputs.filter((id) => id === recipeId).length;
}

function taskBaselineCount(state: Readonly<GameState>, task: TechTaskDef): number {
  return task.kind === 'make' ? completedOutputCount(state, task.recipeId) : 0;
}

function taskProgress(
  state: Readonly<GameState>,
  learning: Readonly<ActiveLearningState>,
  task: TechTaskDef,
  index: number,
): LearningTaskProgress {
  const alreadyCompleted = learning.completedTaskIndexes.includes(index);
  if (task.kind === 'own-tool') {
    const current = alreadyCompleted || (state.player.tools[task.toolId] ?? 0) > 0 ? 1 : 0;
    return {
      completed: current === 1,
      current,
      description: describeTechTask(task),
      target: 1,
      weight: task.weight,
    };
  }

  const madeSinceStart = Math.max(
    0,
    completedOutputCount(state, task.recipeId) - (learning.taskBaselineCounts[index] ?? 0),
  );
  const current = alreadyCompleted ? task.quantity : Math.min(task.quantity, madeSinceStart);
  return {
    completed: current >= task.quantity,
    current,
    description: describeTechTask(task),
    target: task.quantity,
    weight: task.weight,
  };
}

export function getLearningProgress(
  state: Readonly<GameState>,
  now: number,
): LearningProgress | null {
  const learning = state.player.activeLearning;
  if (!learning || !isTechNodeId(learning.nodeId)) return null;
  const node = TECH_DEFS[learning.nodeId];
  if (node.readiness !== 'ready') return null;

  const durationMs = node.learningHours * HOUR_MS;
  const tasks = node.tasks.map((task, index) => taskProgress(state, learning, task, index));
  const totalWeight = tasks.reduce((sum, task) => sum + task.weight, 0);
  const completedWeight = tasks.reduce(
    (sum, task) => sum + (task.completed ? task.weight : 0),
    0,
  );
  // Weight is a shared authored value scale. Dividing by the node's complete
  // task set makes completing every finite task an alternate full payment,
  // while elapsed time and partial task credit can meet in the middle.
  const taskCreditMs = totalWeight > 0 ? durationMs * (completedWeight / totalWeight) : 0;
  const elapsedMs = Math.max(0, now - learning.startedAt);
  const earnedMs = Math.min(durationMs, elapsedMs + taskCreditMs);

  return {
    fraction: durationMs > 0 ? earnedMs / durationMs : 1,
    nodeId: learning.nodeId,
    remainingMs: Math.max(0, durationMs - earnedMs),
    tasks,
  };
}

function completeLearning(state: GameState, nodeId: TechNodeId) {
  const node = TECH_DEFS[nodeId];
  if (node.readiness !== 'ready') return;
  for (const recipeId of node.grants) {
    if (!state.player.plans.includes(recipeId)) state.player.plans.push(recipeId);
  }
  state.player.activeLearning = null;
}

/**
 * Fold newly satisfied tasks and elapsed time into persisted state.
 * Returns the completed node id when this call crosses the finish boundary.
 */
export function reconcileTechLearningState(state: GameState, now: number): TechNodeId | null {
  const learning = state.player.activeLearning;
  if (!learning) return null;
  if (!isTechNodeId(learning.nodeId) || TECH_DEFS[learning.nodeId].readiness !== 'ready') {
    state.player.activeLearning = null;
    return null;
  }

  const progress = getLearningProgress(state, now);
  if (!progress) {
    state.player.activeLearning = null;
    return null;
  }
  learning.completedTaskIndexes = progress.tasks.flatMap((task, index) => (
    task.completed ? [index] : []
  ));
  if (progress.fraction < 1) return null;

  completeLearning(state, progress.nodeId);
  return progress.nodeId;
}

export function startTechLearningState(
  state: GameState,
  nodeId: TechNodeId,
  now: number,
): StartLearningResult {
  const current = state.player.activeLearning;
  if (current) {
    const currentName = isTechNodeId(current.nodeId) ? TECH_DEFS[current.nodeId].name : 'Another lesson';
    return { ok: false, reason: `${currentName} is already being learned.` };
  }

  const node = TECH_DEFS[nodeId];
  if (node.readiness !== 'ready') {
    return { ok: false, reason: 'That lesson is still only on the roadmap.' };
  }
  const status = techNodeStatus(nodeId, state);
  if (status === 'owned') return { ok: false, reason: `${node.name} is already learned.` };
  if (status !== 'available') return { ok: false, reason: 'Learn the earlier lessons first.' };
  if (!Number.isFinite(now) || now < 0) return { ok: false, reason: 'Learning could not start yet.' };

  const taskBaselineCounts = node.tasks.map((task) => taskBaselineCount(state, task));
  const learning: ActiveLearningState = {
    nodeId,
    startedAt: now,
    taskBaselineCounts,
    completedTaskIndexes: [],
  };
  state.player.activeLearning = learning;
  // An own-tool task can be true at the moment the lesson begins. Persist it
  // immediately so gifting the tool later never makes earned progress regress.
  const progress = getLearningProgress(state, now);
  learning.completedTaskIndexes = progress?.tasks.flatMap((task, index) => (
    task.completed ? [index] : []
  )) ?? [];
  return { ok: true, message: `Started learning ${node.name}.` };
}

export function startTechLearning(nodeId: TechNodeId, now = Date.now()): StartLearningResult {
  let result: StartLearningResult = { ok: false, reason: 'Learning could not start.' };
  updateGameState((state) => {
    reconcileTechLearningState(state, now);
    result = startTechLearningState(state, nodeId, now);
  });
  return result;
}

function needsReconcile(state: Readonly<GameState>, now: number): boolean {
  const learning = state.player.activeLearning;
  if (!learning) return false;
  const progress = getLearningProgress(state, now);
  if (!progress) return true;
  if (progress.fraction >= 1) return true;
  return progress.tasks.some((task, index) => (
    task.completed && !learning.completedTaskIndexes.includes(index)
  ));
}

/** Quietly settle the clock; no toast, notification, or completion message. */
export function settleTechLearning(now = Date.now()): TechNodeId | null {
  if (!needsReconcile(getGameState(), now)) return null;
  let completed: TechNodeId | null = null;
  updateGameState((state) => {
    completed = reconcileTechLearningState(state, now);
  });
  return completed;
}

let settleTimer: ReturnType<typeof setInterval> | null = null;

export function initializeTechLearning() {
  settleTechLearning(Date.now());
  if (!settleTimer) {
    settleTimer = setInterval(() => settleTechLearning(Date.now()), SETTLE_INTERVAL_MS);
  }
}

export function describeLearningProgress(fraction: number): string {
  if (fraction >= 1) return 'Lesson complete';
  if (fraction < 0.12) return 'Just started';
  if (fraction < 0.42) return 'About a third of the way';
  if (fraction < 0.68) return 'About halfway there';
  if (fraction < 0.9) return 'Most of the way there';
  return 'Nearly learned';
}

export function describeLearningRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return 'ready';
  return `${formatLearningDuration(Math.max(remainingMs / HOUR_MS, 0.25))} left`;
}
