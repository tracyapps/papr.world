import { describe, expect, it, vi } from 'vitest';
import { getActionMode, onActionModeChanged, setActionMode } from './actionMode';

describe('action mode', () => {
  it('starts in the safe interaction mode and only notifies on a real change', () => {
    setActionMode('interact');
    const listener = vi.fn();
    const unsubscribe = onActionModeChanged(listener);

    setActionMode('interact');
    setActionMode('dig');

    expect(getActionMode()).toBe('dig');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('dig');

    unsubscribe();
    setActionMode('interact');
    expect(listener).toHaveBeenCalledOnce();
  });
});
