import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME_POLICY,
  homePolicyOrDefault,
  isGuestAccount,
  joinHomeParts,
  sanitizeAccountRef,
  sanitizeHomeBuilding,
  sanitizeHomeParts,
  sanitizeHomePolicy,
  splitHomeParts,
} from './guests';
import { sanitizeSetHome } from './validate';

describe('home policy', () => {
  it('defaults to friends walk in, others knock, door not open', () => {
    expect(DEFAULT_HOME_POLICY).toEqual({ friends: 'walk', others: 'knock', open: false });
  });

  it('accepts every documented setting', () => {
    for (const friends of ['walk', 'knock', 'closed'] as const) {
      for (const others of ['knock', 'closed'] as const) {
        expect(sanitizeHomePolicy({ friends, others, open: true })).toEqual({ friends, others, open: true });
      }
    }
  });

  it('refuses a setting that does not exist, including others walking in', () => {
    expect(sanitizeHomePolicy({ friends: 'walk', others: 'walk', open: false })).toBeNull();
    expect(sanitizeHomePolicy({ friends: 'everyone', others: 'knock', open: false })).toBeNull();
    expect(sanitizeHomePolicy({ friends: 'walk', others: 'knock', open: 'yes' })).toBeNull();
    expect(sanitizeHomePolicy(null)).toBeNull();
    expect(sanitizeHomePolicy([])).toBeNull();
  });

  it('fills missing fields from the defaults, and heals bad saved data', () => {
    expect(sanitizeHomePolicy({ open: true })).toEqual({ friends: 'walk', others: 'knock', open: true });
    expect(homePolicyOrDefault({ others: 'walk' })).toEqual(DEFAULT_HOME_POLICY);
  });
});

describe('home parts', () => {
  it('keeps well-formed unique ids, in order', () => {
    expect(sanitizeHomeParts(['floor', 'walls', 'floor', 'roof'])).toEqual(['floor', 'walls', 'roof']);
  });

  it('drops anything that is not an id, and bounds the list', () => {
    expect(sanitizeHomeParts(['Floor', 5, null, '../x', 'room-1'])).toEqual(['room-1']);
    expect(sanitizeHomeParts('floor')).toEqual([]);
    const many = Array.from({ length: 40 }, (_, index) => `p${index}`);
    expect(sanitizeHomeParts(many).length).toBeLessThanOrEqual(12);
  });

  it('round-trips through the comma-joined form the synced schema uses', () => {
    expect(splitHomeParts(joinHomeParts(['floor', 'room-1']))).toEqual(['floor', 'room-1']);
    expect(splitHomeParts('')).toEqual([]);
  });

  it('checks the part under construction', () => {
    expect(sanitizeHomeBuilding('roof')).toBe('roof');
    expect(sanitizeHomeBuilding('ROOF!')).toBe('');
    expect(sanitizeHomeBuilding(3)).toBe('');
  });

  it('is carried by SetHome, and older clients that omit it still work', () => {
    expect(sanitizeSetHome({ x: 1, z: 2, page: '0,0', parts: ['floor', 'bad id'], building: 'walls' }))
      .toEqual({ x: 1, z: 2, page: '0,0', parts: ['floor'], building: 'walls' });
    expect(sanitizeSetHome({ x: 1, z: 2, page: '0,0' }))
      .toEqual({ x: 1, z: 2, page: '0,0', parts: [], building: '' });
  });
});

describe('account references', () => {
  it('trims and bounds', () => {
    expect(sanitizeAccountRef('  abc-123 ')).toBe('abc-123');
    expect(sanitizeAccountRef('')).toBeNull();
    expect(sanitizeAccountRef('x'.repeat(81))).toBeNull();
    expect(sanitizeAccountRef('a\u0007b')).toBeNull();
    expect(sanitizeAccountRef(7)).toBeNull();
  });

  it('knows a guest by its prefix', () => {
    expect(isGuestAccount('guest:abc')).toBe(true);
    expect(isGuestAccount('5f0c')).toBe(false);
  });
});
