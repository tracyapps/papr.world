#!/usr/bin/env node
// Stylesheet invariants, checked at build time.
//
// The bug this guards: `.tool-slot-art` was rewritten to take its width from
// a custom property, but the edit left the original `width: 116px` further
// down the same rule. CSS keeps the last declaration, so every tool rendered
// at the fallback size and the hoe and shovel both shrank — a silent
// regression with no error anywhere, findable only by looking at the screen.
//
// A property declared twice in one rule is almost always an editing accident.
//
// This lives here rather than in vitest because vitest's CSS handling returns
// an empty string for `.css` imports (with `?raw` and via `import.meta.glob`
// alike), and the project has no `@types/node` for `fs` inside a test. The
// existing `validate-conversations.mjs` already establishes the pattern of a
// plain-Node checker wired into `npm run build`.

import { readFile } from 'node:fs/promises';

const cssUrl = new URL('../src/styles.css', import.meta.url);
const errors = [];

let css;
try {
  css = await readFile(cssUrl, 'utf8');
} catch (error) {
  console.error(`styles.css could not be read: ${error.message}`);
  process.exit(1);
}

/**
 * Rules as `[selector, body]`, including those nested inside at-rules.
 *
 * A brace-depth scanner rather than a regex. A flat
 * `/([^{}]*)\{([^{}]*)\}/` pairs an `@media`'s opening brace with the first
 * inner rule's closing brace, desynchronising everything after it — an
 * earlier attempt at this check "passed" only because it silently stopped
 * seeing most of the stylesheet.
 */
function rules(source) {
  // Comments can contain braces; strip them before counting.
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const stack = [];

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '{') {
      stack.push(index);
      continue;
    }
    if (character !== '}') continue;

    const open = stack.pop();
    if (open === undefined) continue;

    const previousOpen = clean.lastIndexOf('{', open - 1);
    const previousClose = clean.lastIndexOf('}', open - 1);
    const selector = clean.slice(Math.max(previousOpen, previousClose) + 1, open).trim();

    // An at-rule's body holds more rules, not declarations. Skip it; the
    // scanner reports the rules nested inside it on their own.
    if (!selector || selector.startsWith('@')) continue;
    found.push([selector, clean.slice(open + 1, index)]);
  }
  return found;
}

const parsed = rules(css);

if (parsed.length < 20) {
  errors.push(`Only ${parsed.length} rules parsed — the scanner is probably broken, not the stylesheet.`);
}

for (const [selector, body] of parsed) {
  const counts = new Map();
  for (const declaration of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) {
    const property = declaration[1];
    // Custom properties are sometimes redeclared deliberately to re-scope.
    if (property.startsWith('--')) continue;
    counts.set(property, (counts.get(property) ?? 0) + 1);
  }
  for (const [property, count] of counts) {
    if (count > 1) errors.push(`${selector} declares "${property}" ${count} times`);
  }
}

// Specifically the regression above: a bare width here silently renders every
// tool at the fallback size.
const toolArt = parsed.find(([selector]) => selector === '.tool-slot-art');
if (!toolArt) {
  errors.push('.tool-slot-art rule not found');
} else {
  if (!toolArt[1].includes('var(--art-width')) {
    errors.push('.tool-slot-art must size from var(--art-width)');
  }
  if (/(?:^|;)\s*width\s*:\s*\d/.test(toolArt[1])) {
    errors.push('.tool-slot-art has a hardcoded width that shadows var(--art-width)');
  }
}

// A custom property set on an element is inherited by its children, so a
// `var(--x, fallback)` in a descendant never falls back — it picks up the
// ancestor's value. When the ancestor's value is a pointer position in pixels
// and the descendant expected a percentage hotspot, the drawn cursor ends up at
// double the real pointer: correct in the top-left, flung off-screen near the
// centre. That shipped, and made the game effectively unclickable.
//
// The rule this enforces: a variable used for *positioning* an element must not
// share a name with one used for offsetting its contents.
const cursorPosition = parsed.find(([selector]) => selector === '.game-cursor');
const cursorImage = parsed.filter(([selector]) => /^\.game-cursor.*\bimg$/.test(selector));

if (!cursorPosition) {
  errors.push('.game-cursor rule not found');
} else if (!/--cursor-x\s*:/.test(cursorPosition[1])) {
  errors.push('.game-cursor should define --cursor-x for its own position');
}
if (cursorImage.length === 0) {
  errors.push('no .game-cursor img rules found');
}
for (const [selector, body] of cursorImage) {
  if (/var\(\s*--cursor-[xy]/.test(body) || /--cursor-[xy]\s*:/.test(body)) {
    errors.push(
      `${selector} uses --cursor-x/--cursor-y, which it inherits from .game-cursor `
      + 'as a pixel position — use --hotspot-x/--hotspot-y',
    );
  }
}

if (errors.length > 0) {
  console.error('\nStylesheet problems:\n');
  for (const error of errors) console.error(`  ✗ ${error}`);
  console.error('');
  process.exit(1);
}

console.log(`Stylesheet looks good: ${parsed.length} rules, no shadowed declarations.`);
