import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_CASE_TEMPLATE, type CaseState, type PlacedPiece } from '../../shared/src/index';
import { createDefaultGameState, getGameState, LOCAL_CASE_SLOTS, setGameStateForTests, updateGameState } from '../sim/state';
import {
  describeAllowance,
  describeCaseItem,
  describeCaseResult,
  describeWait,
  getCaseNote,
  getCaseView,
  listCases,
  nearestCase,
  receiveCase,
  receiveCaseDetail,
  receiveCaseResult,
  registerCasePiece,
  removeCaseItem,
  removeCase,
  requestCaseDetail,
  resetCases,
  setCase,
  setCaseHandlers,
  setCasePanelOpen,
  setCaseTransport,
  showTrinketOn,
  stockCase,
  takeFromCase,
  unregisterCasePiece,
  type CaseTransport,
} from './cases';
import { setSelfAccount } from './guests';

const MIN = 60_000;

function piece(id: string, x = 10, z = 10, page = '0,0'): PlacedPiece {
  return { id, templateKey: DISPLAY_CASE_TEMPLATE, x, z, rotY: 0, material: '', makerId: 'acct-ada', page };
}

function caseState(id: string, patch: Partial<CaseState> = {}): CaseState {
  return { id, owner: 'acct-ada', mode: 'free', label: 'Twigs', items: [{ kind: 'resource', itemId: 'twig', quantity: 3 }], limit: { count: 1, windowMinutes: 1440 }, ...patch };
}

function fakeTransport() {
  return {
    set: vi.fn(), stock: vi.fn(), show: vi.fn(), remove: vi.fn(), take: vi.fn(), request: vi.fn(),
  } satisfies CaseTransport;
}

const said: string[] = [];
let transport = fakeTransport();

function addLocalCase(id: string, x = 4, z = 4) {
  updateGameState((state) => {
    state.world.pages['0,0'] = {
      terrainEdits: {}, resourceDrops: {}, treeGrowth: {}, rockGrowth: {}, plantedCells: {}, placedEntities: {},
      placedPieces: { [id]: piece(id, x, z) }, buildSites: {},
      ...(state.world.pages['0,0'] ? { } : {}),
    };
  });
}

function addTrinket(id: string, defId = 'shiny-1', seed = 5) {
  updateGameState((state) => {
    state.player.trinkets.push({ id, defId, seed, acquiredAt: 1, source: 'test', placed: null });
  });
}

beforeEach(() => {
  setGameStateForTests(createDefaultGameState());
  said.length = 0;
  transport = fakeTransport();
  setSelfAccount('acct-sam');
  setCaseHandlers({ say: (text) => said.push(text) });
  setCasePanelOpen(false);
  resetCases();
});

afterEach(() => {
  setCaseTransport(null);
  setCaseHandlers(null);
  setGameStateForTests(null);
});

describe('finding cases', () => {
  it('lists a shared case once both the piece and its state have arrived', () => {
    registerCasePiece(piece('p1'));
    expect(listCases()).toEqual([]);
    receiveCase(caseState('p1'));
    const [view] = listCases();
    expect(view).toMatchObject({
      handle: { key: 'shared:p1', source: 'shared', x: 10, z: 10 },
      mode: 'free', label: 'Twigs', mine: false, detail: null,
    });
  });

  it('knows a case is yours when the owner is you', () => {
    setSelfAccount('acct-ada');
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    expect(listCases()[0].mine).toBe(true);
  });

  it('leaves a shared piece with no case state as a plain decoration', () => {
    registerCasePiece(piece('p1'));
    expect(nearestCase({ x: 10, z: 10 }, '0,0')).toBeNull();
  });

  it('ignores pieces that are not display cases', () => {
    registerCasePiece({ ...piece('p1'), templateKey: 'paper-bench' });
    receiveCase(caseState('p1'));
    expect(listCases()).toEqual([]);
  });

  it('lists a solo case as a show case that is yours', () => {
    addLocalCase('local-1');
    const [view] = listCases();
    expect(view).toMatchObject({ handle: { key: 'local:local-1', source: 'local' }, mode: 'show', mine: true, items: [], limit: null });
  });

  it('lets the shared case stand for the piece the owner also sees locally', () => {
    addLocalCase('local-1', 10, 10);
    registerCasePiece(piece('p1', 10, 10));
    receiveCase(caseState('p1'));
    expect(listCases().map((view) => view.handle.key)).toEqual(['shared:p1']);
  });

  it('finds the nearest case in reach, on the same page', () => {
    registerCasePiece(piece('near', 10, 10));
    registerCasePiece(piece('nearer', 11, 10));
    registerCasePiece(piece('elsewhere', 10, 10, '1,0'));
    for (const id of ['near', 'nearer', 'elsewhere']) receiveCase(caseState(id));
    expect(nearestCase({ x: 11.2, z: 10 }, '0,0')?.handle.id).toBe('nearer');
    expect(nearestCase({ x: 40, z: 40 }, '0,0')).toBeNull();
    expect(nearestCase({ x: 10, z: 10 }, '1,0')?.handle.id).toBe('elsewhere');
  });

  it('forgets a case that goes, and everything on a reset', () => {
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    removeCase('p1');
    expect(listCases()).toEqual([]);
    receiveCase(caseState('p1'));
    unregisterCasePiece('p1');
    expect(listCases()).toEqual([]);
    registerCasePiece(piece('p2'));
    receiveCase(caseState('p2'));
    resetCases();
    expect(listCases()).toEqual([]);
  });

  it('carries the visitor detail into the view', () => {
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    receiveCaseDetail({ id: 'p1', remaining: 1, resetsAt: null });
    expect(getCaseView('shared:p1')?.detail).toEqual({ id: 'p1', remaining: 1, resetsAt: null });
  });
});

