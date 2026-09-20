import { describe, expect, it } from 'vitest';
import { LIMITS } from './constants';
import { sanitizeFriendRequestMessage } from './validate';
import {
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_VISIBILITY,
  PROFILE_RELATIONSHIPS,
  PROFILE_VISIBILITY_LEVELS,
  SOCIAL_LINK_KINDS,
  canViewProfileField,
  profileForViewer,
  profileVisibilityOrDefault,
  sanitizeBio,
  sanitizeProfile,
  sanitizeProfileUpdate,
  sanitizeSocialLink,
  sanitizeSocialLinks,
  sanitizeSocialUrl,
  type PlayerProfile,
  type ProfileRelationship,
  type ProfileVisibility,
} from './profile';

const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  bio: 'hello there',
  links: [{ kind: 'website', url: 'https://example.com' }],
  visibility: { bio: 'friends', links: 'friends' },
  ...over,
});

describe('profile visibility', () => {
  it('lists the levels from most open to most closed', () => {
    expect(PROFILE_VISIBILITY_LEVELS).toEqual(['everyone', 'friends', 'friends-of-friends']);
  });

  it('defaults to friends-only and never invents a more open audience', () => {
    expect(DEFAULT_PROFILE_VISIBILITY).toEqual({ bio: 'friends', links: 'friends' });
    expect(DEFAULT_PROFILE).toEqual({
      bio: '',
      links: [],
      visibility: { bio: 'friends', links: 'friends' },
    });
  });

  it('implements the full relationship × visibility truth table', () => {
    const expected: Record<ProfileRelationship, Record<ProfileVisibility, boolean>> = {
      self: { everyone: true, friends: true, 'friends-of-friends': true },
      friend: { everyone: true, friends: true, 'friends-of-friends': true },
      'friend-of-friend': { everyone: true, friends: false, 'friends-of-friends': true },
      stranger: { everyone: true, friends: false, 'friends-of-friends': false },
    };
    for (const relationship of PROFILE_RELATIONSHIPS) {
      for (const visibility of PROFILE_VISIBILITY_LEVELS) {
        expect(canViewProfileField(relationship, visibility))
          .toBe(expected[relationship][visibility]);
      }
    }
  });
});

describe('profile visibility defaults', () => {
  it('fills unknown or malformed fields from the default', () => {
    expect(profileVisibilityOrDefault(undefined)).toEqual(DEFAULT_PROFILE_VISIBILITY);
    expect(profileVisibilityOrDefault({ bio: 'everyone', links: 'nope' }))
      .toEqual({ bio: 'everyone', links: 'friends' });
    expect(profileVisibilityOrDefault('friends')).toEqual(DEFAULT_PROFILE_VISIBILITY);
    expect(profileVisibilityOrDefault({ links: 'friends-of-friends' }))
      .toEqual({ bio: 'friends', links: 'friends-of-friends' });
  });
});

describe('social links', () => {
  it('accepts every allowed kind with an http(s) URL', () => {
    for (const kind of SOCIAL_LINK_KINDS) {
      expect(sanitizeSocialLink({ kind, url: 'https://example.com/me' }))
        .toEqual({ kind, url: 'https://example.com/me' });
    }
  });

  it('refuses unknown kinds and non-http(s) URLs', () => {
    expect(sanitizeSocialLink({ kind: 'myspace', url: 'https://example.com' })).toBeNull();
    expect(sanitizeSocialLink({ kind: 'website', url: 'ftp://example.com' })).toBeNull();
    expect(sanitizeSocialLink({ kind: 'website', url: 'javascript:alert(1)' })).toBeNull();
    expect(sanitizeSocialLink({ kind: 'website', url: 'example.com' })).toBeNull();
    expect(sanitizeSocialLink({ kind: 'website', url: 'https://has space' })).toBeNull();
  });

  it('rejects control characters rather than cleaning them out', () => {
    expect(sanitizeSocialUrl('https://example.com\u0000')).toBeNull();
    expect(sanitizeSocialUrl('https://exa\u0007mple.com')).toBeNull();
    expect(sanitizeSocialUrl('https://example.com')).toBe('https://example.com');
  });

  it('caps the URL and the list length', () => {
    expect(sanitizeSocialUrl(`https://x.co/${'a'.repeat(LIMITS.socialUrlMax)}`)).toBeNull();
    expect(sanitizeSocialUrl(`https://x.co/${'a'.repeat(LIMITS.socialUrlMax - 20)}`)).not.toBeNull();
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'website', url: `https://e${i}.com` }));
    expect(sanitizeSocialLinks(many)).toHaveLength(LIMITS.socialLinksMax);
  });

  it('drops malformed entries and tolerates a non-array', () => {
    expect(sanitizeSocialLinks([{ kind: 'website', url: 'https://a.com' }, { kind: 'bad', url: 'x' }, 7]))
      .toEqual([{ kind: 'website', url: 'https://a.com' }]);
    expect(sanitizeSocialLinks('nope')).toEqual([]);
  });
});

