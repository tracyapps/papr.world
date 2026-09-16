import { describe, expect, it } from 'vitest';
import {
  loadDevicePassport,
  parseDevicePassport,
  PASSPORT_STORAGE_KEY,
  saveDevicePassport,
} from './passportBridge';

describe('paper-passport bridge', () => {
  it('keeps only a valid id and secret from browser storage', () => {
    expect(parseDevicePassport(JSON.stringify({
      id: ' 25e7894b-3808-489c-9b80-e9ef90cb03c2 ',
      secret: ' device-secret-long-enough ',
      createdAt: 123,
      surprise: 'not sent',
    }))).toEqual({
      id: '25e7894b-3808-489c-9b80-e9ef90cb03c2',
      secret: 'device-secret-long-enough',
    });
  });

  it('rejects missing and malformed credentials', () => {
    expect(parseDevicePassport(null)).toBeNull();
    expect(parseDevicePassport('{oops')).toBeNull();
    expect(parseDevicePassport(JSON.stringify({ id: 'short', secret: 'short' }))).toBeNull();
  });

  it('stores a validated credential pair that can be loaded again', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const passport = {
      id: '25e7894b-3808-489c-9b80-e9ef90cb03c2',
      secret: 'device-secret-long-enough',
    };

    expect(saveDevicePassport(storage, passport)).toBe(true);
    expect(values.has(PASSPORT_STORAGE_KEY)).toBe(true);
    expect(loadDevicePassport(storage)).toEqual(passport);
  });

  it('does not store invalid credentials and reports blocked browser storage', () => {
    expect(saveDevicePassport({ setItem: () => undefined }, { id: 'short', secret: 'short' })).toBe(false);
    expect(saveDevicePassport({
      setItem: () => { throw new Error('blocked'); },
    }, {
      id: '25e7894b-3808-489c-9b80-e9ef90cb03c2',
      secret: 'device-secret-long-enough',
    })).toBe(false);
  });
});
