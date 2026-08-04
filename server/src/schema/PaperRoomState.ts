// Colyseus Schema — the network-synced mirror of shared/protocol/state.ts.
//
// These decorated classes are what Colyseus diffs and streams to clients.
// They mirror the plain shared types field-for-field on purpose: the shared
// types stay the durable/save format and the single source of truth, and this
// file is "the same shapes, wearing their networking clothes".
//
// Note: schema number fields can't be null, so ResourceNode.respawnAt uses 0
// to mean "available now" here; convert to null when writing plain snapshots.

import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema';

export class AvatarSchema extends Schema {
  @type('string') preset = 'medium';
  @type('string') drawingKey = '';
  @type('string') edgeColor = '#3a3226';
}

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = 'paper friend';
  @type(AvatarSchema) avatar = new AvatarSchema();
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') facing = 0;
  @type('string') page = '0,0';
}

export class ChatSchema extends Schema {
  @type('string') id = '';
  @type('string') playerId = '';
  @type('string') name = '';
  @type('string') text = '';
  @type('number') at = 0;
}

export class PieceSchema extends Schema {
  @type('string') id = '';
  @type('string') templateKey = '';
  @type('number') x = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  @type('string') ownerId = '';
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
  @type([ChatSchema]) chat = new ArraySchema<ChatSchema>();
  @type({ map: PieceSchema }) pieces = new MapSchema<PieceSchema>();
  @type({ map: NodeSchema }) nodes = new MapSchema<NodeSchema>();
}
