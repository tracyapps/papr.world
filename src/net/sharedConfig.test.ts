import { describe, expect, it } from 'vitest';
import type { AvatarDesign } from '../../shared/src/index';
import {
  avatarRefForDesign,
  buildSharedPlayUrl,
  buildSoloUrl,
  generateInviteCode,
  httpEndpointForWebSocket,
  readSharedModeConfig,
} from './sharedConfig';
import { sanitizeInviteCode } from '../../shared/src/index';

describe('shared-mode configuration', () => {
  it('leaves ordinary solo URLs completely offline', () => {
    expect(readSharedModeConfig(new URL('https://example.test/world'))).toBeNull();
  });

  it('uses safe local defaults only after explicit opt-in', () => {
    expect(readSharedModeConfig(new URL('https://example.test/world?shared=1'), 'Fern')).toEqual({
      endpoint: 'ws://localhost:2567',
      httpEndpoint: 'http://localhost:2567',
      name: 'Fern',
      room: 'neighborhood',
      inviteCode: 'PAPR-22',
      intent: 'create',
    });
  });

  it('accepts an explicit secure server and sanitizes the display name', () => {
    expect(
      readSharedModeConfig(
        new URL('https://play.test/?shared=1&server=wss%3A%2F%2Frooms.test%2Fsocket&name=%20Moss%20%20Friend%20'),
      ),
    ).toEqual({
      endpoint: 'wss://rooms.test/socket',
      httpEndpoint: 'https://rooms.test',
      name: 'Moss Friend',
      room: 'neighborhood',
      inviteCode: 'PAPR-22',
      intent: 'create',
    });
  });

  it('normalizes a pasted invite and distinguishes joining from creating', () => {
    expect(readSharedModeConfig(
      new URL('https://play.test/?shared=1&invite=mash47&intent=join'),
      'Fern',
    )).toMatchObject({ inviteCode: 'MASH-47', intent: 'join' });
    expect(() => readSharedModeConfig(
      new URL('https://play.test/?shared=1&invite=not-a-code&intent=join'),
    )).toThrow(/invite code/i);
  });

  it('builds share and solo URLs without leaking internal room ids', () => {
    const current = new URL('https://play.test/world?server=wss%3A%2F%2Frooms.test&old=1');
    expect(buildSharedPlayUrl(current, {
      inviteCode: 'MASH-47', intent: 'join', name: 'Fern',
    }).toString()).toBe(
      'https://play.test/world?server=wss%3A%2F%2Frooms.test&old=1&shared=1&invite=MASH-47&intent=join&name=Fern',
    );
    expect(buildSoloUrl(new URL(
      'https://play.test/world?shared=1&invite=MASH-47&intent=join&name=Fern&server=wss%3A%2F%2Frooms.test&old=1',
    )).toString()).toBe(
      'https://play.test/world?server=wss%3A%2F%2Frooms.test&old=1',
    );
  });

  it('generates a readable code from the non-ambiguous alphabet', () => {
    const values = [0, 1, 2, 3, 4, 5];
    expect(generateInviteCode((max) => values.shift()! % max)).toBe('ABCD-67');
    expect(sanitizeInviteCode(' abcd 67 ')).toBe('ABCD-67');
    expect(sanitizeInviteCode('ABCI-67')).toBeNull();
  });

  it('rejects a non-WebSocket server address', () => {
    expect(() =>
      readSharedModeConfig(new URL('https://play.test/?shared=1&server=https%3A%2F%2Frooms.test')),
    ).toThrow(/ws:\/\//);
  });

  it('maps ws and wss addresses to the account endpoint origin', () => {
    expect(httpEndpointForWebSocket('ws://localhost:2567/socket?q=1')).toBe('http://localhost:2567');
    expect(httpEndpointForWebSocket('wss://rooms.test/socket')).toBe('https://rooms.test');
  });
});

describe('remote avatar references', () => {
  it('uses a recognizable paper tint and the durable drawing key', () => {
    const design = {
      id: 'rainy-snail',
      preset: 'wide',
      paper: { color: 'construction-purple' },
    } as AvatarDesign;

    expect(avatarRefForDesign(design)).toEqual({
      preset: 'wide',
      drawingKey: 'rainy-snail',
      edgeColor: '#9a83b5',
    });
  });

  it('has a useful placeholder for a player without a saved design', () => {
    expect(avatarRefForDesign(null)).toEqual({
      preset: 'medium',
      drawingKey: '',
      edgeColor: '#e8e2d0',
    });
  });
});
