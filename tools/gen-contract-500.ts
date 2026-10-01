// node tools/gen-contract-500.ts [--check]
//
// Writes contract/fixtures/large-500.json: a page of exactly 500 blocks for
// the render contract and for timing the server's renderer. 25 sections of
// 20 blocks each: a section, one to four columns, and the widgets that make
// up the rest, cycling through every widget type, with text that now and
// then carries the escaping traps of the smaller fixtures. A seeded random
// generator picks the column counts and contents, so every run writes the
// same bytes; --check writes nothing and exits 1 if the committed file is
// not what this script would write.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "contract", "fixtures", "large-500.json");

// mulberry32: small, fast, and the same numbers on every machine.
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = generator(500);
const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;

type Block = { id: string; type: string; props: Record<string, unknown>; children: Block[]; style: Record<string, Record<string, string>> };
const block = (id: string, type: string, props: Record<string, unknown> = {}, children: Block[] = [], style: Record<string, Record<string, string>> = { base: {} }): Block =>
  ({ id, type, props, children, style });

const WORDS = ["slack", "water", "tide", "buoy", "dawn", "swim", "cap", "goggles", "tea", "slipway", "shallows", "winter", "cold", "bay", "first light"];
const TRAPS = ["Tom & Jerry's", "<script>alert(1)</script>", "\"quoted\"", "&amp; &copy", "café 日本語 🎉", "שלום"];
const sentence = (n: number): string => {
  const words = Array.from({ length: n }, () => (random() < 0.08 ? pick(TRAPS) : pick(WORDS)));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
};
const ICONS = ["sunrise", "buoys", "cup", "calendar", "clock", "pin", "globe", "info"] as const;
const SPACES = ["none", "xs", "s", "m", "l", "xl", "xxl"] as const;
const SLOTS = ["text", "primary", "accent", "soft", "muted"] as const;
const STEPS = ["display", "heading-1", "heading-2", "heading-3", "large", "body", "small"] as const;
const HREFS = ["/winter", "#join", "https://tide.example.org/times?day=1&tz=UTC", "mailto:club@example.org", "tel:+44-20-7946-0958", "?season=winter"] as const;
const MEDIA = ["hero-dawn", "g-horizon", "g-caps", "g-buoys", "g-slipway", "g-rockpools", "g-wake", "m-tea", "m-winter"] as const;

const WIDGETS = ["heading", "text", "image", "button", "divider", "spacer", "gallery", "video", "map", "iconbox", "quote", "accordion"] as const;
let next = 0;

function widget(id: string): Block {
  const type = WIDGETS[next % WIDGETS.length]!;
  next += 1;
  const style: Record<string, Record<string, string>> = { base: {} };
  switch (type) {
    case "heading": {
      const props: Record<string, unknown> = { level: 1 + Math.floor(random() * 4), text: sentence(3 + Math.floor(random() * 5)) };
      if (random() < 0.3) props.href = pick(HREFS);
      if (random() < 0.5) style.base!.textSize = pick(STEPS);
      if (random() < 0.3) style.phone = { textSize: pick(STEPS) };
      return block(id, type, props, [], style);
    }
    case "text": {
      const content: unknown[] = [];
      const paragraphs = 1 + Math.floor(random() * 3);
      for (let p = 0; p < paragraphs; p++) {
        content.push({
          type: "paragraph",
          content: [
            { type: "text", text: sentence(6 + Math.floor(random() * 10)) + " " },
            { type: "text", text: pick(WORDS), marks: [{ type: pick(["bold", "italic"] as const) }] },
            { type: "text", text: " and " },
            { type: "text", text: pick(WORDS), marks: [{ type: "link", attrs: { href: pick(HREFS) } }] },
          ],
        });
      }
      if (random() < 0.4) {
        content.push({ type: "bulletList", content: [1, 2, 3].map(() => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: sentence(3) }] }] })) });
      }
      if (random() < 0.3) style.base!.color = pick(SLOTS);
      return block(id, type, { doc: { type: "doc", content } }, [], style);
    }
    case "image":
      return random() < 0.8
        ? block(id, type, { mediaId: pick(MEDIA), alt: sentence(5) })
        : block(id, type, { url: `https://images.example.org/${pick(WORDS).replace(" ", "-")}.jpg`, alt: sentence(4) });
    case "button":
      if (random() < 0.5) style.base!.background = pick(SLOTS);
      return block(id, type, { label: sentence(2), href: pick(HREFS) }, [], style);
    case "divider":
      return block(id, type);
    case "spacer":
      return block(id, type, { size: pick(SPACES) });
    case "gallery":
      return block(id, type, { items: Array.from({ length: 2 + Math.floor(random() * 5) }, () => ({ mediaId: pick(MEDIA), alt: sentence(4) })) });
    case "video":
      return random() < 0.5
        ? block(id, type, { provider: "youtube", videoId: "M7lc1UVf-VE", title: sentence(4) })
        : block(id, type, { provider: "vimeo", videoId: String(10_000_000 + Math.floor(random() * 90_000_000)), title: sentence(4) });
    case "map":
      return block(id, type, { latitude: Math.round((random() * 160 - 80) * 10_000) / 10_000, longitude: Math.round((random() * 340 - 170) * 10_000) / 10_000, zoom: 1 + Math.floor(random() * 19), label: sentence(5) });
    case "iconbox":
      return block(id, type, { icon: pick(ICONS), title: sentence(2), text: sentence(8) });
    case "quote":
      return block(id, type, random() < 0.5 ? { text: sentence(10), attribution: sentence(3) } : { text: sentence(12) });
    case "accordion":
      return block(id, type, { items: Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({ question: sentence(5) + "?", answer: sentence(14) })) });
  }
}

const sections: Block[] = [];
for (let s = 1; s <= 25; s++) {
  const columns = 1 + Math.floor(random() * 4);
  const widgets = 19 - columns;
  const children: Block[] = [];
  for (let c = 1; c <= columns; c++) {
    const count = Math.floor(widgets / columns) + (c <= widgets % columns ? 1 : 0);
    const columnStyle: Record<string, Record<string, string>> = { base: {} };
    if (random() < 0.4) columnStyle.base!.spaceInside = pick(SPACES);
    if (random() < 0.2) columnStyle.tablet = { spaceInside: pick(SPACES) };
    children.push(block(`s${s}c${c}`, "column", {}, Array.from({ length: count }, (_, w) => widget(`s${s}c${c}w${w + 1}`)), columnStyle));
  }
  const sectionStyle: Record<string, Record<string, string>> = { base: {} };
  if (random() < 0.3) sectionStyle.base!.background = pick(SLOTS);
  sections.push(block(`s${s}`, "section", { label: `Section ${s}` }, children, sectionStyle));
}

const count = (blocks: Block[]): number => blocks.reduce((n, b) => n + 1 + count(b.children), 0);
const total = count(sections);
if (total !== 500) throw new Error(`the page has ${total} blocks, not 500`);

const text = JSON.stringify({ schemaVersion: 1, title: "Five hundred blocks", sections }, null, 1) + "\n";
if (process.argv.includes("--check")) {
  const same = existsSync(target) && readFileSync(target, "utf8") === text;
  console.log(same ? "contract/fixtures/large-500.json is what the generator writes (500 blocks)" : "contract/fixtures/large-500.json differs from what the generator writes");
  process.exit(same ? 0 : 1);
}
writeFileSync(target, text);
console.log(`wrote contract/fixtures/large-500.json: ${total} blocks, ${text.length} characters`);
