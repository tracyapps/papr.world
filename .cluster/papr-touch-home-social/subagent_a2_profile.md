# Subagent A2 — Profile & visibility contract + wire extensions

Status: complete. Purely additive. `PROTOCOL_VERSION` left at **11** (see precedent note).

Files owned/changed:
- NEW `shared/src/protocol/profile.ts` — the renderer-free profile + visibility model.
- NEW `shared/src/protocol/profile.test.ts` — 23 tests, every rule.
- EDIT `shared/src/protocol/messages.ts` — `SetProfile` message, `SetProfileIntent`, `PlayerCardInfo` extension.
- EDIT `shared/src/protocol/guests.ts` — optional note on friend requests + records.
- EDIT `shared/src/protocol/validate.ts` — `sanitizeFriendRequestMessage`, `stripControlChars` exported.
- EDIT `shared/src/protocol/constants.ts` — four new `LIMITS`.
- EDIT `shared/src/index.ts` — re-export `./protocol/profile`.

Nothing else was touched. No `three` / `colyseus` / renderer / network imports. No `URL`/DOM globals used (URLs are shape-checked by regex so a bare-ES2022 target type-checks).

---

## Exact exported API

### `shared/src/protocol/profile.ts` (new)

```ts
// Visibility
export type ProfileVisibility = 'everyone' | 'friends' | 'friends-of-friends';
export const PROFILE_VISIBILITY_LEVELS: readonly ProfileVisibility[]; // ['everyone','friends','friends-of-friends']

// Per-field audience map (additive by construction — see note)
export type ProfileField = 'bio' | 'links';
export const PROFILE_FIELDS: readonly ProfileField[];                // ['bio','links']
export type ProfileFieldVisibilities = Record<ProfileField, ProfileVisibility>;
export const DEFAULT_PROFILE_VISIBILITY: ProfileFieldVisibilities;   // { bio:'friends', links:'friends' }

// Social links
export const SOCIAL_LINK_KINDS;                                      // ['website','instagram','x','youtube','twitch','discord','other'] as const
export type SocialLinkKind;                                          // union of the above
export type ProfileSocialLink = { kind: SocialLinkKind; url: string };

// The profile
export type PlayerProfile = { bio: string; links: ProfileSocialLink[]; visibility: ProfileFieldVisibilities };
export const DEFAULT_PROFILE: PlayerProfile;                         // { bio:'', links:[], visibility:{ bio:'friends', links:'friends' } }

// Sanitizers
export function sanitizeBio(raw: unknown): string;                                        // trim, strip control, clamp bioMax; '' valid
export function sanitizeSocialUrl(raw: unknown): string | null;                            // http(s) only, no control chars, <= socialUrlMax
export function sanitizeSocialLink(raw: unknown): ProfileSocialLink | null;                // kind on allow-list + valid url
export function sanitizeSocialLinks(raw: unknown): ProfileSocialLink[];                    // drops bad entries, caps at socialLinksMax
export function profileVisibilityOrDefault(raw: unknown): ProfileFieldVisibilities;       // lenient: bad saved data -> defaults
export function sanitizeProfileVisibilityPatch(raw: unknown): Partial<ProfileFieldVisibilities> | null; // strict: bad present field -> null
export function sanitizeProfile(raw: unknown): PlayerProfile | null;                       // null only for a non-object; heals fields
export type ProfileUpdate = { bio?: string; links?: ProfileSocialLink[]; visibility?: Partial<ProfileFieldVisibilities> };
export function sanitizeProfileUpdate(raw: unknown): ProfileUpdate | null;                 // partial-safe: only named fields returned

// Relationship + viewing
export type ProfileRelationship = 'self' | 'friend' | 'friend-of-friend' | 'stranger';
export const PROFILE_RELATIONSHIPS: readonly ProfileRelationship[];                        // ['self','friend','friend-of-friend','stranger']
export function canViewProfileField(relationship: ProfileRelationship, visibility: ProfileVisibility): boolean;
export type VisibleProfile = { bio?: string; links?: ProfileSocialLink[] };
export function profileForViewer(
  profile: PlayerProfile,
  relationship: ProfileRelationship,
  options?: { hasSentRequest?: boolean },
): VisibleProfile;
```

