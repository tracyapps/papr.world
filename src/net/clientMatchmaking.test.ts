import { describe, expect, it, vi } from 'vitest';
import { MatchMakeError, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION, type JoinOptions } from '../../shared/src/index';
import { enterNeighborhoodRoom } from './client';

const options: JoinOptions = {
  protocol: PROTOCOL_VERSION,
  name: 'Wren',
  avatar: { preset: 'medium', drawingKey: '', edgeColor: '#ffffff' },
  inviteCode: 'TRUE-65',
  intent: 'join',
};

describe('neighborhood matchmaking', () => {
  it('reopens a persisted neighborhood after its live room has emptied', async () => {
    const reopened = {} as Room;
    const client = {
      join: vi.fn().mockRejectedValue(new MatchMakeError('no rooms found', 521)),
      joinOrCreate: vi.fn().mockResolvedValue(reopened),
    };

    await expect(enterNeighborhoodRoom(client, 'neighborhood', options)).resolves.toBe(reopened);
    expect(client.join).toHaveBeenCalledWith('neighborhood', options);
    expect(client.joinOrCreate).toHaveBeenCalledWith('neighborhood', options);
  });

  it('does not disguise authentication or transport failures as an empty room', async () => {
    const failure = new MatchMakeError('authentication failed', 525);
    const client = {
      join: vi.fn().mockRejectedValue(failure),
      joinOrCreate: vi.fn(),
    };

    await expect(enterNeighborhoodRoom(client, 'neighborhood', options)).rejects.toBe(failure);
    expect(client.joinOrCreate).not.toHaveBeenCalled();
  });

  it('does not perform a failing lookup when opening a new neighborhood', async () => {
    const opened = {} as Room;
    const client = {
      join: vi.fn(),
      joinOrCreate: vi.fn().mockResolvedValue(opened),
    };

    await expect(enterNeighborhoodRoom(client, 'neighborhood', {
      ...options, intent: 'create',
    })).resolves.toBe(opened);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.joinOrCreate).toHaveBeenCalledOnce();
  });
});
