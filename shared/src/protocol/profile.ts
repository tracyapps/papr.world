// Profiles: the durable, renderer-free shape of what a player chooses to show.
//
// Design: docs/accounts-worlds-and-social.md ("Names and profiles").
// The server's `player_profiles` columns (`bio`, `social_links` jsonb,
// `privacy` jsonb) map to the values below; nothing read or wrote them before
// this file, so this IS the shape they will use.
//
// Two rules run through everything here:
//   * Visibility is per FIELD, not per profile. Sharing your links does not
//     share your bio; each has its own audience, and a new field can be added
//     without renegotiating any existing one (see PROFILE_FIELDS).
//   * You can always be seen by someone you reached out to. If I send a
//     friend request, the person I asked may read my basic fields whatever I
//     have set their visibility to (see profileForViewer) — asking somebody to
//     be friends should never be a blind request.
//
// Renderer-free and networking-free like the rest of this tree: plain values
// and pure functions, no three/colyseus, and no globals a bare ES2022 target
// would lack (URLs are checked by shape, not parsed with the WHATWG `URL`).

import { LIMITS } from './constants';
import { stripControlChars } from './validate';

// ---- Visibility -------------------------------------------------------------

/**
 * Who may see a field. Listed from the most open audience to the most closed,
 * which is also the order a picker should offer them.
 */
export type ProfileVisibility = 'everyone' | 'friends' | 'friends-of-friends';

/** Every visibility level, for pickers and validation. */
export const PROFILE_VISIBILITY_LEVELS: readonly ProfileVisibility[] = [
  'everyone',
  'friends',
  'friends-of-friends',
];

/**
 * The profile fields whose audience is set individually.
 *
 * This list is the seam that keeps the wire shape additive: a sanitizer fills
 * every field it knows, so an older payload that lacks a newer field's key
 * still parses, and adding a field here (plus its default below) needs no
 * change to anything already on the wire.
 */
export type ProfileField = 'bio' | 'links';

/** The fields, in one place, so adding one is a single-line change. */
export const PROFILE_FIELDS: readonly ProfileField[] = ['bio', 'links'];

/** One audience per field. */
export type ProfileFieldVisibilities = Record<ProfileField, ProfileVisibility>;

/**
 * Where every field points until its owner says otherwise. Closed-by-default:
 * a bio or a link is something you opted to share, so the safe starting
 * audience is friends, never the whole world.
 */
export const DEFAULT_PROFILE_VISIBILITY: ProfileFieldVisibilities = {
  bio: 'friends',
  links: 'friends',
};

// ---- Social links -----------------------------------------------------------

/**
 * The kinds of link a profile may carry. A bounded allow-list on purpose: it
 * keeps a profile a small, skimmable set of recognizable destinations rather
 * than a free-form list of arbitrary URLs. `other` is the escape hatch.
 */
export const SOCIAL_LINK_KINDS = [
  'website',
  'instagram',
  'x',
  'youtube',
  'twitch',
  'discord',
  'other',
] as const;

export type SocialLinkKind = (typeof SOCIAL_LINK_KINDS)[number];

/** One social destination: what it is, and where it points (http/https only). */
export type ProfileSocialLink = {
  kind: SocialLinkKind;
  /** A bounded, control-character-free `http(s)://` URL. */
  url: string;
};

// ---- The profile itself -----------------------------------------------------

/**
 * Everything a player has chosen to publish about themselves. `handle` and
 * `display_name` are NOT here on purpose: the display name travels with the
 * live player, and the handle is a lookup key the server owns, not a field a
 * viewer is handed a copy of.
 */
export type PlayerProfile = {
  /** Free text; '' means "nothing written". */
  bio: string;
  /** Bounded, ordered; [] means "none shared". */
  links: ProfileSocialLink[];
  /** Per-field audience. */
  visibility: ProfileFieldVisibilities;
};

/** A brand-new, empty profile: nothing written, nothing shared, friends-only. */
export const DEFAULT_PROFILE: PlayerProfile = {
  bio: '',
  links: [],
  visibility: { ...DEFAULT_PROFILE_VISIBILITY },
};

