// A new site's direction (./README.md, "A new site from a brief"): what a
// model is asked first, before any page, in a schema of its own, as an art
// director would set it: the site's name, its tagline and its voice; a
// colour for every slot of the site style's palette, with its role; a type
// scale and a letter width among the style's own choices; a sentence on
// its imagery; how much motion; the call to action a visitor takes first;
// and its three or four pages, each a title, a short address and a
// purpose, the first the home page. The site's style, its header and its
// footer are made from it (./frame.ts, ./site.ts), and each page is
// written to it.
//
// What the model sends is read without trust (readDirection): words are
// cleaned and cut at a word, every choice is held to the style's own list,
// a colour that is not #rrggbb keeps the site's own, an address is made an
// address, and the pages are kept to four. Every text pair the palette
// makes is then held to WCAG's AA, 4.5 to 1, as Site style checks it
// (fixPalette): a colour that fails is made lighter or darker by as little
// as passes, its hue and its chroma kept, and the note says so. The brief
// stays the only source of facts: the direction names no price, date,
// address or review, as the question says.
import { PALETTE_SLOTS, type PaletteSlot } from "../shared/document.ts";
import { contrastRatio, normalizeHex, type FreeColor } from "../shared/free-colors.ts";
import { slotLabel, slotTone } from "../shared/site-tokens.ts";
import type { SiteStyle } from "../storage/adapter.ts";
import { line } from "./build.ts";

export const DIRECTION_MOTIONS = ["none", "little", "some"] as const;
export type DirectionMotion = (typeof DIRECTION_MOTIONS)[number];
// How many pages a new site has: three or four, the first its home.
export const SITE_PAGES_LEAST = 3;
export const SITE_PAGES_MOST = 4;

export interface DirectionColor {
  hex: FreeColor;
  // What the colour is for, in the model's words.
  role: string;
}

export interface DirectionPage {
  title: string;
  // The page's address, as a page's slug is written: "classes".
  address: string;
  purpose: string;
}

export interface Direction {
  name: string;
  tagline: string;
  voice: string;
  // A colour for each slot of the site style, in the style's order.
  palette: Record<string, DirectionColor>;
  typeScale: string;
  letterWidth: string;
  imagery: string;
  motion: DirectionMotion;
  // What a visitor does first, as a button says it.
  action: string;
  // The first is the home page.
  pages: DirectionPage[];
}

// What a direction is held to: the style's slots, with the colour each has
// now, and its type scales and letter widths, as the style gives them.
export type DirectionStyle = Pick<SiteStyle, "palette" | "typeScale" | "letterWidth" | "choices">;

// The longest each of the direction's words may be, in code points: the
// logo's name and a menu's link take 40.
const MAX = { name: 40, tagline: 120, voice: 300, role: 120, imagery: 300, action: 40, title: 60, purpose: 300 } as const;

// What the site does with each slot (tokens.css, site.css), for the
// question.
export const SLOT_USES: Readonly<Record<PaletteSlot, string>> = {
  text: "the page's words, and the darkest band",
  background: "the page itself, and the words on a text, primary or muted band and on the form's send key",
  primary: "headings, links and the form's send key, and a strong band",
  accent: "buttons, their words in the text colour",
  soft: "a light band behind a section",
  muted: "captions on the background, and a quiet band, its words in the background colour",
};

// ------------------------------------------------------------- the schema

type Schema = Record<string, unknown>;
const text = (description: string): Schema => ({ type: "string", description });
const choice = (values: readonly string[], description: string): Schema => ({ type: "string", enum: [...values], description });
const closed = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

// The slots a style has, in its order.
export const slotsOf = (style: Pick<SiteStyle, "choices">): string[] => Object.keys(style.choices.palette);

// The direction's schema, for this style: a colour for each of its slots,
// and its own type scales and letter widths.
export function directionSchema(style: Pick<SiteStyle, "choices">): Schema {
  const scales = style.choices.typeScales;
  const widths = style.choices.letterWidths;
  return closed({
    name: text("The site's name: the brief's own, or two or three words made from what the brief says, never a real brand's; up to 30 characters."),
    tagline: text("One short line under the name, up to 80 characters."),
    voice: text("How the site's words sound, in one sentence."),
    palette: closed(Object.fromEntries(slotsOf(style).map((slot) => [slot, closed({
      hex: text("The colour, as #rrggbb."),
      role: text("What the colour is for on this site, in a few words."),
    }, `The ${slotWords(slot)} slot: ${SLOT_USES[slot as PaletteSlot] ?? "a colour of the site's"}.`)])), "A colour for every slot of the site's palette."),
    typeScale: choice(scales.map((scale) => scale.name), `How far apart the sizes of the type are: ${scales.map((scale) => scale.label).join(", ")}.`),
    letterWidth: choice(widths.map((width) => width.name), `How wide the letters of the headings are drawn: ${widths.map((width) => width.label).join(", ")}.`),
    imagery: text("The pictures' style, in one sentence: what they show, their light, their colours, their framing."),
    motion: choice(DIRECTION_MOTIONS, "How much the sections move as they come into view: none, little (one or two of a page), or some (most of a page's)."),
    action: text("What a visitor does first, as a button says it, in two to four words."),
    pages: {
      type: "array",
      description: "The site's three or four pages, the first its home page.",
      items: closed({
        title: text("The page's title, one to three words: it is the page's link in the menu."),
        address: text("The page's address: lowercase letters, digits and hyphens, short (classes); the home page's is the site's name as an address."),
        purpose: text("What the page holds and what its reader does there, in one sentence."),
      }),
    },
  });
}

