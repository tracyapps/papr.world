import type { MailboxLookState } from './state';
import { isMailboxStyleId } from './catalogs/mailboxes';
import {
  DEFAULT_MAILBOX_PRIMARY,
  DEFAULT_MAILBOX_SECONDARY,
  DEFAULT_MAILBOX_STYLE,
  sanitizeMailboxColor,
  sanitizeMailboxStyle,
} from '../../shared/src/index';

// The mailbox's plain state-shape helpers. Kept apart from `state.ts` for the
// same reason as `dwellingState.ts`: so it can build and clean a saved
// mailbox look without state.ts growing any bigger. Renderer-free — the
// actual rigs live in game/mailbox/*.ts and are looked up by style id.

export function createMailboxLook(): MailboxLookState {
  return { style: DEFAULT_MAILBOX_STYLE, primary: DEFAULT_MAILBOX_PRIMARY, secondary: DEFAULT_MAILBOX_SECONDARY };
}

/** Load-time cleanup: a save can only hold a style this build actually has a rig for. */
export function sanitizeMailboxLook(raw: unknown): MailboxLookState {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const style = sanitizeMailboxStyle(value.style, DEFAULT_MAILBOX_STYLE);
  return {
    style: isMailboxStyleId(style) ? style : DEFAULT_MAILBOX_STYLE,
    primary: sanitizeMailboxColor(value.primary, DEFAULT_MAILBOX_PRIMARY),
    secondary: sanitizeMailboxColor(value.secondary, DEFAULT_MAILBOX_SECONDARY),
  };
}
