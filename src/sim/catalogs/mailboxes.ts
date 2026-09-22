// The 16 mailbox rigs built in src/game/mailbox/{designs.animals,designs.objects}.ts,
// listed here so save data and the Home panel's picker can validate a style
// id without this renderer-free layer importing Three.js — same split as
// dwelling parts (catalogs/dwellings.ts) and recipe ids elsewhere. Keep this
// list in sync with those two files' `id` fields; an id here with no
// matching design just falls back to the default rig at draw time, so a
// mismatch is silent rather than a crash.

export const MAILBOX_STYLE_IDS = [
  // Objects & scenes (designs.objects.ts)
  'classic-flag',
  'football-helmet',
  'racecar',
  'bubble-screen',
  'sewing-machine',
  'time-box',
  'pepperpot',
  'rainbow-arch',
  'coffee-cup',
  'camp-tent',
  'mountain-range',
  // Animals (designs.animals.ts)
  'dog',
  'cat',
  'horse',
  'raccoon',
  'bird',
] as const;

export type MailboxStyleId = (typeof MAILBOX_STYLE_IDS)[number];

export function isMailboxStyleId(value: unknown): value is MailboxStyleId {
  return typeof value === 'string' && (MAILBOX_STYLE_IDS as readonly string[]).includes(value);
}
