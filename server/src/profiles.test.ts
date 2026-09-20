// The profile store and the relationship it feeds. Two things are being
// proven here: that a stored profile is always sanitized (in and out), and
// that `relationshipBetween` gets every branch right — especially the one
// that must stay silent, a block.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, LIMITS, type PlayerProfile } from '../../shared/src/index';
import {
  ProfileStore,
  relationshipBetween,
  type RelationshipDependencies,
} from './profiles';

let dir = '';

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pp-profiles-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fresh = () => new ProfileStore(dir);
const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  bio: '',
  links: [],
  visibility: { bio: 'friends', links: 'friends' },
  ...over,
});

describe('ProfileStore', () => {
  it('answers with the empty default for an account that never set one', () => {
    expect(fresh().profileFor('nobody')).toEqual(DEFAULT_PROFILE);
    expect(fresh().nameFor('nobody')).toBeNull();
  });

  it('stores a whole profile and the name it was published with', () => {
    const store = fresh();
    const saved = store.set('anna', 'Anna', profile({
      bio: 'draws tents',
      links: [{ kind: 'website', url: 'https://anna.example' }],
      visibility: { bio: 'everyone', links: 'friends-of-friends' },
    }));
    expect(saved).toEqual(profile({
      bio: 'draws tents',
      links: [{ kind: 'website', url: 'https://anna.example' }],
      visibility: { bio: 'everyone', links: 'friends-of-friends' },
    }));
    expect(store.profileFor('anna').bio).toBe('draws tents');
    expect(store.nameFor('anna')).toBe('Anna');
  });

  it('merges a partial update without disturbing the fields it did not name', () => {
    const store = fresh();
    store.set('anna', 'Anna', profile({
      bio: 'first', links: [{ kind: 'x', url: 'https://x.example' }],
      visibility: { bio: 'everyone', links: 'friends' },
    }));
    store.update('anna', 'Anna', { bio: 'second' });
    expect(store.profileFor('anna')).toEqual(profile({
      bio: 'second', links: [{ kind: 'x', url: 'https://x.example' }],
      visibility: { bio: 'everyone', links: 'friends' },
    }));
    // A visibility patch touches only the field it names.
    store.update('anna', 'Anna', { visibility: { links: 'everyone' } });
    expect(store.profileFor('anna').visibility).toEqual({ bio: 'everyone', links: 'everyone' });
  });

  it('sanitizes on the way in: a clamped bio, dropped bad links, healed visibility', () => {
    const store = fresh();
    store.set('anna', 'Anna', profile({
      bio: `  ${'x'.repeat(LIMITS.bioMax + 50)}  `,
      links: [
        { kind: 'website', url: 'https://ok.example' },
        { kind: 'website', url: 'javascript:alert(1)' } as never,
        { kind: 'not-a-kind', url: 'https://no.example' } as never,
      ],
      visibility: { bio: 'nonsense' as never, links: 'everyone' },
    }));
    const saved = store.profileFor('anna');
    expect(saved.bio).toHaveLength(LIMITS.bioMax);
    expect(saved.links).toEqual([{ kind: 'website', url: 'https://ok.example' }]);
    expect(saved.visibility).toEqual({ bio: 'friends', links: 'everyone' });
  });

  it('heals a hand-edited file on load rather than trusting it', () => {
    writeFileSync(join(dir, 'profiles.json'), JSON.stringify({
      version: 1,
      profiles: {
        anna: {
          name: 'Anna',
          bio: 'kept',
          links: [{ kind: 'website', url: 'not a url' }, { kind: 'youtube', url: 'https://yt.example' }],
          visibility: { bio: 'everyone', links: 'broken' },
        },
        boris: 'not even an object',
      },
    }), 'utf8');
    const store = fresh();
    expect(store.profileFor('anna')).toEqual(profile({
      bio: 'kept', links: [{ kind: 'youtube', url: 'https://yt.example' }],
      visibility: { bio: 'everyone', links: 'friends' },
    }));
    expect(store.profileFor('boris')).toEqual(DEFAULT_PROFILE);
  });

  it('survives a restart, name and links and all', () => {
    fresh().set('anna', 'Anna', profile({
      bio: 'hello', links: [{ kind: 'twitch', url: 'https://twitch.example' }],
    }));
    const again = fresh();
    expect(again.profileFor('anna')).toEqual(profile({
      bio: 'hello', links: [{ kind: 'twitch', url: 'https://twitch.example' }],
    }));
    expect(again.nameFor('anna')).toBe('Anna');
  });

  it('starts empty, loudly, when the file is corrupt', () => {
    writeFileSync(join(dir, 'profiles.json'), '{ not json', 'utf8');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = fresh();
    expect(store.profileFor('anna')).toEqual(DEFAULT_PROFILE);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('hands out copies, so a caller cannot mutate the store', () => {
    const store = fresh();
    store.set('anna', 'Anna', profile({ bio: 'original' }));
    const first = store.profileFor('anna');
    first.bio = 'tampered';
    first.visibility.bio = 'everyone';
    expect(store.profileFor('anna')).toEqual(profile({ bio: 'original' }));
    // And a persisted file is plain JSON.
    expect(readFileSync(join(dir, 'profiles.json'), 'utf8')).toContain('original');
  });
});

describe('relationshipBetween', () => {
  const graph = (edges: Record<string, string[]>, blocked: string[] = []): RelationshipDependencies => ({
    areFriends: (a, b) => (edges[a] ?? []).includes(b),
    friendsOf: (id) => edges[id] ?? [],
    isBlocked: (a, b) => blocked.includes(`${a}>${b}`),
  });

  it('is `self` for the same account', () => {
    expect(relationshipBetween('anna', 'anna', graph({}))).toBe('self');
  });

  it('is `friend` for a mutual edge', () => {
    expect(relationshipBetween('anna', 'boris', graph({ anna: ['boris'], boris: ['anna'] }))).toBe('friend');
  });

  it('is `friend-of-friend` for one shared accepted hop, both directions', () => {
    const edges = { anna: ['clara'], clara: ['anna', 'boris'], boris: ['clara'] };
    expect(relationshipBetween('anna', 'boris', graph(edges))).toBe('friend-of-friend');
    // Friendship is mutual, so the relation reads the same from either end.
    expect(relationshipBetween('boris', 'anna', graph(edges))).toBe('friend-of-friend');
  });

  it('is `stranger` when the only common name is not shared', () => {
    expect(relationshipBetween('anna', 'boris', graph({ anna: ['clara'], clara: ['anna'] }))).toBe('stranger');
  });

  it('is `stranger` for a missing id', () => {
    expect(relationshipBetween('', 'boris', graph({}))).toBe('stranger');
    expect(relationshipBetween('anna', '', graph({}))).toBe('stranger');
  });

  it('lets a block beat a friendship, in either direction', () => {
    const edges = { anna: ['boris'], boris: ['anna'] };
    expect(relationshipBetween('anna', 'boris', graph(edges, ['anna>boris']))).toBe('stranger');
    expect(relationshipBetween('anna', 'boris', graph(edges, ['boris>anna']))).toBe('stranger');
  });

  it('treats a block as a block even without a friendship', () => {
    expect(relationshipBetween('anna', 'boris', graph({}, ['boris>anna']))).toBe('stranger');
  });
});
