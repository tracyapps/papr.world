import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultGameState,
  exportSaveBackup,
  parseSaveBackup,
  setGameStateForTests,
} from './state';

afterEach(() => setGameStateForTests(null));

describe('save backups', () => {
  it('round-trips the save through a backup file', () => {
    const state = createDefaultGameState();
    state.player.chips = 17;
    state.player.inventory['kraft-twigs'] = 5;
    setGameStateForTests(state);

    const parsed = parseSaveBackup(exportSaveBackup(1234));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.player.chips).toBe(17);
    expect(parsed.state.player.inventory['kraft-twigs']).toBe(5);
    expect(parsed.summary).toMatchObject({ chips: 17, exportedAt: 1234 });
  });

  it('refuses files that are not backups, or are damaged', () => {
    expect(parseSaveBackup('not json').ok).toBe(false);
    expect(parseSaveBackup('{"hello":"world"}').ok).toBe(false);
    expect(parseSaveBackup('{"kind":"papr.world-save-backup","save":{"schemaVersion":999}}').ok).toBe(false);
  });

  it('cleans a hand-edited backup the same way every load does', () => {
    const state = createDefaultGameState();
    setGameStateForTests(state);
    const file = JSON.parse(exportSaveBackup());
    file.save.player.chips = -50;
    file.save.player.inventory = { 'kraft-twigs': 'lots' };
    const parsed = parseSaveBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.player.chips).toBe(0);
    expect(parsed.state.player.inventory['kraft-twigs'] ?? 0).toBe(0);
  });
});
