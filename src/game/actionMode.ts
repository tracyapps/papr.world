import { cancelTimedAction } from './timedAction';

export type ActionMode = 'interact' | 'dig' | 'plant' | 'place' | 'trim';

type ActionModeListener = (mode: ActionMode) => void;

let activeActionMode: ActionMode = 'interact';
const listeners = new Set<ActionModeListener>();

export function getActionMode() {
  return activeActionMode;
}

export function setActionMode(mode: ActionMode) {
  if (mode === activeActionMode) return;
  cancelTimedAction('tool-changed');
  activeActionMode = mode;
  for (const listener of listeners) listener(mode);
}

export function onActionModeChanged(listener: ActionModeListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
