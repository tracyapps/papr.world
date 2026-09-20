// Protocol constants shared by client and server.
//
// This whole `shared/` tree is renderer-free AND networking-library-free:
// nothing here may import Three.js or Colyseus. It holds the serializable
// shapes and rules both sides agree on, exactly as technical-plan.md's
// `packages/shared` describes. The Colyseus Schema classes live in server/
// and mirror these plain types.

/**
 * Bump when the wire shapes below change in a breaking way. The room checks
 * this on join so a stale client fails fast instead of desyncing silently.
 */
export const PROTOCOL_VERSION = 11; // v11: display cases — a synced `cases` map and the case messages. (v10: guests — homes carry parts and an open sign, players carry `inside`, friends/entry/knock messages)

/** Bump when RoomSave's shape changes; persistence migrates on load. */
export const SAVE_VERSION = 1;

/** Server simulation/broadcast rate. 20 Hz is plenty for a cozy walking game. */
export const SERVER_TICK_HZ = 20;

/** How often the client sends its movement intent. Keep at/under the tick. */
export const CLIENT_INTENT_HZ = 15;

/** Limits the server enforces so a bad/hostile client can't grief a room. */
export const LIMITS = {
  /** Max players per neighborhood room. */
  playersPerRoom: 16,
  /** Display-name length after trimming. */
  nameMaxLength: 24,
  /** Chat message length after trimming. */
  chatMaxLength: 240,
  /**
   * Anti-teleport speed cap in world units/second. A touch above the
   * avatar's real top speed so honest latency spikes aren't punished, but
   * warps get clamped. Tune against game/avatar.ts once movement is final.
   */
  maxMoveSpeed: 12,
  /** Build pieces a single room can hold in the prototype. */
  placedPiecesPerRoom: 500,
  /** Build pieces any one account may have standing in a room. */
  placedPiecesPerPlayer: 100,
  /** Passport secret length in characters (base64url of 32 random bytes). */
  accountSecretLength: 43,
  /** Mail items retained per account before oldest drop off. */
  mailboxMax: 200,
  /** Long enough for a letter, short enough to remain a note rather than a document. */
  mailTextMaxLength: 500,
  /** Server-side pause between letters from one live session. */
  mailSendIntervalMs: 3_000,
  /** Largest single parcel; keeps mistakes and payloads bounded. */
  mailAttachmentMax: 999,
  /** Defensive ceiling for any one server-owned inventory stack. */
  inventoryStackMax: 999_999,

  /**
   * Accounts one person may block. Generous - nobody should ever hit it -
   * but bounded, because an unbounded list is a way to fill the disk.
   */
  blockListMax: 500,

  /** A safety report's own words. */
  reportDetailsMax: 1000,

  /**
   * Reports one account may file in ten minutes. Reporting must never feel
   * rationed, so this is only high enough to stop a script.
   */
  reportsPerWindow: 12,
  reportWindowMs: 10 * 60 * 1000,

  /**
   * Chat lines a late joiner receives. Chat is NOT synced room state any
   * more (see the note on ChatHistory in messages.ts), so this is the size
   * of the ring the server keeps in memory per neighborhood.
   */
  chatHistory: 50,

  /**
   * Caps for the one-time solo-save-into-account import
   * (`accounts-worlds-and-social.md`'s "Migration from today's prototype").
   * A local save is self-reported and unverifiable, unlike everything else
   * `AccountInventory` ever receives — these stay far below
   * `inventoryStackMax` on purpose, since the review screen (a human reading
   * the numbers before confirming) is the primary defense, not this ceiling.
   */
  soloMigrationStackMax: 5_000,
  /** Distinct resource/tool/item ids one solo-save report may name. */
  soloMigrationBagKeysMax: 200,
  /** Distinct learned-plan ids one solo-save report may name. */
  soloMigrationPlansMax: 200,
  /**
   * Distinct learned-plan ids one account may own across its whole life —
   * every recipe the catalog will ever grow to, plus headroom, so honest
   * accounts never hit it.
   */
  accountPlansMax: 500,

  // ---- Friends and guests (docs/house-and-home.md, "Who can come in") ----

  /** Friends one account may have. Generous; bounded so the file cannot grow forever. */
  friendsMax: 200,
  /** Pending requests, each direction, per account. */
  friendRequestsMax: 50,
  /** A request nobody answers lapses quietly after this long. */
  friendRequestTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** A knock nobody answers lapses quietly after this long. */
  knockTtlMs: 5 * 60 * 1000,
  /** One knock per visitor per door in this window, however it was answered. */
  knockCooldownMs: 3 * 60 * 1000,
  /** After "let in", the visitor has this long to step through. */
  entryPermitTtlMs: 2 * 60 * 1000,
  /** The most a leave-a-note-for-an-absent-owner knock writes, per visitor per door. */
  knockNoteIntervalMs: 6 * 60 * 60 * 1000,
  /** Finished parts a home marker may list (there are six today). */
  homePartsMax: 12,

  // ---- Display cases (docs/house-and-home.md, "Display cases") ----

  /** Display cases one account may have standing in a room. */
  casesPerPlayer: 6,
  /** Things one case holds: stacks in a free case, trinkets in a show case. */
  caseSlots: 8,
  /** A case's label, in characters. */
  caseLabelMax: 60,
  /** Who-took-what lines kept per case; the oldest fall off. */
  caseLogMax: 40,
  /** How close you must stand to a case to use it, in world units. */
  caseReach: 4,
} as const;

/**
 * Where every home interior is parked in world coordinates. Interiors are a
 * client-side scene; presence inside one is told apart from presence outside
 * by `PlayerState.inside`, and the server accepts a jump to or from here only
 * at the moment `inside` changes (see PaperRoom.handleMove).
 */
export const INTERIOR_SPACE = { x: 40000, z: 40000, radius: 100 } as const;

/** How close to the door a player must reappear when leaving a home, in world units. */
export const HOME_EXIT_RADIUS = 30;

/** Default room name / neighborhood the first slice joins. */
export const DEFAULT_ROOM = 'neighborhood';

/** Backward-compatible room for old `?shared=1` development links and saves. */
export const LEGACY_INVITE_CODE = 'PAPR-22';
