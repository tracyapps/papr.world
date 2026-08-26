#!/usr/bin/env node
/**
 * Renders the social-share card to site/public/og.png.
 *
 * This is the picture that appears when somebody pastes a papr.world link
 * into Slack, Discord, Mastodon or a group chat. It is a real screenshot of
 * a real page (tools/og-card.html), taken with a headless browser, so editing
 * it means editing HTML and CSS rather than opening a design tool.
 *
 * ── Run it ───────────────────────────────────────────────────────────────
 *   npm run og:build
 *
 * ── One thing to know ────────────────────────────────────────────────────
 * The wordmark is set in Dokdo, which is loaded from Google Fonts by the card
 * itself. On a machine that cannot reach Google Fonts the render silently
 * falls back to a serif and the card looks wrong — recognisably wrong, but
 * wrong. The script warns you when the font did not arrive so you are never
 * left guessing why it looks off.
 *
 * The card is 1200 × 630, which is what every platform crops toward. Keep
 * anything that matters away from the outer 60px or so; some clients trim.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const CARD = fileURLToPath(new URL('og-card.html', import.meta.url));
const OUT = fileURLToPath(new URL('../site/public/og.png', import.meta.url));

const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  await page.goto(`file://${CARD}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Did Dokdo actually arrive, or are we about to render a serif?
  const gotTheFont = await page.evaluate(() => document.fonts.check('100px Dokdo'));
  if (!gotTheFont) {
    console.warn(
      '\n  ! Dokdo did not load, so the wordmark will render in a fallback face.\n' +
      '    Usually this means no route to fonts.googleapis.com. The image will\n' +
      '    still be written; re-run this on a connected machine to replace it.\n',
    );
  }

  // Give the layout a moment to settle after the webfonts swap in.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT });

  console.log(`Share card written to site/public/og.png${gotTheFont ? '' : ' (fallback font)'}`);
} finally {
  await browser.close();
}
