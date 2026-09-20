import { beforeEach, describe, expect, it } from 'vitest';
import { applyGameCommand } from './commands';
import { createDefaultGameState, type GameState } from './state';
import { homeDoorstep, homePosition } from '../world/homeSite';

let state: GameState;
const HOME = { x: -1.5, z: -2.2 };

beforeEach(() => {
  state = createDefaultGameState();
  state.player.places = [{ id: 'home', name: 'Home', x: HOME.x, z: HOME.z, builtin: true }];
});

describe('going through the door', () => {
  it('starts on the surface', () => {
    expect(state.player.scene).toBe('surface');
  });

  it('lets you in from the doorstep', () => {
    const result = applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: homeDoorstep(HOME) });
    expect(result.ok).toBe(true);
    expect(state.player.scene).toBe('in:home');
  });

  it('lets you in from anywhere within reach of the house', () => {
    const spot = homePosition(HOME);
    const result = applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: { x: spot.x + 3, z: spot.z } });
    expect(result.ok).toBe(true);
  });

  it('asks you to walk up first when you are far away, and stays outside', () => {
    const result = applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: { x: 40, z: 40 } });
    expect(result).toEqual({ ok: false, reason: 'Walk up to your home to go inside.' });
    expect(state.player.scene).toBe('surface');
  });

  it('has no door to places that do not exist yet', () => {
    for (const scene of ['under', 'in:someone-else', 'surface', '']) {
      const result = applyGameCommand(state, { type: 'enterScene', scene, from: homeDoorstep(HOME) });
      expect(result.ok).toBe(false);
    }
    expect(state.player.scene).toBe('surface');
  });

  it('will not go in twice', () => {
    applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: homeDoorstep(HOME) });
    const again = applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: homeDoorstep(HOME) });
    expect(again).toEqual({ ok: false, reason: 'You are already inside.' });
  });

  it('always lets you out, and only when you are inside', () => {
    expect(applyGameCommand(state, { type: 'leaveScene' }).ok).toBe(false);
    applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: homeDoorstep(HOME) });
    const out = applyGameCommand(state, { type: 'leaveScene' });
    expect(out.ok).toBe(true);
    expect(state.player.scene).toBe('surface');
  });

  it('measures reach from the Home place even before it is saved', () => {
    state.player.places = [];
    const result = applyGameCommand(state, { type: 'enterScene', scene: 'in:home', from: homeDoorstep(HOME) });
    expect(result.ok).toBe(true);
  });
});
