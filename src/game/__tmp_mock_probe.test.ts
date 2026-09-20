// SCRATCH FILE — safe to delete.
//
// Created on 2026-09-20 while probing how vitest treats a factory mock that
// omits a named export (`input.ts` now imports the pure pinch math from
// touchControls.ts, which imports `onSettingsChanged` alongside `getSetting`).
// The `rm` that should have removed it was refused by the sandbox's safety
// guard, so it is left here, inert, rather than deleted by another route.
import { it } from 'vitest';

it.skip('scratch probe — delete this file', () => {});
