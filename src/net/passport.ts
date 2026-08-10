// Paper passport — the client half of durable identity.
//
// A passport is a pseudonymous account: an id + secret minted by the server
// (POST /account), held in localStorage. No email, no PII. It is what makes
// "made by wren" and mailed harvests survive disconnects and restarts.
//
// Renderer-free and not imported by main.ts yet, like the rest of src/net/.
//
// The secret is shown to the server only over the join handshake; treat the
// stored copy like a save file. A future "claim your passport" flow attaches
// email/passkey recovery WITHOUT changing the id (communal-multiplayer.md §2.1).

import type { AccountCredentials } from '../../shared/src/index';

const STORAGE_KEY = 'pp.passport.v1';

type StoredPassport = AccountCredentials & { createdAt: number };

/** The passport already on this device, or null. Never mints. */
export function loadPassport(): AccountCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPassport>;
    if (typeof parsed.id !== 'string' || typeof parsed.secret !== 'string') return null;
    return { id: parsed.id, secret: parsed.secret };
  } catch {
    return null;
  }
}

/**
 * Get this device's passport, minting one from the server if needed.
 *
 * `httpEndpoint` is the server's HTTP base — e.g. "http://localhost:2567"
 * locally or "https://<your-host>" deployed (the ws:// endpoint with the
 * scheme swapped).
 */
export async function getOrCreatePassport(
  httpEndpoint: string,
  name: string,
): Promise<AccountCredentials> {
  const existing = loadPassport();
  if (existing) return existing;

  const response = await fetch(`${httpEndpoint}/account`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`passport mint failed: ${response.status}`);
  const data = (await response.json()) as { accountId?: string; secret?: string };
  if (typeof data.accountId !== 'string' || typeof data.secret !== 'string') {
    throw new Error('passport mint failed: malformed response');
  }

  const passport: StoredPassport = {
    id: data.accountId,
    secret: data.secret,
    createdAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(passport));
  return { id: passport.id, secret: passport.secret };
}

/** Forget this device's passport (a durable one is unrecoverable — warn first). */
export function clearPassport(): void {
  localStorage.removeItem(STORAGE_KEY);
}
