import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173', { waitUntil: 'load' });
await page.waitForTimeout(8000);

// Avatar studio: pick the gingerbread pal, then click through whatever
// confirm/next controls appear until the world is live.
await page.getByText('gingerbread pal', { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: './shot-studio-1.png' });
for (let round = 0; round < 6; round += 1) {
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role=button], .confirm, .next'));
    const target = buttons.find((b) => /confirm|next|done|save|start|let'?s|begin|looks good|finish/i.test(b.textContent ?? ''));
    if (target) { target.click(); return target.textContent; }
    return null;
  });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    studio: !!document.querySelector('.studio, [data-studio]'),
    pos: window.__paperWorld?.position?.(),
  }));
  console.log(round, clicked, JSON.stringify(state));
  if (state.pos && !state.studio) break;
}
await page.waitForTimeout(5000);
await page.screenshot({ path: './shot-world.png' });
console.log('FINAL', JSON.stringify(await page.evaluate(() => ({ p: window.__paperWorld?.position?.(), page: window.__paperWorld?.currentPage?.() }))));
await browser.close();
