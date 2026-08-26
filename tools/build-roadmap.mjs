#!/usr/bin/env node
/**
 * Turns docs/roadmap.md into structured data for the public site.
 *
 * Same principle as build-reference.mjs next door: the site does not keep a
 * second copy of the roadmap, it renders the real one. Move an item to ✅ in
 * docs/roadmap.md and the homepage trail and the /roadmap page both change on
 * the next deploy. There is no step where anyone retypes a status.
 *
 * ── What it reads ────────────────────────────────────────────────────────
 *   ## Phase 3 — Economy, shops, mail          → a phase
 *   ## Parallel lane — Multiplayer …           → also a phase (kind: 'lane')
 *   ### 3.4 The owl-itect … — **M**            → an item inside it
 *   ### MP.3 Invite-only alpha shell — 🚧 …    → an item, currently underway
 *
 * Status comes from the marker in the heading:
 *   ✅ done      🚧 active      ◐ partial      (nothing) planned
 * Size comes from **S** / **M** / **L** / **XL**.
 *
 * ── Steering what the public sees ────────────────────────────────────────
 * Drop an HTML comment on the line after any heading in roadmap.md:
 *
 *   <!-- site: hide -->                     keep this out of the site entirely
 *   <!-- site: pin -->                      feature it on the homepage trail
 *   <!-- site: title: A friendlier name -->  public title, roadmap keeps its own
 *   <!-- site: summary: One warm sentence. --> public blurb, instead of the
 *                                              first paragraph
 *
 * None of them are required. With no comments at all this still produces a
 * good page — the comments exist so you can be warmer in public than you need
 * to be in your own planning doc.
 *
 * Run: node tools/build-roadmap.mjs   →   site/src/data/roadmap.json
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const SOURCE = new URL('../docs/roadmap.md', import.meta.url);
const OUT = new URL('../site/src/data/roadmap.json', import.meta.url);

/** Sections that are planning scaffolding, not public content. */
const META_SECTIONS = new Set([
  'how to use this',
  'decisions still owed',
]);

const STATUS = [
  { mark: '✅', status: 'done' },
  { mark: '🚧', status: 'active' },
  { mark: '◐', status: 'partial' },
];

/** Markdown → the plain words underneath it. */
function plain(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // links keep their label
    .replace(/`([^`]+)`/g, '$1')               // code marks are internal noise
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first paragraph, cleaned up for a stranger.
 *
 * Internal blurbs habitually open with "Depends on 3.3." — true, useful to
 * the author, and meaningless to a visitor. Those openers are dropped, along
 * with the "Amended 2026-08-25:" housekeeping notes.
 */
function summarise(body) {
  // Only the prose above the first sub-heading belongs to this section.
  const own = body.split(/^### /m)[0];

  const paragraph = own
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) =>
      p
      && !p.startsWith('|')          // a table
      && !p.startsWith('#')          // a heading
      && !p.startsWith('<!--')       // a site: directive
      && !p.startsWith('```')        // a code block
      && !/^[-*]\s/.test(p)          // a bullet list
      && !/^\d+\.\s/.test(p)        // a numbered list
      && !/^\*\*Amended/i.test(p)); // housekeeping

  if (!paragraph) return '';

  // "Depends on 3.1. Every player gets a mailbox…" → drop the dependency
  // clause. Non-greedy up to the first full stop that is actually the end of
  // a sentence, so the "3.1" in the middle of it survives being read.
  let text = plain(paragraph)
    .replace(/^(?:Depends on|Wants) .*?\.\s+(?=[A-Z])/i, '');

  // Split on sentence ends only where a space and a new capital follow, so
  // "MP.3", "Colyseus 0.17" and "player.chips" survive intact.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"\u201C(])/);
  if (sentences.length > 2) text = sentences.slice(0, 2).join(' ').trim();

  return text;
}

/**
 * Read the <!-- site: … --> directives sitting under a heading.
 *
 * `own` matters: a phase must only see its own directives, not the ones
 * belonging to the items nested inside it.
 */