// ---- Sanitizers -------------------------------------------------------------

function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return typeof value === 'string'
    && (PROFILE_VISIBILITY_LEVELS as readonly string[]).includes(value);
}

function isSocialLinkKind(value: unknown): value is SocialLinkKind {
  return typeof value === 'string' && (SOCIAL_LINK_KINDS as readonly string[]).includes(value);
}

/** Trim, drop control characters, and clamp a bio. Never null: '' is valid. */
export function sanitizeBio(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  return stripControlChars(text).trim().slice(0, LIMITS.bioMax);
}

/**
 * A single social link, or null. http/https only, bounded length, no control
 * characters — a link containing one is refused rather than silently cleaned,
 * because a URL with a stray control character is not a URL worth trusting.
 */
export function sanitizeSocialLink(raw: unknown): ProfileSocialLink | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<ProfileSocialLink>;
  if (!isSocialLinkKind(value.kind)) return null;
  const url = sanitizeSocialUrl(value.url);
  return url ? { kind: value.kind, url } : null;
}

/**
 * One social URL, or null. Shape-checked rather than parsed: any `http://` or
 * `https://` URL with no whitespace and no control characters, within
 * `socialUrlMax`. Refusing control characters is deliberate (a URL that
 * contains one is suspect); there is no partial cleaning here.
 */
export function sanitizeSocialUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url || url.length > LIMITS.socialUrlMax) return null;
  if (stripControlChars(url) !== url) return null;
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

/**
 * A bounded list of well-formed links. Malformed entries are dropped and the
 * list is cut at `socialLinksMax`, the same forgiving-of-entries / strict-on-
 * shape split the case and home-part sanitizers use.
 */
export function sanitizeSocialLinks(raw: unknown): ProfileSocialLink[] {
  if (!Array.isArray(raw)) return [];
  const links: ProfileSocialLink[] = [];
  for (const entry of raw) {
    const link = sanitizeSocialLink(entry);
    if (link) links.push(link);
    if (links.length >= LIMITS.socialLinksMax) break;
  }
  return links;
}

/**
 * Every field's audience, filling anything unknown or malformed from the
 * default. The lenient path, for data we are DISCARDING rather than acting on
 * (a stored profile, a synced snapshot) — bad saved data becomes friends-only,
 * never "everything public".
 */
export function profileVisibilityOrDefault(raw: unknown): ProfileFieldVisibilities {
  const result: ProfileFieldVisibilities = { ...DEFAULT_PROFILE_VISIBILITY };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const value = raw as Record<string, unknown>;
  for (const field of PROFILE_FIELDS) {
    const level = value[field];
    if (isProfileVisibility(level)) result[field] = level;
  }
  return result;
}

/**
 * The audience changes in a profile update. Only the fields the client named
 * are returned; a named field with a value that is not a real level refuses
 * the whole patch (returns null), the same way `sanitizeCaseSet` refuses a bad
 * present field rather than quietly ignoring it. Unknown keys are ignored, so
 * an older server tolerates a newer client's extra fields.
 */
export function sanitizeProfileVisibilityPatch(
  raw: unknown,
): Partial<ProfileFieldVisibilities> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const patch: Partial<ProfileFieldVisibilities> = {};
  for (const field of PROFILE_FIELDS) {
    if (value[field] === undefined) continue;
    if (!isProfileVisibility(value[field])) return null;
    patch[field] = value[field] as ProfileVisibility;
  }
  return patch;
}

/**
 * Normalize an untrusted full profile into a safe, complete one.
 *
 * Returns null only when the value is not an object at all — a stored profile
 * with a missing or broken field heals to the default rather than being thrown
 * away, matching `homePolicyOrDefault`'s spirit.
 */
export function sanitizeProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<PlayerProfile>;
  return {
    bio: sanitizeBio(value.bio),
    links: sanitizeSocialLinks(value.links),
    visibility: profileVisibilityOrDefault(value.visibility),
  };
}

