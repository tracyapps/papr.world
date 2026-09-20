// Profiles: what a player chooses to show about themselves — a bio and a few
// social links, each with its own audience — plus the one-hop relationship the
// visibility rules need to decide who sees which field.
//
// Account-level, like friends, blocks, tech and designs: a bio is the same bio
// in the next neighborhood, so this lives in its own store and never in room
// state (docs/accounts-worlds-and-social.md: "Do not put global friendship or
// account inventory in Colyseus room state"). The room CONSUMES a profile to
// answer one player-card request; it does not own it.
//
// WHY a JSON store and not the Neon `player_profiles` table, whose
// bio/social_links/privacy columns already exist: every other account fact on
// this server (friends, blocks, tech, designs, mail) is a small JSON store in
// PP_DATA_DIR, and those keep working with DATABASE_URL unset. Nothing has ever
// read or written those columns. Wiring Neon here would make profiles the one
// account feature that needs a database to exist, for no benefit — the shared
// `PlayerProfile` shape is exactly the table's intent, so a later migration is
// a copy, not a redesign.
//
// Shape hygiene matches the rest of the house: sanitize on the way in AND on
// load, atomic writes, and a loud complaint rather than a silent empty start
// when the file cannot be read.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DEFAULT_PROFILE,
  sanitizeName,
  sanitizeProfile,
  type PlayerProfile,
  type ProfileRelationship,
  type ProfileUpdate,
} from '../../shared/src/index';

/**
 * A stored profile plus the display name it was last published with. The name
 * rides along so a card or a request to somebody who is offline still reads
 * with the name they chose, rather than a placeholder.
 */
type StoredProfile = PlayerProfile & { name: string };

type StoreFile = {
  version: 1;
  /** accountId -> the profile that account published. */
  profiles: Record<string, StoredProfile>;
};

/**
 * What `relationshipBetween` is allowed to ask, injected so the helper stays
 * pure and unit-testable without a store. `isBlocked` is optional and
 * direction-agnostic at the call site: a block is not a relationship, and it
 * overrides friendship in either direction.
 */
export type RelationshipDependencies = {
  areFriends: (a: string, b: string) => boolean;
  friendsOf: (accountId: string) => string[];
  isBlocked?: (a: string, b: string) => boolean;
};

/**
 * How `viewer` stands to `target`. `self` and `friend` are direct; a
 * `friend-of-friend` is one accepted hop away; anything else is a stranger.
 *
 * BLOCKS BEAT EVERYTHING. A blocked pairing is `stranger`, so no field and no
 * relationship leaks through a profile — the card answers exactly as it would
 * for somebody never met (in the room, that is `found: false`).
 *
 * THE HOP IS SYMMETRIC. Friendship in `FriendStore` is mutual and stored both
 * ways, so checking "is any friend of the target also a friend of the viewer"
 * is the same relation read from either end: my friend's friend they are, and
 * their friend's friend I am. There is no direction to choose.
 */
export function relationshipBetween(
  viewer: string,
  target: string,
  deps: RelationshipDependencies,
): ProfileRelationship {
  if (!viewer || !target) return 'stranger';
  if (viewer === target) return 'self';
  if (deps.isBlocked?.(viewer, target) || deps.isBlocked?.(target, viewer)) return 'stranger';
  if (deps.areFriends(viewer, target)) return 'friend';
  const targetFriends = deps.friendsOf(target);
  if (targetFriends.some((friendId) => deps.areFriends(viewer, friendId))) return 'friend-of-friend';
  return 'stranger';
}

/** Atomic write: temp file in the same directory, then rename over the top. */
function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

/** Deep-enough copy that a caller cannot mutate what the store holds. */
function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return {
    bio: profile.bio,
    links: profile.links.map((link) => ({ ...link })),
    visibility: { ...profile.visibility },
  };
}

export class ProfileStore {
  private records = new Map<string, StoredProfile>();
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'profiles.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>;
      for (const [accountId, raw] of Object.entries(parsed.profiles ?? {})) {
        const profile = sanitizeProfile(raw);
        if (!accountId || !profile) continue;
        this.records.set(accountId, {
          ...profile,
          name: sanitizeName((raw as { name?: unknown } | null)?.name),
        });
      }
    } catch (error) {
      // Starting empty would silently hide everybody's bio and links, so say so
      // loudly rather than pretending the store was always empty.
      console.error(`profiles: failed to read ${this.path}, starting empty`, error);
    }
  }

  /** Profiles change rarely and are deliberate, so write through. */
  private flush(): void {
    const profiles: Record<string, StoredProfile> = {};
    for (const [accountId, record] of this.records) profiles[accountId] = record;
    writeAtomic(this.path, JSON.stringify({ version: 1, profiles } satisfies StoreFile, null, 2));
  }

  /**
   * The account's profile, or the empty default. A copy either way, so a caller
   * can never touch what the store holds. Bounded by construction: the
   * sanitizer caps every field (bio, links, each URL).
   */
  profileFor(accountId: string): PlayerProfile {
    return cloneProfile(this.records.get(accountId) ?? DEFAULT_PROFILE);
  }

  /**
   * The last display name this account published with its profile, or null if
   * it has never set one. Used as an offline-name fallback; never identity.
   */
  nameFor(accountId: string): string | null {
    return this.records.get(accountId)?.name ?? null;
  }

  /**
   * Store a whole profile. Sanitized on the way in so a hand-built call can
   * never persist something the wire would have refused.
   */
  set(accountId: string, name: string, profile: PlayerProfile): PlayerProfile {
    const clean = sanitizeProfile(profile) ?? cloneProfile(DEFAULT_PROFILE);
    this.records.set(accountId, { ...clean, name: sanitizeName(name) });
    this.flush();
    return cloneProfile(clean);
  }

  /**
   * Merge a partial update over the stored profile and save. Absent fields are
   * left alone, present ones replace — the wire's own rule (`ProfileUpdate`),
   * applied field by field so a visibility patch touches only the field named.
   */
  update(accountId: string, name: string, patch: ProfileUpdate): PlayerProfile {
    const current = this.records.get(accountId) ?? DEFAULT_PROFILE;
    return this.set(accountId, name, {
      bio: patch.bio ?? current.bio,
      links: patch.links ?? current.links,
      visibility: { ...current.visibility, ...(patch.visibility ?? {}) },
    });
  }
}
