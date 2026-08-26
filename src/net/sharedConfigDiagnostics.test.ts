// The two misconfigurations that actually happen on a first deploy, and the
// messages they now produce. These exist because "neighborhood could not be
// opened" sent a real person looking at their invite code for an hour.

import { describe, expect, it } from 'vitest';
import { readSharedModeConfig } from './sharedConfig';

const shared = (base: string) =>
  new URL(`${base}/play/?shared=1&invite=TRUE-65&intent=create`);

describe('shared mode endpoint diagnostics', () => {
  it('refuses to fall back to localhost on a deployed https page', () => {
    // VITE_SHARED_WS_ENDPOINT unset, so the fallback is ws://localhost:2567 —
    // which can never work from a real domain.
    expect(() => readSharedModeConfig(shared('https://papr.world')))
      .toThrow(/REDEPLOY/);
    expect(() => readSharedModeConfig(shared('https://papr.world')))
      .toThrow(/VITE_SHARED_WS_ENDPOINT/);
  });

  it('names mixed content rather than blaming the neighborhood', () => {
    const url = shared('https://papr.world');
    url.searchParams.set('server', 'ws://some-host.up.railway.app');
    expect(() => readSharedModeConfig(url)).toThrow(/cannot open an insecure ws:\/\//);
  });

  it('tells you to use wss when an https address was pasted in', () => {
    const url = shared('https://papr.world');
    url.searchParams.set('server', 'https://some-host.up.railway.app');
    expect(() => readSharedModeConfig(url)).toThrow(/change it to wss/);
  });

  it('still works locally, where the localhost fallback is correct', () => {
    const config = readSharedModeConfig(shared('http://localhost:5173'));
    expect(config?.endpoint).toBe('ws://localhost:2567');
    expect(config?.inviteCode).toBe('TRUE-65');
  });

  it('accepts a proper wss address', () => {
    const url = shared('https://papr.world');
    url.searchParams.set('server', 'wss://some-host.up.railway.app');
    const config = readSharedModeConfig(url);
    expect(config?.endpoint).toBe('wss://some-host.up.railway.app');
    expect(config?.httpEndpoint).toBe('https://some-host.up.railway.app');
  });
});
