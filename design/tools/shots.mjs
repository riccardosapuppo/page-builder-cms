// Screenshots every state of the design mock, headless, without opening any
// window on screen. Usage, from the repository root:
//   node design/tools/shots.mjs [folder]
// The folder defaults to design/ (found from this script's own location, so
// the working directory does not matter). It must contain index.html (states
// switched by the URL hash) and mark.svg. Output goes to <folder>/shots/.
// The run fails if a state is missing, if the page asks for anything outside
// the folder, or if the page logs an error.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STATES = [
  { id: 'editor', width: 1440, height: 900 },
  { id: 'style', width: 1440, height: 900 },
  { id: 'drag', width: 1440, height: 900 },
  { id: 'save-states', width: 1440, height: 900 },
  { id: 'media', width: 1440, height: 900 },
  { id: 'publish', width: 1440, height: 900 },
  { id: 'history', width: 1440, height: 900 },
  { id: 'site-style', width: 1440, height: 900 },
  { id: 'shortcuts', width: 1440, height: 900 },
  { id: 'empty', width: 1440, height: 900 },
  { id: 'page', width: 1280, height: 900, fullPage: true },
  { id: 'page-phone', width: 390, height: 844, fullPage: true },
  { id: 'tokens', width: 1280, height: 900, fullPage: true },
];

const designDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : designDir;
const index = path.join(dir, 'index.html');
if (!fs.existsSync(index)) {
  console.error(`usage: node design/tools/shots.mjs [folder with index.html]; not found: ${index}`);
  process.exitCode = 2;
} else {
  await run();
}

async function run() {
  const out = path.join(dir, 'shots');
  fs.mkdirSync(out, { recursive: true });
  const problems = [];
  const browser = await chromium.launch();
  try {
    for (const s of STATES) {
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, reducedMotion: 'reduce' });
      page.on('request', (r) => {
        if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) {
          problems.push(`${s.id}: request outside the folder: ${r.url()}`);
        }
      });
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`${s.id}: console error: ${m.text()}`); });
      page.on('pageerror', (e) => problems.push(`${s.id}: page error: ${e.message}`));
      await page.goto(`${pathToFileURL(index).href}#${s.id}`);
      await page.evaluate(() => document.fonts.ready);
      const shown = await page.evaluate((id) => document.documentElement.dataset.state === id, s.id);
      if (!shown) problems.push(`${s.id}: <html data-state> is not "${s.id}" after loading #${s.id}`);
      await page.screenshot({ path: path.join(out, `${s.id}.png`), fullPage: Boolean(s.fullPage) });
      await page.close();
    }
    await markSheet(browser, out, problems);
  } finally {
    await browser.close();
  }
  const written = fs.readdirSync(out).filter((f) => f.endsWith('.png'));
  console.log(`${written.length} screenshots in ${out}`);
  if (written.length < STATES.length + 1) problems.push(`only ${written.length} screenshots written, expected ${STATES.length + 1}`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  process.exitCode = problems.length ? 1 : 0;
}

// The mark as it is really seen: 16 and 32 pixels on a light and a dark tab,
// then enlarged with nearest-neighbour sampling so a reviewer can count pixels.
async function markSheet(browser, out, problems) {
  const svgPath = path.join(dir, 'mark.svg');
  if (!fs.existsSync(svgPath)) { problems.push('mark.svg is missing'); return; }
  // A data: URL, because a page made with setContent cannot read file:// URLs.
  const svg = `data:image/svg+xml;base64,${fs.readFileSync(svgPath).toString('base64')}`;
  const page = await browser.newPage({ viewport: { width: 520, height: 300 } });
  await page.setContent(`<!doctype html><body style="margin:0;font:14px sans-serif">
    <canvas id="c" width="520" height="300"></canvas>
    <script>
      const img = new Image();
      img.onload = () => {
        const c = document.getElementById('c'), g = c.getContext('2d');
        g.imageSmoothingEnabled = false;
        const rows = [['#ffffff', 10], ['#202124', 155]];
        for (const [bg, y] of rows) {
          for (const [size, x] of [[16, 10], [32, 190]]) {
            const tmp = document.createElement('canvas'); tmp.width = size; tmp.height = size;
            const t = tmp.getContext('2d'); t.fillStyle = bg; t.fillRect(0, 0, size, size);
            t.drawImage(img, 0, 0, size, size);
            const scale = size === 16 ? 8 : 4;
            g.drawImage(tmp, 0, 0, size, size, x, y, size * scale, size * scale);
          }
          const big = document.createElement('canvas'); big.width = 128; big.height = 128;
          const b = big.getContext('2d'); b.fillStyle = bg; b.fillRect(0, 0, 128, 128); b.drawImage(img, 0, 0, 128, 128);
          g.drawImage(big, 380, y);
        }
        document.body.dataset.done = '1';
      };
      img.src = ${JSON.stringify(svg)};
    </script></body>`);
  await page.waitForFunction(() => document.body.dataset.done === '1', null, { timeout: 10000 }).catch(() => problems.push('mark.svg did not load'));
  await page.screenshot({ path: path.join(out, 'mark-16px.png') });
  await page.close();
}
