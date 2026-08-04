# Tool Rail Design QA

Reference states:

- `Screenshot 2026-08-01 at 11.35.21 PM.png` — interaction mode active
- `Screenshot 2026-08-01 at 11.35.32 PM.png` — shovel mode active

Implementation captures use a 1440 × 1264 viewport and the same 284 px left-edge crop as the references. The final side-by-side comparison is `.qa/compare-both-final.png`.

## Checks

- P0 — blockers, broken layout, or unusable controls: none
- P1 — wrong tool state, missing artwork, or major geometry mismatch: none
- P2 — visible spacing, scale, state, or layering mismatch: none
- P3 — intentional differences: the live game world remains visible through the dark blurred rail; the supplied shovel artwork replaces the rough mockup placement exactly enough for runtime use
- Interaction mode, locked-tool feedback, custom cursor asset loading, and browser console errors were checked in the running game.
- `npm test` and `npm run build` pass.

final result: passed
