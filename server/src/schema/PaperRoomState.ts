// Colyseus Schema — the network-synced mirror of shared/protocol/state.ts.
//
// These decorated classes are what Colyseus diffs and streams to clients.
// They mirror the plain shared types field-for-field on purpose: the shared
// types stay the durable/save format and the single source of truth, and this
// file is "the same shapes, wearing their networking clothes".
//
// Note: schema number fields can't be null, so ResourceNode.respawnAt uses 0
// to mean "available now" here; convert to null when writing plain snapshots.
//
// Chat is deliberately NOT here any more. Synced state is the same for every
// client by construction, so as long as chat lived in it the server had no way
// to give two people different views — which meant a personal block could not
// be honoured. Chat is now history-on-join plus per-recipient broadcasts; see
// the ChatHistory note in shared/src/protocol/messages.ts.

import { MapSchema, Schema, type } from '@colyseus/schema';

export class AvatarSchema extends Schema {
  @type('string') preset = 'medium';
  @type('string') drawingKey = '';
  @type('string') edgeColor = '#3a3226';
}

export class PlayerSchema extends Schema {
  @type('string') id = '';
  /** Durable account id (or `guest:<sessionId>`); the key for maker credit. */
  @type('string') accountId = '';
  @type('string') name = 'paper friend';
  @type(AvatarSchema) avatar = new AvatarSchema();
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') facing = 0;
  @type('string') page = '0,0';
  /**
   * Whether this player may remove others. Synced so every client can show
   * the right controls — but the server never trusts it back, and checks the
   * owner account itself on every removal.
   */
  @type('boolean') isOwner = false;
}

export class PieceSchema extends Schema {
  @type('string') id = '';
  @type('string') templateKey = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  /** Which material option the piece was built from; see shared PlacedPiece. */
  @type('string') material = '';
  /** Reserved for a future per-piece style choice; always empty today. */
  @type('string') designId = '';
  /** Durable ACCOUNT id of the maker — stamped server-side, never client-sent. */
  @type('string') makerId = '';
  @type('string') page = '0,0';
}

export class NodeSchema extends Schema {
  @type('string') id = '';
  @type('string') kind = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('string') page = '0,0';
  @type('number') remaining = 0;
  /** 0 == available now; otherwise server epoch ms when it refills. */
  @type('number') respawnAt = 0;
}

export class PaperRoomState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: PieceSchema }) pieces = new MapSchema<PieceSchema>();
  @type({ map: NodeSchema }) nodes = new MapSchema<NodeSchema>();
}