describe('asking about a shared case', () => {
  beforeEach(() => {
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    setCaseTransport(transport);
  });
  const handle = () => getCaseView('shared:p1')!.handle;

  it('sends each action to the server, with the case id', () => {
    setCase(handle(), { label: 'Free twigs', limit: null });
    expect(transport.set).toHaveBeenCalledWith({ id: 'p1', label: 'Free twigs', limit: null });
    stockCase(handle(), 'resource', 'twig', 3);
    expect(transport.stock).toHaveBeenCalledWith({ id: 'p1', kind: 'resource', itemId: 'twig', quantity: 3 });
    takeFromCase(handle(), 0);
    expect(transport.take).toHaveBeenCalledWith({ id: 'p1', index: 0 });
    removeCaseItem(handle(), 1);
    expect(transport.remove).toHaveBeenCalledWith({ id: 'p1', index: 1 });
    requestCaseDetail(handle());
    expect(transport.request).toHaveBeenCalledWith('p1');
  });

  it('sends a keepsake\'s look, not the keepsake itself', () => {
    addTrinket('t1', 'shiny-1', 5);
    showTrinketOn(handle(), 't1');
    expect(transport.show).toHaveBeenCalledWith({ id: 'p1', defId: 'shiny-1', seed: 5 });
    showTrinketOn(handle(), 'nope');
    expect(getCaseNote('shared:p1')).toBe('That keepsake is not on your shelf.');
    expect(getGameState().player.trinkets).toHaveLength(1);
  });

  it('says what a result means, in the case\'s own note', () => {
    receiveCaseResult({ id: 'p1', action: 'take', outcome: 'ok', taken: { kind: 'resource', itemId: 'twig' } });
    expect(getCaseNote('shared:p1')).toMatch(/^You took one /);
  });

  it('speaks a result as a toast only when the panel is not there to say it', () => {
    receiveCaseResult({ id: 'p1', action: 'take', outcome: 'empty' });
    expect(said).toEqual(['There is nothing to take right now.']);
    said.length = 0;
    setCasePanelOpen(true);
    receiveCaseResult({ id: 'p1', action: 'take', outcome: 'empty' });
    expect(said).toEqual([]);
  });
});

describe('with no shared neighborhood', () => {
  it('says so instead of doing nothing', () => {
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    const handle = getCaseView('shared:p1')!.handle;
    takeFromCase(handle, 0);
    expect(getCaseNote('shared:p1')).toMatch(/shared neighborhood/);
  });
});