// A slot as the words name it: "Primary", lowercase in a sentence.
function slotWords(slot: string): string {
  return ((PALETTE_SLOTS as readonly string[]).includes(slot) ? slotLabel(slot as PaletteSlot) : slot).toLowerCase();
}

// ------------------------------------------------------------- the reader

const record = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const words = (value: unknown, max: number): string => (typeof value === "string" ? line(value, max) : "");

// Words as an address, as a page's slug is written: lowercase letters and
// digits joined by single hyphens, at most 64 characters; "" when nothing
// is left.
export function addressOf(raw: string): string {
  return raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "");
}

export type DirectionRead = { ok: true; direction: Direction; notes: string[] } | { ok: false; reason: string };

// The direction a model sent, read without trust and held to the style.
// Not a direction at all, or one with no page, is no direction.
export function readDirection(raw: unknown, style: DirectionStyle): DirectionRead {
  const given = record(raw);
  if (!given) return { ok: false, reason: "The direction was not written as a direction." };
  const notes: string[] = [];
  let name = words(given.name, MAX.name);
  if (name === "") {
    name = "New site";
    notes.push("The direction gave the site no name: its header says “New site” until you name it.");
  }

  const colours = record(given.palette) ?? {};
  const palette: Record<string, DirectionColor> = {};
  for (const slot of slotsOf(style)) {
    const colour = record(colours[slot]);
    const hex = typeof colour?.hex === "string" ? normalizeHex(colour.hex) : null;
    const role = words(colour?.role, MAX.role);
    if (hex === null) {
      const own = slotTone(slot as PaletteSlot, style.palette).hex.toLowerCase() as FreeColor;
      notes.push(`The direction gave ${slotWords(slot)} no colour as #rrggbb: it keeps the site's own, ${own}.`);
      palette[slot] = { hex: own, role };
    } else {
      palette[slot] = { hex, role };
    }
  }

  const scales = style.choices.typeScales.map((scale) => scale.name);
  const widths = style.choices.letterWidths.map((width) => width.name);
  const typeScale = scales.includes(given.typeScale as string) ? (given.typeScale as string) : style.typeScale;
  if (typeScale !== given.typeScale) notes.push(`The direction's type scale is not one of the site's: it keeps its own, ${typeScale}.`);
  const letterWidth = widths.includes(given.letterWidth as string) ? (given.letterWidth as string) : style.letterWidth;
  if (letterWidth !== given.letterWidth) notes.push(`The direction's letter width is not one of the site's: it keeps its own, ${letterWidth}.`);
  const motion = DIRECTION_MOTIONS.includes(given.motion as DirectionMotion) ? (given.motion as DirectionMotion) : "little";

  let action = words(given.action, MAX.action);
  if (action === "") {
    action = "Get in touch";
    notes.push("The direction gave no call to action: the header's button says “Get in touch”.");
  }

  // The pages: a title each, an address of its own, at most four.
  const pages: DirectionPage[] = [];
  const taken = new Set<string>();
  const listed = Array.isArray(given.pages) ? given.pages : [];
  for (const item of listed) {
    const page = record(item);
    const title = words(page?.title, MAX.title);
    if (title === "") continue;
    if (pages.length === SITE_PAGES_MOST) {
      notes.push(`Kept the direction's first ${SITE_PAGES_MOST} pages: a new site has at most ${SITE_PAGES_MOST}.`);
      break;
    }
    const base = addressOf(typeof page?.address === "string" ? page.address : "") || addressOf(pages.length === 0 ? name : title) || `page-${pages.length + 1}`;
    let address = base;
    for (let count = 2; taken.has(address); count += 1) address = `${base.slice(0, 60)}-${count}`;
    taken.add(address);
    pages.push({ title, address, purpose: words(page?.purpose, MAX.purpose) });
  }
  if (pages.length === 0) return { ok: false, reason: "The direction named no page for the site." };
  if (pages.length < SITE_PAGES_LEAST) notes.push(`The direction named ${pages.length === 1 ? "one page" : `${pages.length} pages`}, not ${SITE_PAGES_LEAST} or ${SITE_PAGES_MOST}: the site has ${pages.length === 1 ? "it" : "those"}.`);

  const fixed = fixPalette(palette);
  return {
    ok: true,
    direction: {
      name,
      tagline: words(given.tagline, MAX.tagline),
      voice: words(given.voice, MAX.voice),
      palette: fixed.palette,
      typeScale,
      letterWidth,
      imagery: words(given.imagery, MAX.imagery),
      motion,
      action,
      pages,
    },
    notes: [...notes, ...fixed.notes],
  };
}

