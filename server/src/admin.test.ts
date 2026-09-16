import { describe, expect, it } from 'vitest';
import {
  buildAdminStatus,
  createInviteToken,
  hashInviteToken,
  normalizeInvitationInput,
  readAdminConfig,
  validInviteEmail,
  validInviteToken,
} from './admin';

describe('control-center configuration', () => {
it('parses allowlists without accepting empty entries', () => {
  const config = readAdminConfig({
    CLERK_SECRET_KEY: 'secret',
    CLERK_AUTHORIZED_PARTIES: 'https://papr.world, http://localhost:4321 ',
    PP_ADMIN_CLERK_USER_IDS: 'user_owner, ,user_backup',
  });

  expect(config.authorizedParties).toEqual(['https://papr.world', 'http://localhost:4321']);
  expect([...config.adminUserIds]).toEqual(['user_owner', 'user_backup']);
  expect(config.invitationRedirectUrl).toBe('https://papr.world/account/');
});

it('accepts ordinary invite addresses and rejects malformed input', () => {
  expect(validInviteEmail('friend@example.com')).toBe(true);
  expect(validInviteEmail('friend @example.com')).toBe(false);
  expect(validInviteEmail('not-an-address')).toBe(false);
  expect(validInviteEmail(null)).toBe(false);
});

it('normalizes email and copyable-link invitation deliveries', () => {
  expect(normalizeInvitationInput({
    emailAddress: ' Friend@Example.com ', delivery: 'link',
  })).toEqual({ emailAddress: 'friend@example.com', delivery: 'link' });
  expect(normalizeInvitationInput({ emailAddress: 'friend@example.com' }))
    .toEqual({ emailAddress: 'friend@example.com', delivery: 'email' });
  expect(normalizeInvitationInput({ emailAddress: 'friend@example.com', delivery: 'sms' }))
    .toBeNull();
});

it('accepts only full opaque friend-link tokens and hashes them deterministically', () => {
  const token = '1234567890abcdef_ABCDEFGH-ijklmn';
  expect(token).toHaveLength(32);
  expect(validInviteToken(token)).toBe(true);
  expect(validInviteToken(`${token}x`)).toBe(false);
  expect(validInviteToken('not-a-token')).toBe(false);
  expect(hashInviteToken(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  expect(hashInviteToken(token)).not.toContain(token);
  expect(validInviteToken(createInviteToken())).toBe(true);
});

it('describes configuration without returning credentials', () => {
  const config = readAdminConfig({
    CLERK_SECRET_KEY: 'must-never-appear',
    PP_ADMIN_CLERK_USER_IDS: 'user_owner',
  });
  const status = buildAdminStatus(config, {
    accountCount: () => 12,
    corsOrigin: 'https://papr.world',
    dataDir: '/data',
  });

  expect(status.services.clerk.state).toBe('configured');
  expect(status.counts.paperPassports).toBe(12);
  expect(status.controls.adminAllowlist).toBe(true);
  expect(JSON.stringify(status)).not.toContain('must-never-appear');
});
});
