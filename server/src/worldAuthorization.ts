import type { AdminConfig } from './admin';
import type { PaprDatabase } from './database';

type Dependencies = {
  database: Pick<PaprDatabase, 'authorizeWorldEntry'> | null;
  clerk: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>;
  verifyToken: (
    token: string,
    config: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>,
  ) => Promise<string>;
};

/** Resolve a short-lived identity token to an account with explicit world access. */
export async function authorizeManagedWorldEntry(
  deps: Dependencies,
  worldId: string,
  sessionToken: string,
): Promise<string | null> {
  if (!deps.database || !sessionToken) return null;
  let clerkUserId: string;
  try {
    clerkUserId = await deps.verifyToken(sessionToken, deps.clerk);
  } catch {
    return null;
  }
  const entry = await deps.database.authorizeWorldEntry(clerkUserId, worldId);
  return entry?.accountId ?? null;
}
