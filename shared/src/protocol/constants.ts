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
export const PROTOCOL_VERSION = 5; // v5: PlacedPiece gains material + designId

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
} as const;

/** Default room name / neighborhood the first slice joins. */
export const DEFAULT_ROOM = 'neighborhood';

/** Backward-compatible room for old `?shared=1` development links and saves. */
export const LEGACY_INVITE_CODE = 'PAPR-22';
