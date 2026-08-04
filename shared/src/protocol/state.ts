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
  /** Server-assigned session id. */
  id: string;
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
  /** Session id of who placed it — used for permissions/credit. */
  ownerId: string;
  page: string;
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
