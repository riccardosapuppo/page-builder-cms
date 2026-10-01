// Photographs the editor with each accent candidate, headless, and lays the
// three side by side for the owner to choose. Run from the repository root:
//   node design/accent-choice.mjs
// Output: design/shots-extra/accent-<name>-<state>.png and accent-choice.png.
// Only accent-choice.png is kept in the repository, as the record of the
// choice; the single-candidate shots are ignored by git.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'shots-extra');
fs.mkdirSync(out, { recursive: true });
const index = pathToFileURL(path.join(here, 'index.html')).href;

// A dark accent carries white text and white keylines; a light one carries graphite.
const CANDIDATES = [
  { name: 'brass', label: 'Brass', hex: '#806E00', vars: { '--mark': '#806E00', '--on-mark': '#FFFFFF', '--mark-key': '#FFFFFF', '--mark-ink': '#806E00' },
    note: "The designer's choice: a dark gold, 5.1 to 1 on white. Ownable, but on white it reads as khaki." },
  { name: 'tool-yellow', label: 'Tool yellow', hex: '#EDC200', vars: { '--mark': '#EDC200', '--on-mark': '#1B1F24', '--mark-key': '#1B1F24', '--mark-ink': '#1B1F24' },
    note: 'A workshop yellow with graphite edges and graphite text (9.7 to 1). Bright and its own, never far from the work.' },
  { name: 'ink-teal', label: 'Ink teal', hex: '#0B5D6B', vars: { '--mark': '#0B5D6B', '--on-mark': '#FFFFFF', '--mark-key': '#FFFFFF', '--mark-ink': '#0B5D6B' },
    note: 'A deep blue-green, 7.5 to 1 on white. Calm and serious; the closest of the three to the site greens.' },
];
const STATES = [
  { id: 'editor', clip: { x: 0, y: 0, width: 1440, height: 620 } },
  { id: 'drag', clip: { x: 0, y: 0, width: 1440, height: 900 } },
];

const browser = await chromium.launch();
const problems = [];
try {
  for (const c of CANDIDATES) {
    for (const s of STATES) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      page.on('pageerror', (e) => problems.push(`${c.name}/${s.id}: ${e.message}`));
      await page.goto(`${index}#${s.id}`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((vars) => { for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v); }, c.vars);
      const applied = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mark').trim());
      if (applied.toLowerCase() !== c.vars['--mark'].toLowerCase()) problems.push(`${c.name}/${s.id}: --mark is ${applied}`);
      await page.screenshot({ path: path.join(out, `accent-${c.name}-${s.id}.png`), clip: s.clip });
      await page.close();
    }
  }
  // The side-by-side sheet.
  const img = (f) => `data:image/png;base64,${fs.readFileSync(path.join(out, f)).toString('base64')}`;
  const cols = CANDIDATES.map((c) => `
    <section>
      <h2><span class="sw" style="background:${c.hex}"></span>${c.label} <code>${c.hex}</code></h2>
      <p>${c.note}</p>
      <img src="${img(`accent-${c.name}-editor.png`)}" alt="">
      <img src="${img(`accent-${c.name}-drag.png`)}" alt="">
    </section>`).join('');
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  await sheet.setContent(`<!doctype html><html><head><style>
    body { margin: 0; padding: 24px; background: #F4F5F7; color: #1B1F24; font: 15px/1.45 system-ui, sans-serif; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
    h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-size: 20px; }
    code { font-size: 14px; color: #56606B; }
    .sw { width: 22px; height: 22px; border-radius: 4px; box-shadow: 0 0 0 1px #1B1F24; }
    p { margin: 0 0 10px; min-height: 44px; }
    img { display: block; width: 100%; margin-bottom: 12px; border: 1px solid #DCE0E5; }
  </style></head><body><h1>Choose the accent: the same editor, three colours</h1><div class="row">${cols}</div></body></html>`);
  await sheet.screenshot({ path: path.join(out, 'accent-choice.png'), fullPage: true });
} finally {
  await browser.close();
}
for (const p of problems) console.log(`PROBLEM ${p}`);
console.log(`${CANDIDATES.length * STATES.length} state shots and accent-choice.png in ${out}`);
process.exitCode = problems.length ? 1 : 0;