### `shared/src/protocol/validate.ts` (added)
```ts
export function stripControlChars(text: string): string;          // was private; now exported (used by profile.ts)
export function sanitizeFriendRequestMessage(raw: unknown): string | null; // trim, strip control, clamp friendRequestMessageMax; null when empty
```

### `shared/src/protocol/messages.ts` (added / extended)
```ts
ClientMessage.SetProfile = 'set-profile'                          // client -> server intent
export type SetProfileIntent = ProfileUpdate;                     // partial profile edit
ClientPayloads[ClientMessage.SetProfile] = SetProfileIntent;      // registered
// PlayerCardInfo (server -> client) extended with optional only:
type PlayerCardInfo = { /* existing unchanged */ ; bio?: string; links?: ProfileSocialLink[]; relationship?: ProfileRelationship };
```

### `shared/src/protocol/guests.ts` (extended, optional only)
```ts
type FriendRequestIntent = { accountId: string; message?: string };
type FriendRequestRecord = { accountId: string; name: string; at: number; message?: string };
```

---

## Visibility truth table (`canViewProfileField`)

| relationship \ visibility | `everyone` | `friends` | `friends-of-friends` |
| --- | --- | --- | --- |
| `self` | ✔ | ✔ | ✔ |
| `friend` | ✔ | ✔ | ✔ |
| `friend-of-friend` | ✔ | ✘ | ✔ |
| `stranger` | ✔ | ✘ | ✘ |

Read as a widening audience: `friends` = self + friend; `friends-of-friends` = self + friend + friend-of-friend. All 12 cells are asserted in `profile.test.ts` ("implements the full relationship × visibility truth table").

### `profileForViewer`
Filters each field by the table above, omits empty fields (an empty profile yields `{}`).

**THE OWNER RULE (explicit + tested):** `options.hasSentRequest === true` → the basic fields (`bio`, `links`) are returned regardless of their visibility. Meaning documented in-file: *the profile's owner has an outstanding friend request addressed to this viewer* — asking somebody to be friends is not a blind request. Tests: `always shows the basics to someone the owner has asked to be friends` (stranger sees `{}` without it, full basics with it; `hasSentRequest:false` gets nothing extra).

---

## Exact new `LIMITS` values (`shared/src/protocol/constants.ts`)

Inside the existing `LIMITS` object (comment style matched; `friendRequestMessageMax` sits in the "Friends and guests" block, the profile three in a new "Profiles" block):

```ts
friendRequestMessageMax: 140,   // the note that may ride along with a request, in characters
bioMax: 280,                    // a player's bio, in characters
socialLinksMax: 6,              // social links one profile may carry
socialUrlMax: 200,              // longest accepted social URL
```

---

## Files changed and why

| File | Change | Why |
| --- | --- | --- |
| `profile.ts` (new) | Full model + sanitizers + visibility rules | The shape the Neon `player_profiles` columns (`bio`, `social_links`, `privacy`) will use; nothing read/wrote them before. |
| `profile.test.ts` (new) | 23 tests | Every rule unit-tested: truth table, owner rule, all sanitizers, link bounds, friend-note sanitizer. |
| `messages.ts` | Import profile types; add `SetProfile` + `SetProfileIntent` + `ClientPayloads` entry; extend `PlayerCardInfo` | Wire contract for setting a profile and for receiving a viewer-filtered card. |
| `guests.ts` | `message?` on `FriendRequestIntent` + `FriendRequestRecord` | Recipient can read the note that came with a request. |
| `validate.ts` | `sanitizeFriendRequestMessage`; export `stripControlChars` | Note sanitizer for the wire; share the control-char helper with `profile.ts`. |
| `constants.ts` | 4 new `LIMITS` | Server-enforceable bounds. |
| `index.ts` | `export * from './protocol/profile'` | Barrel already re-exports every other protocol module. |

