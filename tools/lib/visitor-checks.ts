// What a visitor's browser draws from a published page, measured headless
// in Chromium (Playwright 1.62.1, from the root package): not the classes
// the server writes, which the Rails tests check, but their effect once
// the stylesheets have been applied.
//
// - Layout: a section's 3:2 column widths come out 3 to 2 at 1280 wide.
// - Palette: a band on the Primary slot is painted in the slot's default
//   tone, and a Display heading has its size, both read from
//   schema/tokens.json.
// - Reflow: no page scrolls sideways at 320 (WCAG 1.4.10: a 1280 window
//   at 400%), 340, 360 or 390 wide, and the header's Menu stays inside.
// - Focus: Tab walks every page at 1280 and 390 wide, and each stop's
//   ring must be drawn, at least 2 px, with a contrast of 3:1 or more
//   against the band around it (WCAG 1.4.11), and a text link's colour
//   4.5:1 (1.4.3). Every band of FIXTURE must be reached.
//
// FIXTURE is the page these checks need: a band on every background slot,
// each holding a text link and a button, a light column inside a dark
// band, a dark button on a light band, and a dark band that is no band on
// phones. The caller publishes it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

export type Check = (ok: boolean, what: string, detail?: string) => void;

export const SLOTS = ["none", "background", "soft", "accent", "primary", "muted", "text"] as const;

const style = (base: object = {}, phone?: object) => (phone ? { base, phone } : { base });
const block = (id: string, type: string, props: object, children: unknown[] = [], s = style()) => ({ id, type, props, children, style: s });
const link = (id: string, words: string) => block(id, "text", {
  doc: { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: `${words}, ` },
    { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "/" } }] },
  ] }] },
});
const button = (id: string, label: string, s = style()) => block(id, "button", { label, href: "/" }, [], s);
const band = (id: string, widgets: unknown[], s: ReturnType<typeof style>, columnStyle = style()) =>
  block(id, "section", {}, [block(`${id}-c`, "column", {}, widgets, columnStyle)], s);

// The blocks whose link and button the focus walk must reach.
export const BANDS = [...SLOTS.map((slot) => `band-${slot}`), "nest-dark", "nest-light", "phone-none"];

export function fixture(title: string): unknown {
  return {
    schemaVersion: 1,
    title,
    sections: [
      block("hero", "section", { columnWidths: "3:2" }, [
        block("hero-a", "column", {}, [block("hero-heading", "heading", { level: 1, text: title }, [], style({ textSize: "display" }))]),
        block("hero-b", "column", {}, [link("hero-text", "Two fifths of the width")]),
      ]),
      ...SLOTS.map((slot) => band(`band-${slot}`, [link(`band-${slot}-text`, `On ${slot}`), button(`band-${slot}-button`, `A button on ${slot}`)], style({ background: slot }))),
      // A light column inside a dark band: ink again, ring and text.
      band("nest-dark", [link("nest-dark-text", "On a light column in a dark band"), button("nest-dark-button", "A button there")], style({ background: "primary" }), style({ background: "background" })),
      // A button with a dark background of its own on a light band: its
      // ring is drawn on the band, so it is ink.
      band("nest-light", [link("nest-light-text", "On soft"), button("nest-light-button", "A dark button", style({ background: "primary", color: "background" }))], style({ background: "soft" })),
      // A dark band that phones show on no band at all.
      band("phone-none", [link("phone-none-text", "Dark, but not on phones"), button("phone-none-button", "A button there")], style({ background: "text" }, { background: "none" })),
    ],
  };
}

function rgb(css: string): number[] {
  return (/rgba?\(([^)]+)\)/.exec(css)?.[1] ?? "").split(/[\s,/]+/).filter(Boolean).map(Number);
}

function hex(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

function luminance(c: number[]): number {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: number[], b: number[]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

interface Stop { what: string; block: string; outline: string; width: number; ring: string; color: string; band: string; textLink: boolean; drawnInside: boolean }

// Tab until focus comes back to the start or leaves the page; one Stop per
// focused element. The band is the nearest ancestor with an opaque
// background: the ring is drawn 3 px outside the element, on it.
async function focusWalk(page: Page): Promise<Stop[]> {
  const stops: Stop[] = [];
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.dataset.walked) return null;
      el.dataset.walked = "1";
      const cs = getComputedStyle(el);
      let band = "rgb(255, 255, 255)";
      for (let a = el.parentElement; a; a = a.parentElement) {
        const bg = getComputedStyle(a).backgroundColor;
        const parts = (/rgba?\(([^)]+)\)/.exec(bg)?.[1] ?? "").split(/[\s,/]+/).filter(Boolean).map(Number);
        if (parts.length === 3 || (parts.length === 4 && parts[3] === 1)) { band = bg; break; }
      }
      const after = getComputedStyle(el, "::after");
      return {
        what: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 32)}"`,
        block: el.closest("[data-block-id]")?.getAttribute("data-block-id") ?? (el.closest("header") ? "header" : "theme"),
        outline: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        ring: cs.outlineColor,
        color: cs.color,
        band,
        textLink: el.tagName === "A" && !el.classList.contains("sw-btn") && !!el.closest(".w-text"),
        // The video and map cards clip their overflow and draw the ring
        // inside, with ::after, on the card.
        drawnInside: cs.outlineStyle === "none" && after.borderTopStyle === "solid" && parseFloat(after.borderTopWidth) >= 2,
      };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

