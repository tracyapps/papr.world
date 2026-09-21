import { describe, expect, it, vi } from 'vitest';
import { wireRemotePlayer } from './client';

describe('remote avatar changes', () => {
  it('listens to the nested avatar schema and republishes the complete player look', () => {
    const raw = {
      accountId: 'acct-purple',
      name: 'Purple pal',
      x: 2,
      z: 3,
      facing: 0,
      page: '0,0',
      inside: '',
      avatar: { preset: 'medium', drawingKey: '', edgeColor: '#3a3226' },
    };
    const changes = new Map<object, () => void>();
    const bind = (target: object) => ({
      onChange: (callback: () => void) => { changes.set(target, callback); },
    });
    const joined = vi.fn();
    const avatarChanged = vi.fn();

    wireRemotePlayer(raw, 'session-purple', bind, { push: vi.fn() }, {
      onPlayerJoin: joined,
      onPlayerAvatar: avatarChanged,
    });

    expect(joined).toHaveBeenCalledWith(expect.objectContaining({
      avatar: expect.objectContaining({ drawingKey: '' }),
    }));
    raw.avatar.drawingKey = 'purple-monster';
    raw.avatar.edgeColor = '#8b62a8';
    changes.get(raw.avatar)?.();
    expect(avatarChanged).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acct-purple',
      avatar: { preset: 'medium', drawingKey: 'purple-monster', edgeColor: '#8b62a8' },
    }));
  });
});
