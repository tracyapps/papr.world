import { PROTOCOL_VERSION } from './constants';

export const ALPHA_FEEDBACK_VERSION = 1 as const;
export const MAX_FEEDBACK_SCREENSHOT_BYTES = 350_000;
export const ALPHA_FEEDBACK_STATUSES = [
  'new', 'reviewing', 'needs-info', 'resolved', 'duplicate',
] as const;

export type AlphaFeedbackCategory = 'bug' | 'improvement' | 'idea' | 'other';
export type AlphaFeedbackReproducibility = 'once' | 'sometimes' | 'always' | 'unknown';
export type AlphaFeedbackStatus = typeof ALPHA_FEEDBACK_STATUSES[number];

export type AlphaFeedback = {
  version: typeof ALPHA_FEEDBACK_VERSION;
  id: string;
  category: AlphaFeedbackCategory;
  summary: string;
  details: string;
  expected?: string;
  reproducibility?: AlphaFeedbackReproducibility;
  screenshotId?: string;
  context: {
    clientBuild: string;
    protocolVersion: number;
    mode: 'solo' | 'shared';
    roomId?: string;
    accountId?: string;
    pageId: string;
    biome: string;
    x: number;
    z: number;
    browser: string;
    platform: string;
    recentGameEvents: string[];
  };
  createdAt: number;
};

export type AlphaFeedbackReviewRecord = {
  submission: AlphaFeedback;
  status: AlphaFeedbackStatus;
  receivedAt: number;
  auditNotes: Array<{ at: number; note: string }>;
};

const CATEGORIES = new Set<AlphaFeedbackCategory>(['bug', 'improvement', 'idea', 'other']);
const REPRODUCIBILITY = new Set<AlphaFeedbackReproducibility>([
  'once', 'sometimes', 'always', 'unknown',
]);

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function optionalText(value: unknown, max: number): string | undefined {
  const cleaned = cleanText(value, max);
  return cleaned || undefined;
}

/**
 * The only server-accepted feedback shape. This intentionally picks known
 * fields rather than spreading caller data, so secrets, saves, chat, or
 * drawings cannot hitch a ride in an otherwise valid request.
 */
export function sanitizeAlphaFeedback(value: unknown): AlphaFeedback | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawContext = raw.context;
  if (!rawContext || typeof rawContext !== 'object') return null;
  const context = rawContext as Record<string, unknown>;

  const id = cleanText(raw.id, 128);
  const category = raw.category as AlphaFeedbackCategory;
  const summary = cleanText(raw.summary, 120);
  const details = cleanText(raw.details, 4000);
  const clientBuild = cleanText(context.clientBuild, 80);
  const pageId = cleanText(context.pageId, 64);
  const biome = cleanText(context.biome, 32);
  const browser = cleanText(context.browser, 80);
  const platform = cleanText(context.platform, 80);
  const x = Number(context.x);
  const z = Number(context.z);
  const createdAt = Number(raw.createdAt);
  const protocolVersion = Number(context.protocolVersion);
  if (
    raw.version !== ALPHA_FEEDBACK_VERSION || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
    !CATEGORIES.has(category) ||
    !summary || !details || !clientBuild || !pageId || !biome || !browser || !platform ||
    !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(createdAt) ||
    !Number.isInteger(protocolVersion) || protocolVersion !== PROTOCOL_VERSION ||
    (context.mode !== 'solo' && context.mode !== 'shared')
  ) return null;

  const reproducibility = raw.reproducibility as AlphaFeedbackReproducibility | undefined;
  if (reproducibility !== undefined && !REPRODUCIBILITY.has(reproducibility)) return null;
  const recentGameEvents = Array.isArray(context.recentGameEvents)
    ? context.recentGameEvents.slice(-10).map((event) => cleanText(event, 100)).filter(Boolean)
    : [];

  return {
    version: ALPHA_FEEDBACK_VERSION,
    id,
    category,
    summary,
    details,
    ...(optionalText(raw.expected, 1500) ? { expected: optionalText(raw.expected, 1500) } : {}),
    ...(reproducibility ? { reproducibility } : {}),
    ...(typeof raw.screenshotId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(raw.screenshotId)
      ? { screenshotId: raw.screenshotId }
      : {}),
    context: {
      clientBuild,
      protocolVersion,
      mode: context.mode,
      ...(optionalText(context.roomId, 64) ? { roomId: optionalText(context.roomId, 64) } : {}),
      ...(optionalText(context.accountId, 128)
        ? { accountId: optionalText(context.accountId, 128) }
        : {}),
      pageId,
      biome,
      x,
      z,
      browser,
      platform,
      recentGameEvents,
    },
    createdAt,
  };
}