describe('bio', () => {
  it('trims, strips control characters, and clamps', () => {
    const long = `  hi\u0000 there ${'x'.repeat(LIMITS.bioMax)}  `;
    const cleaned = sanitizeBio(long);
    expect(cleaned.startsWith('hi there')).toBe(true);
    expect(cleaned).toHaveLength(LIMITS.bioMax);
    expect(sanitizeBio(42)).toBe('');
  });
});

describe('sanitizeProfile', () => {
  it('returns null only for a non-object', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile([])).toBeNull();
    expect(sanitizeProfile('me')).toBeNull();
  });

  it('heals a stored profile with missing or broken fields', () => {
    expect(sanitizeProfile({})).toEqual(DEFAULT_PROFILE);
    expect(sanitizeProfile({ bio: 'hi', links: 'x', visibility: { bio: 'everyone' } })).toEqual({
      bio: 'hi',
      links: [],
      visibility: { bio: 'everyone', links: 'friends' },
    });
  });
});

describe('sanitizeProfileUpdate', () => {
  it('accepts a single field and leaves the rest absent', () => {
    expect(sanitizeProfileUpdate({ bio: 'new bio' })).toEqual({ bio: 'new bio' });
    expect(sanitizeProfileUpdate({ visibility: { links: 'everyone' } }))
      .toEqual({ visibility: { links: 'everyone' } });
  });

  it('carries links through and drops malformed ones', () => {
    expect(sanitizeProfileUpdate({
      links: [{ kind: 'twitch', url: 'https://twitch.tv/me' }, { kind: 'nope', url: 'x' }],
    })).toEqual({ links: [{ kind: 'twitch', url: 'https://twitch.tv/me' }] });
  });

  it('refuses a payload that is not an object, or a present-but-invalid field', () => {
    expect(sanitizeProfileUpdate(null)).toBeNull();
    expect(sanitizeProfileUpdate([])).toBeNull();
    expect(sanitizeProfileUpdate({ bio: 5 })).toBeNull();
    expect(sanitizeProfileUpdate({ links: 'x' })).toBeNull();
    expect(sanitizeProfileUpdate({ visibility: { bio: 'everyone-and-their-dog' } })).toBeNull();
    expect(sanitizeProfileUpdate({ visibility: 'friends' })).toBeNull();
  });

  it('ignores keys it does not know', () => {
    expect(sanitizeProfileUpdate({ bio: 'hi', pet: 'cat' })).toEqual({ bio: 'hi' });
  });
});

describe('profileForViewer', () => {
  it('shows a friend everything they are allowed to see', () => {
    expect(profileForViewer(profile(), 'friend')).toEqual({
      bio: 'hello there',
      links: [{ kind: 'website', url: 'https://example.com' }],
    });
  });

  it('hides friends-only fields from a friend-of-friend and a stranger', () => {
    expect(profileForViewer(profile(), 'friend-of-friend')).toEqual({});
    expect(profileForViewer(profile(), 'stranger')).toEqual({});
  });

  it('lets a stranger read only the fields set to everyone', () => {
    const open = profile({ visibility: { bio: 'everyone', links: 'friends-of-friends' } });
    expect(profileForViewer(open, 'stranger')).toEqual({ bio: 'hello there' });
    const bothOpen = profile({ visibility: { bio: 'everyone', links: 'everyone' } });
    expect(profileForViewer(bothOpen, 'stranger')).toEqual({
      bio: 'hello there',
      links: [{ kind: 'website', url: 'https://example.com' }],
    });
  });

  it('omits empty fields entirely, even for the owner', () => {
    expect(profileForViewer(profile({ bio: '', links: [] }), 'self')).toEqual({});
  });

  it('always shows the basics to someone the owner has asked to be friends', () => {
    const closed = profile({ visibility: { bio: 'friends', links: 'friends' } });
    expect(profileForViewer(closed, 'stranger')).toEqual({});
    expect(profileForViewer(closed, 'stranger', { hasSentRequest: true })).toEqual({
      bio: 'hello there',
      links: [{ kind: 'website', url: 'https://example.com' }],
    });
    // An unrelated viewer who simply has not sent a request gets nothing extra.
    expect(profileForViewer(closed, 'stranger', { hasSentRequest: false })).toEqual({});
  });
});

describe('friend request message', () => {
  it('trims, strips control characters, and bounds to friendRequestMessageMax', () => {
    const long = `  hello\u0000 there ${'x'.repeat(LIMITS.friendRequestMessageMax)}  `;
    const cleaned = sanitizeFriendRequestMessage(long);
    expect(cleaned?.startsWith('hello there')).toBe(true);
    expect(cleaned).toHaveLength(LIMITS.friendRequestMessageMax);
  });

  it('is null when empty or not a string', () => {
    expect(sanitizeFriendRequestMessage('   ')).toBeNull();
    expect(sanitizeFriendRequestMessage(7)).toBeNull();
    expect(sanitizeFriendRequestMessage('hi')).toBe('hi');
  });
});
