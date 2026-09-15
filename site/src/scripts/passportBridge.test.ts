import { describe, expect, it } from 'vitest';
import { parseDevicePassport } from './passportBridge';

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
});
