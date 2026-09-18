/**
 * Where the Wood Mill stands. Its own tiny module so UI code (the refining
 * counter) can ask "is the player at the mill?" without importing the mill's
 * renderer — which would import the counter back.
 */
export const MILL_POSITION = { x: -94, z: 0 } as const;
