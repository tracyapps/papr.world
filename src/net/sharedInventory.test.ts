import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimSharedMail,
  clearSharedInventory,
  getSharedInventory,
  receiveSharedInventory,
  setSharedMailClaimHandler,
} from './sharedInventory';

afterEach(() => clearSharedInventory());

describe('shared inventory client cache', () => {
  it('accepts current snapshots, rejects malformed and stale ones, and returns copies', () => {
    expect(receiveSharedInventory({
      revision: 2, chips: 1, resources: { seed: 2 }, tools: {}, items: {},
    })).toBe(true);
    expect(receiveSharedInventory({
      revision: 1, chips: 99, resources: {}, tools: {}, items: {},
    })).toBe(false);
    expect(receiveSharedInventory({
      revision: 3, chips: -1, resources: {}, tools: {}, items: {},
    })).toBe(false);
    const copy = getSharedInventory()!;
    copy.resources.seed = 99;
    expect(getSharedInventory()?.resources.seed).toBe(2);
  });

  it('only sends claims while an authoritative pouch and handler are active', () => {
    const claim = vi.fn();
    setSharedMailClaimHandler(claim);
    expect(claimSharedMail('parcel')).toBe(false);
    receiveSharedInventory({ revision: 1, chips: 0, resources: {}, tools: {}, items: {} });
    expect(claimSharedMail('parcel')).toBe(true);
    expect(claim).toHaveBeenCalledWith('parcel');
    clearSharedInventory();
    expect(claimSharedMail('parcel')).toBe(false);
  });
});