// --------------------------------------------------------- the contrast

// What text needs on its ground: WCAG's AA, as Site style's checks say it.
export const AA = 4.5;

// The text pairs the palette makes, as the site draws them (Site style's
// checks): body text on the background; the background's colour on
// primary and on muted (a button's, a band's words), which are the links'
// and captions' colours on the background too; the text's on accent and
// on soft. The first of each pair is the colour made to fit, in this
// order, so that a colour others are measured against is settled first;
// what reads is said in the words of Site style's checks.
export const PAIRS: ReadonlyArray<{ fix: PaletteSlot; on: PaletteSlot; reads: string }> = [
  { fix: "text", on: "background", reads: "body text reads on the background, and words on a band in it" },
  { fix: "primary", on: "background", reads: "button text reads on it, and links on the background" },
  { fix: "muted", on: "background", reads: "captions read on the background, and words on a band in it" },
  { fix: "accent", on: "text", reads: "button text reads on it" },
  { fix: "soft", on: "text", reads: "text reads on a band in it" },
];

// sRGB and OKLab (Björn Ottosson's), for a colour made lighter or darker
// with its hue and its chroma kept.
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((at) => linear(Number.parseInt(hex.slice(at, at + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function rgbOf(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const inGamut = (rgb: readonly number[]): boolean => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

// The colour at `lightness` with this hue and chroma, or as much of the
// chroma as sRGB holds there, as #rrggbb.
function hexAt(lightness: number, a: number, b: number): FreeColor {
  let rgb = rgbOf(lightness, a, b);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(rgbOf(lightness, a * mid, b * mid))) low = mid;
      else high = mid;
    }
    rgb = rgbOf(lightness, a * low, b * low);
  }
  return `#${rgb.map((c) => Math.round(gamma(Math.min(1, Math.max(0, c))) * 255).toString(16).padStart(2, "0")).join("")}` as FreeColor;
}

// `colour` made lighter or darker by as little as lets it read on `ground`
// at AA, its hue and chroma kept; as it is when it reads already.
export function readableOn(colour: FreeColor, ground: string): FreeColor {
  if (contrastRatio(colour, ground) >= AA) return colour;
  const [lightness, a, b] = toOklab(colour);
  const passes = (at: number): boolean => contrastRatio(hexAt(at, a, b), ground) >= AA;
  // On each side, from the end that passes (black, white) towards the
  // colour, the nearest lightness that still passes.
  const nearest = (end: number): number | null => {
    if (!passes(end)) return null;
    let good = end;
    let bad = lightness;
    for (let step = 0; step < 40; step += 1) {
      const mid = (good + bad) / 2;
      if (passes(mid)) good = mid;
      else bad = mid;
    }
    return good;
  };
  const sides = [nearest(0), nearest(1)].filter((at): at is number => at !== null);
  // Black or white reads on any colour at 4.58 to 1 at least, so one side
  // always passes; were neither to, the better of the two.
  if (sides.length === 0) return contrastRatio("#000000", ground) >= contrastRatio("#ffffff", ground) ? "#000000" : "#ffffff";
  const best = sides.reduce((one, other) => (Math.abs(other - lightness) < Math.abs(one - lightness) ? other : one));
  return hexAt(best, a, b);
}

// The palette with every pair read at AA, and a note for each colour
// changed. Slots the palette does not have are left alone.
export function fixPalette(palette: Readonly<Record<string, DirectionColor>>): { palette: Record<string, DirectionColor>; notes: string[] } {
  const fixed: Record<string, DirectionColor> = { ...palette };
  const notes: string[] = [];
  for (const pair of PAIRS) {
    const colour = fixed[pair.fix];
    const ground = fixed[pair.on];
    if (!colour || !ground) continue;
    const made = readableOn(colour.hex, ground.hex);
    if (made === colour.hex) continue;
    const darker = contrastRatio(made, "#000000") < contrastRatio(colour.hex, "#000000");
    const ratio = (Math.floor(contrastRatio(made, ground.hex) * 10) / 10).toFixed(1);
    notes.push(`Made the ${slotWords(pair.fix)} colour ${darker ? "darker" : "lighter"}, ${colour.hex} to ${made}, so that ${pair.reads}: ${ratio} to 1, as WCAG's AA asks of text.`);
    fixed[pair.fix] = { ...colour, hex: made };
  }
  return { palette: fixed, notes };
}

// The style a direction gives the site, as Site style saves it: each slot
// its colour, the type scale, the letter width.
export function styleOf(direction: Pick<Direction, "palette" | "typeScale" | "letterWidth">): { palette: Record<string, string>; typeScale: string; letterWidth: string } {
  return { palette: Object.fromEntries(Object.entries(direction.palette).map(([slot, colour]) => [slot, colour.hex])), typeScale: direction.typeScale, letterWidth: direction.letterWidth };
}
