// WCAG 2.x contrast of every foreground/background pair the mock declares.
// Usage, from the repository root:
//   node design/tools/contrast.mjs [folder]
// The folder defaults to design/ (found from this script's own location, so
// the working directory does not matter).
// tokens.json must have "color": {name: "#rrggbb"} and
// "pairs": [{"fg": name, "bg": name, "use": "text" | "large-text" | "ui"}].
// text needs 4.5:1, large-text and ui (borders, icons, focus rings) 3:1.
// Fails on any pair below its threshold, on unknown names, and on zero pairs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const designDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ? path.resolve(process.argv[2]) : designDir;
const file = path.join(dir, 'tokens.json');
if (!fs.existsSync(file)) {
  console.error(`usage: node design/tools/contrast.mjs [folder with tokens.json]; not found: ${file}`);
  process.exitCode = 2;
} else {
  const tokens = JSON.parse(fs.readFileSync(file, 'utf8'));
  const colors = tokens.color ?? {};
  const pairs = tokens.pairs ?? [];
  const need = { text: 4.5, 'large-text': 3, ui: 3 };
  let failures = 0;
  if (pairs.length === 0) { console.log('FAIL: no pairs declared'); failures++; }
  for (const p of pairs) {
    const fg = colors[p.fg], bg = colors[p.bg];
    if (!isHex(fg) || !isHex(bg)) { console.log(`FAIL unknown or non-hex color in ${JSON.stringify(p)}`); failures++; continue; }
    if (!(p.use in need)) { console.log(`FAIL unknown use "${p.use}" in ${JSON.stringify(p)}`); failures++; continue; }
    const r = ratio(fg, bg);
    const ok = r >= need[p.use];
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2)}:1  ${p.fg} on ${p.bg}  (${p.use}, needs ${need[p.use]})`);
  }
  console.log(`${pairs.length} pairs checked, ${failures} failing`);
  process.exitCode = failures ? 1 : 0;
}

function isHex(v) {
  if (typeof v !== 'string' || v.length !== 7 || v[0] !== '#') return false;
  return [...v.slice(1)].every((ch) => '0123456789abcdefABCDEF'.includes(ch));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
