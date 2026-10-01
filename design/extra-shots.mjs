// Photographs what shots.mjs does not: the extra hash states, the app menu
// opened from the keyboard. (The accent comparison has its own script,
// accent-choice.mjs.) Headless, from file://, no
// server and no window. Usage, from the repository root: node design/extra-shots.mjs
// Output: design/shots-extra/*.png. Fails on any request outside the folder,
// on any console error, and when a photographed state shows more than one
// keyboard focus ring.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, 'shots-extra');
fs.mkdirSync(out, { recursive: true });
const index = pathToFileURL(path.join(dir, 'index.html')).href;

const SHOTS = [
  { name: 'about', url: `${index}#about` },
  { name: 'context', url: `${index}#context` },
  { name: 'advanced', url: `${index}#advanced` },
  { name: 'app-menu', url: `${index}#editor`, async act(page) {
    // open the menu the way a keyboard user does: Tab to the mark, then Enter
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('app-menu').matches(':popover-open'));
  } },
];

// Counts what draws a keyboard focus ring: the real focused element when it
// matches :focus-visible, plus every element carrying the mock's .is-focus.
const countRings = () => {
  const els = new Set(document.querySelectorAll('.is-focus'));
  const a = document.activeElement;
  if (a && a !== document.body && a.matches(':focus-visible')) els.add(a);
  // only what is rendered counts (states hide whole branches of the mock)
  return [...els].filter((el) => el.getClientRects().length > 0).length;
};

const problems = [];
const browser = await chromium.launch();
try {
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: s.width ?? 1440, height: s.height ?? 900 }, reducedMotion: 'reduce' });
    page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${s.name}: request outside the folder: ${r.url()}`); });
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`${s.name}: console error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${s.name}: page error: ${e.message}`));
    await page.goto(s.url);
    await page.evaluate(() => document.fonts.ready);
    if (s.act) await s.act(page);
    await page.waitForTimeout(150);
    if (s.rings !== false) {
      const rings = await page.evaluate(countRings);
      if (rings !== 1) problems.push(`${s.name}: ${rings} focus rings on screen, expected exactly 1`);
    }
    await page.screenshot({ path: path.join(out, `${s.name}.png`), fullPage: Boolean(s.fullPage) });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`${SHOTS.length} screenshots in ${out}`);
for (const p of problems) console.log(`PROBLEM ${p}`);
process.exitCode = problems.length ? 1 : 0;
