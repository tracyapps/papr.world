// Plain serializable state shapes — the durable, renderer-free model.
//
// These are the source of truth for "what a player/piece/node IS on the wire".
// The Colyseus Schema classes in server/src/schema mirror these field-for-field.
// The client reads Colyseus state and can treat it as (a superset of) these.
//
// Positions use the ground plane: x (east/west) and z (north/south), matching
// the avatar. Height (y) is derived from page terrain on each client, so it is
// deliberately NOT synced. `facing` is a yaw angle in radians.

import type { HomePolicy } from './guests';

/** Which drawn body a player is wearing — a reference, never the raw art. */
export type AvatarRef = {
  /** Gameplay body preset that drives the hidden collision body. */
  preset: 'small' | 'medium' | 'wide' | 'tall' | 'wheeled' | 'hovering';
  /**
   * Stable key pointing at the saved drawing (texture/strokes) in whatever
   * store holds user art. Empty string = the default placeholder avatar.
   */
  drawingKey: string;
  /** Outline/edge tint so remote avatars read as paper without the full art. */
  edgeColor: string;
};

export type PlayerState = {
  /** Server-assigned session id (transport-only — never store in world data). */
  id: string;
  /**
   * Durable account id ("paper passport"). This — not the session id — is the
   * key for maker credit, mailboxes, and block lists. Guests get a
   * `guest:<sessionId>` id that is real for the visit but not durable.
   */
  accountId: string;
  name: string;
  avatar: AvatarRef;
  x: number;
  z: number;
  /** Yaw in radians. */
  facing: number;
  /** Page id the player is currently standing on, e.g. "0,0". */
  page: string;
  /**
   * Account id of the home this player is inside, or '' when outside. Set only
   * by the server (EnterHome / LeaveHome), never taken from a move. Two players
   * see each other only when this matches, and chat stays within it.
   */
  inside: string;
};

export type ChatMessage = {
  id: string;
  playerId: string;
  /** Denormalized so the log survives the author leaving. */
  name: string;
  text: string;
  /** Server epoch ms. */
  at: number;
};

export type PlacedPiece = {
  id: string;
  /** Manifest key for the build-piece template, never a file path. */
  templateKey: string;
  x: number;
  z: number;
  /** Yaw in radians. */
  rotY: number;
  /**
   * Which of that piece type's `BUILD_MATERIAL_OPTIONS` it was built from —
   * a plain string here, not a `MaterialKey`, so this render-free shared
   * layer never imports anything from `render/`. A stray/unrecognized value
   * (an older save, an older protocol client) falls back to that piece
   * type's original look — see `resolveBuildMaterial` in
   * `sim/catalogs/building.ts`, the single place that reconciles this.
   */
  material: string;
  /**
   * Reserved for a future choice of style/design per piece type (e.g.
   * several bench shapes) — always empty today. The seam exists now so
   * that feature won't need another protocol bump when it lands.
   */
  designId?: string;
  /**
   * Durable ACCOUNT id of who placed it — permissions, maker credit, and
   * mailed harvests all key off this. Stamped by the server from the
   * authenticated join; never taken from the client intent.
   */
  makerId: string;
  page: string;
  /** Account id of the home containing this piece; absent/empty on the surface.
   * Optional only so v1 room saves written before interior sharing still load. */
  home?: string;
};

/**
 * Where an account's home is, for neighbors to see (avatar-and-identity.md's
 * "house of —" entry point, land-and-dwellings.md's "planting your mailbox").
 * One marker per account, keyed by `accountId` server-side — moving is a
 * write to the one record, never a second marker left behind. No physical
 * house exists yet, so this renders as a small under-construction plot: the
 * visible promise of a home, not the building itself.
 */
export type HomeMarker = {
  accountId: string;
  /** Display name at the moment the marker was (re)published — a snapshot,
   *  like ChatBroadcast's, so the sign still reads right if they're offline. */
  name: string;
  x: number;
  z: number;
  page: string;
  /** Finished parts of the house, so neighbors can draw it. Empty = the tent. */
  parts: string[];
  /** The part being built right now, or '' - neighbors see its scaffolding. */
  building: string;
  /** Open house: shows a sign anyone can read. The rest of the door settings are private. */
  open: boolean;
  /** Mailbox rig id (`isMailboxStyleId` in sim/catalogs/mailboxes.ts). */
  mailboxStyle: string;
  /** Mailbox team colors, as hex strings. */
  mailboxPrimary: string;
  mailboxSecondary: string;
};

