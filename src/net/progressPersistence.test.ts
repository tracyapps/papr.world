import { describe, expect, it } from 'vitest';
import { progressPersistenceCopy } from './progressPersistence';

describe('progress persistence copy', () => {
  it('does not call a connected shared world fully synced', () => {
    const copy = progressPersistenceCopy('online');
    expect(copy.label).toBe('Partly server-saved');
    expect(copy.summary).toContain('not synced between browsers');
    expect(copy.server).toContain('home locations');
    expect(copy.server).toContain('shared placed builds');
    expect(copy.local).toContain('tech tree');
    expect(copy.local).toContain('crafted tools');
  });

  it.each(['solo', 'preparing', 'connecting', 'offline', 'setup-error'] as const)(
    'describes %s without claiming a server save',
    (phase) => {
      const copy = progressPersistenceCopy(phase);
      expect(copy.label).toBe('Saved on this browser');
      expect(copy.summary).toContain('not to your account');
    },
  );
});
