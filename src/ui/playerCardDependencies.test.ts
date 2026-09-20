import { describe, expect, it } from 'vitest';

// The player card and the shared session used to import each other.
//
// `sharedSession` imports the card for `handlePlayerCardResponse`, and the card
// had started importing `blockAccount`/`reportAccount` back from it. That is a
// cycle, and it only worked because `main.ts` happened to evaluate the session
// first (through an unrelated import). Evaluated the other way round, the
// session's top-level `setPlayerCardRequestHandler(...)` assign hit a
// not-yet-initialised `let` and the game died at boot with
// "Cannot access 'requestCardHandler' before initialization".
//
// The fix was to remove the edge, not to pin the order: the card now takes both
// of its outgoing calls as injected handlers
// (`setPlayerCardRequestHandler`, `setPlayerCardSafetyHandlers`). This test is
// the tripwire that keeps it that way, because the failure it prevents shows up
// as an unexplained boot crash rather than a type error.
//
// The source is read through Vite's own raw glob rather than `node:fs`: the
// root tsconfig carries only `vite/client` types, so a `node:` import would not
// typecheck in `src/`.
const sources = import.meta.glob('./playerCard.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('the player card depends on the shared session one way only', () => {
  it('never imports the shared session back', () => {
    const source = sources['./playerCard.ts'];
    expect(source).toBeTruthy();
    expect(source).not.toMatch(/from '\.\.\/net\/sharedSession'/);
  });
});