/**
 * One item waiting in an account's mailbox — the offline half of gifting and
 * mailed garden harvests. The local inbox and collection rules use this shape;
 * authoritative account delivery lands in Phase F
 * (`docs/communal-multiplayer.md` §6).
 */
export type MailItem = {
  id: string;
  /** Account id of the sender, or "world" for system mail. */
  fromAccountId: string;
  /** Denormalized display name so mail survives the sender's absence. */
  fromName: string;
  /** e.g. "gift", "harvest", "note". */
  kind: string;
  /** Renderer-free payload (item key + count, note text, ...). */
  payload: Record<string, string | number>;
  /** Server epoch ms when queued. */
  at: number;
};

/** Server-owned balance used for anything transferable between players. */
export type AccountInventory = {
  /** Monotonic account-local revision; clients ignore stale snapshots. */
  revision: number;
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
};

/**
 * Server-owned record of the techniques an account has learned — the
 * account-scoped half of the knowledge tree ("tech-tree knowledge" in
 * `docs/accounts-worlds-and-social.md`'s account/world table). Plan ids are
 * opaque strings here for the same reason `SoloMigrationSnapshot.plans`
 * keeps them: this shared layer has no recipe catalog, so validation is a
 * bounded shape, not a membership test.
 */
export type AccountTech = {
  /** Monotonic account-local revision; clients ignore stale snapshots. */
  revision: number;
  /** Learned plan ids, deduped, first-seen order, bounded by LIMITS.accountPlansMax. */
  plans: string[];
};

/**
 * What a client reports finding in today's local solo save, for the
 * account desk to show a human-readable review before importing it.
 * Unlike `AccountInventory` this is self-reported and never trusted at
 * face value — see `sanitizeSoloMigrationSnapshot` and
 * `soloMigrationStackMax`/`soloMigrationBagKeysMax`.
 */
export type SoloMigrationSnapshot = {
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
  /** Recipe ids the solo save had learned, starters included — the server
   *  does not know which ids are starters, so it records them all rather
   *  than guessing; harmless, since starters are granted to every account
   *  anyway. */
  plans: string[];
};

/** The durable, one-time record of what a solo-save import actually granted. */
export type SoloMigrationReceipt = SoloMigrationSnapshot & {
  /** Server epoch ms when the import was reserved (see `SoloMigrationStore`). */
  at: number;
};

export type ResourceNode = {
  id: string;
  /** e.g. "scrap.lined", "scrap.cardboard". */
  kind: string;
  x: number;
  z: number;
  page: string;
  /** Units left to gather before the node is spent. */
  remaining: number;
  /** Server epoch ms when a spent node refills, or null if available now. */
  respawnAt: number | null;
};

/** Convenience: a full room snapshot in plain form (for saves/tests). */
export type RoomSnapshot = {
  players: PlayerState[];
  chat: ChatMessage[];
  pieces: PlacedPiece[];
  nodes: ResourceNode[];
};

/**
 * What the server persists per neighborhood — "the world remembers".
 *
 * Deliberately durable: pieces and nodes. Deliberately NOT durable: player
 * positions (transient) and chat (a privacy default — invite-only friends
 * shouldn't find their conversations archived; revisit knowingly, if ever).
 */
export type RoomSave = {
  /** Bump SAVE_VERSION and migrate on shape changes. */
  version: number;
  /** Server epoch ms of the write. */
  savedAt: number;
  pieces: PlacedPiece[];
  nodes: ResourceNode[];
  /** Absent on saves written before home markers existed - read it with `?? []`. */
  homes?: HomeMarker[];
  /**
   * Accounts refused entry to THIS neighborhood.
   *
   * Durable on purpose: a removal that lasted only until the room emptied
   * would be no removal at all, since rooms are disposed the moment the last
   * person leaves. Absent on saves written before removal existed - read it
   * with `?? []`.
   */
  bannedAccountIds?: string[];
  /**
   * Private door settings by account (see `HomePolicy`). Not in synced state:
   * whether a friend or a stranger gets in is not the neighbors' business.
   * Absent on saves written before guests existed - read it with `?? {}`.
   */
  homePolicies?: Record<string, HomePolicy>;
};
