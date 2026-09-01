// Plain serializable state shapes — the durable, renderer-free model.
//
// These are the source of truth for "what a player/piece/node IS on the wire".
// The Colyseus Schema classes in server/src/schema mirror these field-for-field.
// The client reads Colyseus state and can treat it as (a superset of) these.
//
// Positions use the ground plane: x (east/west) and z (north/south), matching
// the avatar. Height (y) is derived from page terrain on each client, so it is
// deliberately NOT synced. `facing` is a yaw angle in radians.

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
};

/**
 * One item waiting in an account's mailbox — the offline half of gifting and
 * mailed garden harvests. Shape only for now; delivery lands in Phase F
 * (docs/communal-multiplayer.md §6).
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
  /**
   * Accounts refused entry to THIS neighborhood.
   *
   * Durable on purpose: a removal that lasted only until the room emptied
   * would be no removal at all, since rooms are disposed the moment the last
   * person leaves. Absent on saves written before removal existed - read it
   * with `?? []`.
   */
  bannedAccountIds?: string[];
};