/**
 * A partial profile update — what a client may send to change one field
 * without restating the rest (see `ClientMessage.SetProfile`).
 *
 * Presents only the fields the client actually named, so "send one field" is
 * literally one field on the wire. Null means the payload is unusable as a
 * whole: not an object, or a present field whose value cannot be accepted.
 */
export type ProfileUpdate = {
  bio?: string;
  links?: ProfileSocialLink[];
  visibility?: Partial<ProfileFieldVisibilities>;
};

/**
 * Normalize a partial profile update, or null when it is unusable. Absent
 * fields stay absent (nothing is invented); a present-but-invalid field
 * refuses the patch, so the client learns its update was not applied.
 */
export function sanitizeProfileUpdate(raw: unknown): ProfileUpdate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<ProfileUpdate>;
  const update: ProfileUpdate = {};
  if (value.bio !== undefined) {
    if (typeof value.bio !== 'string') return null;
    update.bio = sanitizeBio(value.bio);
  }
  if (value.links !== undefined) {
    if (!Array.isArray(value.links)) return null;
    update.links = sanitizeSocialLinks(value.links);
  }
  if (value.visibility !== undefined) {
    const visibility = sanitizeProfileVisibilityPatch(value.visibility);
    if (!visibility) return null;
    update.visibility = visibility;
  }
  return update;
}

// ---- Who may see what -------------------------------------------------------

/**
 * How the viewer stands to the profile's owner. Ordered from closest to most
 * distant; `stranger` is the default when nothing else is known.
 */
export type ProfileRelationship = 'self' | 'friend' | 'friend-of-friend' | 'stranger';

/** Every relationship, closest first — for tests and exhaustive UI. */
export const PROFILE_RELATIONSHIPS: readonly ProfileRelationship[] = [
  'self',
  'friend',
  'friend-of-friend',
  'stranger',
];

/**
 * Whether a viewer in this relationship may see a field set to this visibility.
 *
 *   relationship \ visibility | everyone | friends | friends-of-friends
 *   --------------------------+----------+---------+-------------------
 *   self                      |   yes    |   yes   |        yes
 *   friend                    |   yes    |   yes   |        yes
 *   friend-of-friend          |   yes    |   no    |        yes
 *   stranger                  |   yes    |   no    |        no
 *
 * Read as an audience that widens: `friends` reaches self + friend, and
 * `friends-of-friends` reaches self + friend + friend-of-friend.
 */
export function canViewProfileField(
  relationship: ProfileRelationship,
  visibility: ProfileVisibility,
): boolean {
  if (relationship === 'self') return true;
  switch (visibility) {
    case 'everyone':
      return true;
    case 'friends':
      return relationship === 'friend';
    case 'friends-of-friends':
      return relationship === 'friend' || relationship === 'friend-of-friend';
  }
}

/** The subset of a profile a particular viewer may see. Empty fields are omitted. */
export type VisibleProfile = {
  bio?: string;
  links?: ProfileSocialLink[];
};

/**
 * The profile subset a viewer may see, filtered by each field's audience.
 *
 * THE OWNER RULE: when `hasSentRequest` is true — the profile's owner has an
 * outstanding friend request to this viewer — the basic fields (bio, links)
 * are visible no matter what their visibility is set to. Somebody you asked to
 * be friends should be able to see who is asking.
 *
 * A field with nothing in it is omitted entirely, so an all-empty profile
 * yields `{}` and an all-private one for a stranger does too.
 */
export function profileForViewer(
  profile: PlayerProfile,
  relationship: ProfileRelationship,
  options: { hasSentRequest?: boolean } = {},
): VisibleProfile {
  const seesBasics = options.hasSentRequest === true;
  const view: VisibleProfile = {};
  if (profile.bio.length > 0
    && (seesBasics || canViewProfileField(relationship, profile.visibility.bio))) {
    view.bio = profile.bio;
  }
  if (profile.links.length > 0
    && (seesBasics || canViewProfileField(relationship, profile.visibility.links))) {
    view.links = profile.links;
  }
  return view;
}
