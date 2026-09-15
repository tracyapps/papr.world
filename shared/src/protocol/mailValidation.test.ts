import { describe, expect, it } from 'vitest';
import { LIMITS } from './constants';
import {
  sanitizeClaimMail,
  sanitizeAccountInventory,
  sanitizeMailAttachment,
  sanitizeMailItem,
  sanitizeMailText,
  sanitizeSendMail,
} from './validate';

describe('mail protocol validation', () => {
  it('trims letters, removes control characters, and bounds their length', () => {
    const text = `  hello\u0000 there ${'x'.repeat(LIMITS.mailTextMaxLength)}  `;
    const sanitized = sanitizeMailText(text);
    expect(sanitized?.startsWith('hello there')).toBe(true);
    expect(sanitized).toHaveLength(LIMITS.mailTextMaxLength);
  });

  it('requires a durable recipient and non-empty text', () => {
    expect(sanitizeSendMail({ toAccountId: ' account-123 ', text: ' Hi ' })).toEqual({
      toAccountId: 'account-123', text: 'Hi',
    });
    expect(sanitizeSendMail({ toAccountId: '', text: 'Hi' })).toBeNull();
    expect(sanitizeSendMail({ toAccountId: 'account-123', text: '   ' })).toBeNull();
    expect(sanitizeSendMail({
      toAccountId: 'neighbor', text: 'Seeds for you',
      attachment: { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 2 },
    })).toEqual({
      toAccountId: 'neighbor', text: 'Seeds for you',
      attachment: { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 2 },
    });
  });

  it('bounds attachment and claim intents', () => {
    expect(sanitizeMailAttachment({ kind: 'chips', quantity: 3 })).toEqual({ kind: 'chips', quantity: 3 });
    expect(sanitizeMailAttachment({ kind: 'resource', itemId: 'seed', quantity: 0 })).toBeNull();
    expect(sanitizeMailAttachment({ kind: 'resource', itemId: '', quantity: 1 })).toBeNull();
    expect(sanitizeClaimMail({ mailId: ' parcel-1 ' })).toEqual({ mailId: 'parcel-1' });
    expect(sanitizeClaimMail({ mailId: '' })).toBeNull();
  });

  it('accepts bounded inventory snapshots and rejects malformed balances', () => {
    expect(sanitizeAccountInventory({
      revision: 2, chips: 3, resources: { seed: 1 }, tools: {}, items: {},
    })).toEqual({ revision: 2, chips: 3, resources: { seed: 1 }, tools: {}, items: {} });
    expect(sanitizeAccountInventory({
      revision: 2, chips: -1, resources: {}, tools: {}, items: {},
    })).toBeNull();
    expect(sanitizeAccountInventory({
      revision: 2, chips: 0, resources: { seed: 1.5 }, tools: {}, items: {},
    })).toBeNull();
  });

  it('accepts a safe mail item while dropping non-primitive payload fields', () => {
    expect(sanitizeMailItem({
      id: 'mail-1', fromAccountId: 'anna', fromName: 'Anna', kind: 'note', at: 5,
      payload: { text: 'Hello', quantity: 2, nested: { secret: true }, broken: Infinity },
    })).toEqual({
      id: 'mail-1', fromAccountId: 'anna', fromName: 'Anna', kind: 'note', at: 5,
      payload: { text: 'Hello', quantity: 2 },
    });
  });

  it('rejects malformed envelope fields', () => {
    expect(sanitizeMailItem({ id: 1, payload: {} })).toBeNull();
    expect(sanitizeMailItem({
      id: 'mail', fromAccountId: 'anna', fromName: 'Anna', kind: 'note', at: 'today', payload: {},
    })).toBeNull();
  });
});
