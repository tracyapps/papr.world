export type DevicePassport = { id: string; secret: string };

export const PASSPORT_STORAGE_KEY = 'pp.passport.v1';

/** Parse only the credential pair; timestamps and unknown fields never cross the API. */
export function parseDevicePassport(raw: string | null): DevicePassport | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DevicePassport>;
    if (typeof value.id !== 'string' || typeof value.secret !== 'string') return null;
    const id = value.id.trim();
    const secret = value.secret.trim();
    if (id.length < 8 || id.length > 64 || secret.length < 16 || secret.length > 128) return null;
    return { id, secret };
  } catch {
    return null;
  }
}

export function loadDevicePassport(storage: Pick<Storage, 'getItem'>): DevicePassport | null {
  try {
    return parseDevicePassport(storage.getItem(PASSPORT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Store only a validated credential pair and report browser-storage failures. */
export function saveDevicePassport(
  storage: Pick<Storage, 'setItem'>,
  passport: DevicePassport,
): boolean {
  const validated = parseDevicePassport(JSON.stringify(passport));
  if (!validated) return false;
  try {
    storage.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}