**No import cycle:** `profile.ts` imports `{ stripControlChars }` from `./validate` (and `LIMITS` from `./constants`). `validate.ts` imports nothing from `profile.ts`, and `messages.ts`'s import of `profile.ts` is type-only — so exporting `stripControlChars` avoids a cycle cleanly, which is why the shared helper was exported rather than duplicated.

**`social_links` note for downstream (subagent B):** the DB column defaults to `'{}'::jsonb` (an object) while the wire shape is `links: ProfileSocialLink[]` (an array). The server's row↔profile mapper is the right place to reconcile that; the shared layer only defines the wire `PlayerProfile`.

---

## Verify — real output

### `npx tsc --noEmit`
```
src/game/__tmp_dep.ts(2,46): error TS2345: Argument of type '"a"' is not assignable to parameter of type 'keyof Settings'.
src/game/__tmp_mock_probe.test.ts(3,26): error TS2307: Cannot find module './touchControls' or its corresponding type declarations.
```
Both errors are in untracked `src/game/__tmp_*.ts` scratch files created by another agent at 17:10 (present in `git status` as `??`, not mine, not on the wire path). **My owned files produce zero errors.** The root tsconfig's program reaches `shared/src/protocol/profile.ts` transitively (`src/ui/multiplayerPanel.ts` → `'../../shared/src/index'`), so the new profile module *is* checked by this command.

Extra confirmation (the root `include` is only `src`, so I ran the configs that name `shared/` directly):
```
$ npx tsc -p shared/tsconfig.json --noEmit   # exit 0, no output
$ npx tsc -p server/tsconfig.json --noEmit   # exit 0, no output (server includes ../shared/src)
```

### `npx vitest run shared/`
```
 ✓ shared/src/protocol/guests.test.ts (11 tests)
 ✓ shared/src/protocol/mailValidation.test.ts (7 tests)
 ✓ shared/src/protocol/cases.test.ts (13 tests)
 ✓ shared/src/protocol/profile.test.ts (23 tests)

 Test Files  4 passed (4)
      Tests  54 passed (54)
```

---

## Additive-only / no-meaning-changed confirmation

- `PROTOCOL_VERSION` is **unchanged at 11**. Documented precedent: `docs/next-session.md:710` — the `wear-design` message "was added without a bump, deliberately: it is purely additive — no existing shape changed, older clients simply never send it, and an older server ignores it". This change is the same kind: one new client message (`set-profile`) and optional-only fields; nothing existing changed meaning, so no bump.
- **No existing wire shape's meaning changed.** Every edit is an *optional* field or a *new* member:
  - `FriendRequestIntent.message?` / `FriendRequestRecord.message?` — absent ⇒ byte-identical to before.
  - `PlayerCardInfo.bio?` / `links?` / `relationship?` — absent ⇒ byte-identical to before.
  - `ClientMessage.SetProfile` — a new key; older servers ignore an unknown intent; older clients never send it.
  - New `LIMITS` keys + new `validate` export + new barrel re-export — no existing symbol redefined.
- `git diff --stat` on the 5 edited files: **48 insertions, 2 deletions**, and both deletions are single replaced lines (`function stripControlChars` → `export function stripControlChars`; the one-line `FriendRequestIntent` declaration) — no logic removed, no field meaning altered.

## Tests written (map to rules)
`profile.test.ts` — visibility level list; `DEFAULT_PROFILE`/`DEFAULT_PROFILE_VISIBILITY`; full 12-cell truth table; visibility default-healing; every `SOCIAL_LINK_KINDS` accepted; unknown kind / non-http(s) / spaces refused; control-character URLs **refused not cleaned**; URL + list caps from `LIMITS`; malformed link entries dropped; bio trim/strip/clamp; `sanitizeProfile` null-vs-heal; `sanitizeProfileUpdate` single-field / link-dropping / invalid-field-refusal / unknown-key-ignore; `profileForViewer` for friend, friend-of-friend, stranger, owner-empty, and the owner `hasSentRequest` rule; `sanitizeFriendRequestMessage` bounds + empty→null.