function directives(text) {
  const body = text.split(/^### /m)[0];
  const out = { hidden: false, pinned: false, title: null, summary: null };
  for (const [, raw] of body.matchAll(/<!--\s*site:\s*([\s\S]*?)\s*-->/g)) {
    const value = raw.trim();
    if (value === 'hide') out.hidden = true;
    else if (value === 'pin') out.pinned = true;
    else if (value.startsWith('title:')) out.title = value.slice(6).trim();
    else if (value.startsWith('summary:')) out.summary = value.slice(8).trim();
  }
  return out;
}

function readHeading(text) {
  let status = 'planned';
  for (const entry of STATUS) {
    if (text.includes(entry.mark)) { status = entry.status; break; }
  }

  const size = text.match(/\*\*(XL|S|M|L)\*\*/)?.[1] ?? null;
  const completed = text.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1] ?? null;

  // Strip every marker off the end so only the name is left.
  let title = text
    .replace(/—\s*[✅🚧◐][\s\S]*$/u, '')
    .replace(/—\s*\*\*(XL|S|M|L|DONE)\*\*[\s\S]*$/, '')
    .replace(/[✅🚧◐]/gu, '')
    .trim()
    .replace(/\s*—\s*$/, '');

  return { title: plain(title), status, size, completed };
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ── Parse ─────────────────────────────────────────────────────────────────

const markdown = await readFile(SOURCE, 'utf8');
const sourceStat = await stat(SOURCE);

/** Split on ## headings, keeping each heading with the body that follows. */
function sections(text, level) {
  const pattern = new RegExp(`^#{${level}} (.+)$`, 'gm');
  const found = [...text.matchAll(pattern)];
  return found.map((match, index) => ({
    heading: match[1].trim(),
    body: text.slice(match.index + match[0].length, found[index + 1]?.index ?? text.length),
  }));
}

const phases = [];
let parked = [];
let focus = null;

for (const section of sections(markdown, 2)) {
  const name = plain(section.heading).toLowerCase();

  if (META_SECTIONS.has(name)) continue;

  if (name === 'parking lot') {
    // A markdown table: | Idea | Parked because |
    parked = [...section.body.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)]
      .map(([, idea, because]) => ({ idea: plain(idea), because: plain(because) }))
      .filter((row) => row.idea && !/^-+$/.test(row.idea) && row.idea.toLowerCase() !== 'idea');
    continue;
  }

  if (name === 'if you only do one thing') {
    focus = summarise(section.body);
    continue;
  }

  const meta = directives(section.body);   // only the phase's own directives
  if (meta.hidden) continue;

  const head = readHeading(section.heading);
  const isLane = /^parallel lane/i.test(head.title);
  const number = head.title.match(/^Phase (\d+)/)?.[1] ?? null;

  // "Phase 3 — Economy, shops, mail" → "Economy, shops, mail"
  const title = meta.title
    ?? head.title.replace(/^Phase \d+\s*—\s*/, '').replace(/^Parallel lane\s*—\s*/, '');

  const items = sections(section.body, 3)
    .map((entry) => {
      const itemMeta = directives(entry.body);
      if (itemMeta.hidden) return null;

      const itemHead = readHeading(entry.heading);
      // "3.4 The owl-itect" → ref "3.4", name "The owl-itect"
      const refMatch = itemHead.title.match(/^((?:MP\.)?[\d.]+)\s+(.*)$/);

      return {
        id: slug(itemHead.title),
        ref: refMatch?.[1] ?? null,
        title: itemMeta.title ?? refMatch?.[2] ?? itemHead.title,
        status: itemHead.status,
        size: itemHead.size,
        completed: itemHead.completed,
        summary: itemMeta.summary ?? summarise(entry.body),
        pinned: itemMeta.pinned,
      };
    })
    .filter(Boolean);

  // A phase is done when it says so, active when something inside it is
  // underway, started when some of it has landed, and planned otherwise.
  const declaredDone = /\*\*DONE\*\*/.test(section.heading);
  const done = items.filter((i) => i.status === 'done').length;
  const status = declaredDone || (items.length > 0 && done === items.length)
    ? 'done'
    : items.some((i) => i.status === 'active')
      ? 'active'
      : done > 0
        ? 'started'
        : 'planned';

  phases.push({
    id: slug(head.title),
    kind: isLane ? 'lane' : 'phase',
    number,
    title,
    status,
    pinned: meta.pinned,
    intro: meta.summary ?? summarise(section.body),
    items,
    counts: { done, total: items.length },
  });
}

const roadmap = {
  generatedAt: new Date().toISOString(),
  sourceUpdated: sourceStat.mtime.toISOString(),
  focus,
  phases,
  parked,
};

await mkdir(dirname(fileURLToPath(OUT)), { recursive: true });
await writeFile(OUT, JSON.stringify(roadmap, null, 2));

const active = phases.filter((p) => p.status === 'active').map((p) => p.title);
console.log(
  `Roadmap built: ${phases.length} phases, ` +
  `${phases.reduce((n, p) => n + p.items.length, 0)} items, ` +
  `${parked.length} parked. Currently active: ${active.join(', ') || 'nothing marked 🚧'}.`,
);