describe('a solo case', () => {
  const handle = () => getCaseView('local:local-1')!.handle;
  beforeEach(() => addLocalCase('local-1'));

  it('keeps a label', () => {
    setCase(handle(), { label: '  My  finds ' });
    expect(getCaseView('local:local-1')?.label).toBe('My finds');
    expect(getGameState().world.localCases['local-1'].label).toBe('My finds');
  });

  it('refuses to become a free case', () => {
    setCase(handle(), { mode: 'free' });
    expect(getCaseNote('local:local-1')).toMatch(/shared neighborhood/);
    expect(getCaseView('local:local-1')?.mode).toBe('show');
  });

  it('sets a keepsake out once, and takes it off again', () => {
    addTrinket('t1');
    showTrinketOn(handle(), 't1');
    showTrinketOn(handle(), 't1');
    expect(getCaseView('local:local-1')?.items).toEqual([{ kind: 'trinket', defId: 'shiny-1', seed: 5 }]);
    removeCaseItem(handle(), 0);
    expect(getCaseView('local:local-1')?.items).toEqual([]);
    // The keepsake was never moved.
    expect(getGameState().player.trinkets).toHaveLength(1);
  });

  it('is full at the slot limit', () => {
    for (let index = 0; index < LOCAL_CASE_SLOTS + 1; index += 1) {
      addTrinket(`t${index}`, `shiny-${index}`, index);
      showTrinketOn(handle(), `t${index}`);
    }
    expect(getCaseView('local:local-1')?.items).toHaveLength(LOCAL_CASE_SLOTS);
    expect(getCaseNote('local:local-1')).toBe('The case is full.');
  });

  it('cannot be stocked or taken from', () => {
    stockCase(handle(), 'resource', 'twig', 1);
    expect(getCaseNote('local:local-1')).toMatch(/shared neighborhood/);
    takeFromCase(handle(), 0);
    expect(getCaseNote('local:local-1')).toMatch(/shared neighborhood/);
  });

  it('survives being read back from a save', () => {
    addTrinket('t1');
    showTrinketOn(handle(), 't1');
    const saved = JSON.parse(JSON.stringify(getGameState().world.localCases));
    expect(saved['local-1'].trinkets).toEqual([{ defId: 'shiny-1', seed: 5 }]);
  });
});

describe('the words', () => {
  const now = 1_000_000_000;
  const free = (detail: Parameters<typeof receiveCaseDetail>[0] | null, mine = false) => {
    setSelfAccount(mine ? 'acct-ada' : 'acct-sam');
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1'));
    if (detail) receiveCaseDetail(detail);
    return getCaseView('shared:p1')!;
  };

  it('describes what a visitor has left', () => {
    expect(describeAllowance(free(null), now)).toBe('Checking what you can take.');
    expect(describeAllowance(free({ id: 'p1', remaining: null, resetsAt: null }), now)).toBe('You can take as many as you like.');
    expect(describeAllowance(free({ id: 'p1', remaining: 2, resetsAt: null }), now)).toBe('You can take 2 more.');
    expect(describeAllowance(free({ id: 'p1', remaining: 0, resetsAt: now + 90 * MIN }), now))
      .toBe('You have taken your share for now. More opens up in 2 hours.');
    expect(describeAllowance(free({ id: 'p1', remaining: 0, resetsAt: null }), now)).toBe('There is nothing for you to take right now.');
  });

  it('says nothing about an allowance to the owner, or for a case that gives nothing away', () => {
    expect(describeAllowance(free(null, true), now)).toBe('');
    resetCases();
    registerCasePiece(piece('p1'));
    receiveCase(caseState('p1', { mode: 'show', items: [] }));
    expect(describeAllowance(getCaseView('shared:p1')!, now)).toBe('');
  });

  it('rounds a wait up, never early', () => {
    expect(describeWait(10_000)).toBe('in about a minute');
    expect(describeWait(20 * MIN)).toBe('in 20 minutes');
    expect(describeWait(61 * MIN)).toBe('in 2 hours');
    expect(describeWait(60 * MIN)).toBe('in about an hour');
    expect(describeWait(3 * 24 * 60 * MIN)).toBe('in 3 days');
  });

  it('names what is in a case', () => {
    expect(describeCaseItem({ kind: 'resource', itemId: 'twig', quantity: 3 })).toMatch(/× 3$/);
    expect(describeCaseItem({ kind: 'trinket', defId: 'no-such-trinket', seed: 1 })).toBe('A keepsake');
  });

  it('has a sentence for every outcome', () => {
    const outcomes = ['ok', 'empty', 'limit', 'guest', 'too-far', 'not-yours', 'wrong-mode', 'full', 'no-stock', 'not-empty', 'invalid'] as const;
    for (const outcome of outcomes) {
      for (const action of ['set', 'stock', 'remove', 'show', 'take'] as const) {
        expect(describeCaseResult({ id: 'p1', action, outcome, resetsAt: now + MIN }, now).length).toBeGreaterThan(5);
      }
    }
    expect(describeCaseResult({ id: 'p1', action: 'take', outcome: 'limit', resetsAt: now + 20 * MIN }, now))
      .toBe('You have taken your share for now. More opens up in 20 minutes.');
    expect(describeCaseResult({ id: 'p1', action: 'take', outcome: 'wrong-mode' })).toBe('This case is for looking at, not taking.');
    expect(describeCaseResult({ id: 'p1', action: 'stock', outcome: 'wrong-mode' })).toMatch(/Switch it to Free/);
  });
});
