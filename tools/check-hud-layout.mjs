#!/usr/bin/env node
// HUD layout regression check.
//
// Measures every fixed overlay in the running game at a range of viewport
// sizes and fails if any two overlap. This exists because the HUD collisions
// it guards against were invisible in code review — the places panel and the
// harvest toast were both simply "right:16, top:190" in two different files,
// and nothing connected them.
//
// Usage:
//   npm run dev            # in one terminal
//   node tools/check-hud-layout.mjs
//
// Options:
//   --url=http://localhost:5173   dev server (default)
//   --shots                       also write PNGs to .qa/hud-layout/
//
// Exits non-zero on any overlap, so it can gate a commit.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const URL = args.get('url') ?? 'http://localhost:5173';
const WRITE_SHOTS = args.has('shots');
const SHOT_DIR = '.qa/hud-layout';

/** Viewports chosen around the sizes where the old layout broke.
 *  713–815 tall is the band where the open scrapbook cover used to bury
 *  tool slot 3; 650/700 are the small-viewport breakpoint edges. */
const VIEWPORTS = [
  { name: '1440x900-laptop', width: 1440, height: 900 },
  { name: '1440x780-laptop-chrome', width: 1440, height: 780 },
  { name: '1280x720-small', width: 1280, height: 720 },
  { name: '1512x982-mbp14', width: 1512, height: 982 },
  { name: '1920x1080-desktop', width: 1920, height: 1080 },
  { name: '1024x680-narrow', width: 1024, height: 680 },
  { name: '2560x1440-large', width: 2560, height: 1440 },
];

/** Overlays that must never intersect each other.
 *  Grouped so members of the same group are allowed to touch. */
const TRACKED = [
  { selector: '.tool-toolbar-slots', label: 'tool rail slots', group: 'rail' },
  { selector: '#mini-map-widget', label: 'minimap', group: 'widgets' },
  { selector: '#compass-widget', label: 'compass', group: 'widgets' },
  { selector: '.region-banner', label: 'region banner', group: 'banner' },
  { selector: '.hud-toast-stack', label: 'toast stack', group: 'toasts' },
  { selector: '.scrapbook-cover', label: 'scrapbook cover', group: 'dock' },
  { selector: '.scrapbook-strip', label: 'scrapbook strip', group: 'dock' },
  { selector: '.hud', label: 'status chip', group: 'status' },
  { selector: '#hud-actions', label: 'help + settings icons', group: 'actions' },
];

/** Ignore sub-pixel kisses; flag anything a player would actually see. */
const OVERLAP_TOLERANCE = 4;

function intersection(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= OVERLAP_TOLERANCE || height <= OVERLAP_TOLERANCE) return null;
  return { width: Math.round(width), height: Math.round(height) };
}

async function measure(page) {
  return page.evaluate((tracked) => tracked.flatMap((entry) => {
    const element = document.querySelector(entry.selector);
    if (!element) return [];
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    // Invisible or collapsed elements can't collide with anything.
    if (rect.width < 1 || rect.height < 1) return [];
    if (style.display === 'none' || style.visibility === 'hidden') return [];
    if (Number(style.opacity) === 0) return [];
    return [{
      ...entry,
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    }];
  }), TRACKED);
}

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];

  if (WRITE_SHOTS) await mkdir(SHOT_DIR, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // Fresh storage each pass: saved HUD widget positions would otherwise
    // mask a bad *default* layout, which is what new players actually see.
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    // Test the scrapbook open too — the dock's raised cover is the state
    // that used to swallow the bottom tool slot.
    for (const dockState of ['closed', 'open']) {
      if (dockState === 'open') {
        // The strip raises the cover and re-scales the tool rail, so this is
        // the state where a bottom-left conflict would show up.
        await page.click('#scrapbook-toggle').catch(() => {});
        await page.waitForTimeout(500);
      }

      const boxes = await measure(page);
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          if (boxes[i].group === boxes[j].group) continue;
          const hit = intersection(boxes[i], boxes[j]);
          if (!hit) continue;
          failures.push(
            `${viewport.name} (dock ${dockState}): `
            + `"${boxes[i].label}" overlaps "${boxes[j].label}" `
            + `by ${hit.width}x${hit.height}px`,
          );
        }
      }

      if (WRITE_SHOTS) {
        await page.screenshot({ path: `${SHOT_DIR}/${viewport.name}-${dockState}.png` });
      }
    }
  }

  await browser.close();

  if (failures.length > 0) {
    console.error(`\nHUD layout: ${failures.length} overlap(s)\n`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    console.error('');
    process.exit(1);
  }

  console.log(`\nHUD layout: no overlaps across ${VIEWPORTS.length} viewports × 2 dock states.\n`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
