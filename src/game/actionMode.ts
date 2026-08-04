export type ActionMode = 'interact' | 'dig' | 'plant';

type ActionModeListener = (mode: ActionMode) => void;

let activeActionMode: ActionMode = 'interact';
const listeners = new Set<ActionModeListener>();

export function getActionMode() {
  return activeActionMode;
}

export function setActionMode(mode: ActionMode) {
  if (mode === activeActionMode) return;
  activeActionMode = mode;
  for (const listener of listeners) listener(mode);
}

export function onActionModeChanged(listener: ActionModeListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
