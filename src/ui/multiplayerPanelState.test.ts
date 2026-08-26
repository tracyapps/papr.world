import { describe, expect, it, vi } from 'vitest';
import { revealMultiplayerPanel } from './multiplayerPanelState';

describe('revealMultiplayerPanel', () => {
  it('marks the recovery panel open before status is reflected', () => {
    const classes = new Set<string>();
    const panel = {
      hidden: true,
      classList: { add: vi.fn((name: string) => classes.add(name)) },
    };

    revealMultiplayerPanel(panel, () => {
      expect(panel.hidden).toBe(false);
      expect(classes.has('is-open')).toBe(true);
    });

    expect(panel.classList.add).toHaveBeenCalledWith('is-open');
  });
});