export async function visitorChecks(base: string, previewPath: string, root: string, check: Check): Promise<void> {
  const tokens = JSON.parse(readFileSync(join(root, "schema", "tokens.json"), "utf8"));
  const tones = tokens["site-tones"];
  const primary = hex(tokens.color[tones.primary.default]);
  const display = tokens.type.site.display.desktop[0];
  const origin = new URL(base).origin;

  const browser = await chromium.launch();
  const open = async (width: number, path: string): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
    await page.goto(origin + path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return page;
  };

  try {
    // Layout, palette and type, at 1280 wide.
    const page = await open(1280, "/");
    const widths = await page.locator("[data-block-id=hero] > .cols > *").evaluateAll((columns) => columns.map((c) => c.getBoundingClientRect().width));
    const ratio = (widths[0] ?? 0) / (widths[1] ?? 1);
    check(widths.length === 2 && Math.abs(ratio - 1.5) < 0.02, "a section's 3:2 columns are drawn 3 to 2 at 1280 wide", `${widths.map((w) => w.toFixed(1)).join(" and ")} px, ${ratio.toFixed(3)} to 1`);
    const painted = await page.locator("[data-block-id=band-primary]").evaluate((el) => getComputedStyle(el).backgroundColor);
    check(rgb(painted).slice(0, 3).join() === primary.join(), `a band on the Primary slot is painted ${tokens.color[tones.primary.default]}, the slot's default tone`, painted);
    const size = await page.locator("[data-block-id=hero-heading] > *").evaluate((el) => getComputedStyle(el).fontSize);
    check(size === `${display}px`, `a Display heading is ${display} px at 1280 wide`, size);
    await page.close();

    // Reflow.
    const paths = ["/", "/no-such-page", previewPath];
    const wide: string[] = [];
    for (const width of [320, 340, 360, 390]) {
      for (const path of paths) {
        const p = await open(width, path);
        const m = await p.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          menu: document.querySelector(".sw-menu-button")?.getBoundingClientRect().right ?? Infinity,
        }));
        if (m.scroll > m.client || m.menu > m.client) wide.push(`${path} at ${width}: scrollWidth ${m.scroll}, clientWidth ${m.client}, Menu's right edge ${m.menu}`);
        await p.close();
      }
    }
    check(wide.length === 0, `no page scrolls sideways at 320, 340, 360 or 390 wide, and Menu stays inside (${paths.length} pages)`, wide.join("; "));

    // Focus.
    for (const width of [1280, 390]) {
      for (const path of paths) {
        const p = await open(width, path);
        const stops = await focusWalk(p);
        await p.close();
        const bad: string[] = [];
        let lowest = Infinity;
        for (const stop of stops) {
          if (stop.drawnInside) continue;
          const ring = contrast(rgb(stop.ring), rgb(stop.band));
          lowest = Math.min(lowest, ring);
          if (stop.outline === "none" || stop.width < 2 || ring < 3) bad.push(`${stop.what} [${stop.block}]: ${stop.outline} ${stop.width}px ${stop.ring} on ${stop.band}, ${ring.toFixed(2)}:1`);
          if (stop.textLink) {
            const text = contrast(rgb(stop.color), rgb(stop.band));
            if (text < 4.5) bad.push(`${stop.what} [${stop.block}]: text ${stop.color} on ${stop.band}, ${text.toFixed(2)}:1`);
          }
        }
        check(stops.length > 0 && bad.length === 0, `${path} at ${width} wide: every focus ring reads on its band`, `${stops.length} stops, lowest ring ${lowest.toFixed(2)}:1${bad.length ? `; ${bad.join("; ")}` : ""}`);
        if (path === "/") {
          const reached = new Set(stops.map((s) => s.block));
          const missing = BANDS.flatMap((b) => [`${b}-text`, `${b}-button`]).filter((id) => !reached.has(id));
          check(missing.length === 0, `the focus walk at ${width} wide reached the link and the button of all ${BANDS.length} bands`, missing.length ? `not reached: ${missing.join(", ")}` : "");
        }
      }
    }
  } finally {
    await browser.close();
  }
}
