// A new site's direction (./direction.ts): its schema, held to the rules
// both providers hold an answer to, a colour asked for every slot of the
// site style and its type and width among the style's own choices; what a
// model sends, read without trust (words cut, colours made #rrggbb or the
// site's own, every choice held to the style's list, addresses made
// addresses, the pages kept to four, said in notes); and the palette's
// text pairs held to WCAG's AA, a colour that fails made lighter or darker
// by as little as passes, its hue kept, said in a note. Over random
// palettes, every pair reads at AA once fixed.
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { contrastRatio, type FreeColor } from "../shared/free-colors.ts";
import { defaultSiteStyle, siteStyleChoices, slotTone } from "../shared/site-tokens.ts";
import { AA, DIRECTION_MOTIONS, directionSchema, fixPalette, PAIRS, readableOn, readDirection, slotsOf, styleOf, type DirectionColor, type DirectionStyle } from "./direction.ts";

const STYLE: DirectionStyle = { ...defaultSiteStyle(), choices: siteStyleChoices() };
type Schema = Record<string, unknown>;

// A direction as a model writes one for a gym: a palette that reads.
const colour = (hex: string, role: string): DirectionColor => ({ hex: hex as FreeColor, role });
const GOOD_PALETTE = {
  text: colour("#16181d", "Words, and the darkest band"),
  background: colour("#f7f5f0", "The page, warm white"),
  primary: colour("#b3361b", "Headings and links, iron red"),
  accent: colour("#f2b33d", "Buttons"),
  soft: colour("#ece6da", "Light bands"),
  muted: colour("#5c5f66", "Captions and quiet bands"),
};
const GYM = {
  name: "Iron Forge",
  tagline: "Strength, cardio and coaching under one roof",
  voice: "Direct and encouraging: short sentences, no jargon.",
  palette: GOOD_PALETTE,
  typeScale: "strong",
  letterWidth: "wide",
  imagery: "Warm, contrasty photos of people training, shot low, natural light from high windows.",
  motion: "little",
  action: "Book a free session",
  pages: [
    { title: "Home", address: "iron-forge", purpose: "What the gym offers, and the free first session." },
    { title: "Classes", address: "classes", purpose: "The kinds of class, and who each is for." },
    { title: "Membership", address: "membership", purpose: "How to join." },
  ],
};

function* walk(schema: Schema, at = ""): Generator<{ schema: Schema; at: string }> {
  yield { schema, at };
  for (const [key, inner] of Object.entries((schema.properties ?? {}) as Record<string, Schema>)) yield* walk(inner, `${at}/properties/${key}`);
  if (schema.items) yield* walk(schema.items as Schema, `${at}/items`);
}

describe("the schema", () => {
  const schema = directionSchema(STYLE);

  test("every object closed, every key required, only the keywords both providers take", () => {
    for (const { schema: inner, at } of walk(schema)) {
      expect(Object.keys(inner).every((key) => ["type", "description", "enum", "properties", "required", "additionalProperties", "items"].includes(key)), at).toBe(true);
      if (inner.type !== "object") continue;
      expect(inner.additionalProperties, at).toBe(false);
      expect(inner.required, at).toEqual(Object.keys(inner.properties as Schema));
    }
  });

  test("a colour and its role for every slot of the style, its type scale and letter width among the style's choices, the motion among three", () => {
    const properties = schema.properties as Record<string, Schema>;
    expect(Object.keys(properties.palette!.properties as Schema)).toEqual(slotsOf(STYLE));
    expect(Object.keys(properties.palette!.properties as Schema)).toEqual(["text", "background", "primary", "accent", "soft", "muted"]);
    expect(properties.typeScale!.enum).toEqual(STYLE.choices.typeScales.map((scale) => scale.name));
    expect(properties.letterWidth!.enum).toEqual(STYLE.choices.letterWidths.map((width) => width.name));
    expect(properties.motion!.enum).toEqual([...DIRECTION_MOTIONS]);
    expect(Object.keys(((properties.pages!.items as Schema).properties) as Schema)).toEqual(["title", "address", "purpose"]);
  });
});

describe("the reader", () => {
  test("a direction that fits comes back whole, its colours as they were, with no note", () => {
    const read = readDirection(GYM, STYLE);
    if (!read.ok) throw new Error(read.reason);
    expect(read.notes).toEqual([]);
    expect(read.direction).toEqual({ ...GYM, palette: GOOD_PALETTE });
    expect(styleOf(read.direction)).toEqual({
      palette: { text: "#16181d", background: "#f7f5f0", primary: "#b3361b", accent: "#f2b33d", soft: "#ece6da", muted: "#5c5f66" },
      typeScale: "strong",
      letterWidth: "wide",
    });
  });

  test("words are cleaned and cut at a word; a colour is written #rrggbb, or keeps the site's own, said", () => {
    const read = readDirection({
      ...GYM,
      name: "  Iron\u0000 Forge   Strength and Conditioning Collective  ",
      palette: { ...GOOD_PALETTE, primary: { hex: "#B3361B", role: "Red" }, accent: { hex: "f2b", role: "" }, soft: { hex: "beige", role: "" }, muted: undefined },
    }, STYLE);
    if (!read.ok) throw new Error(read.reason);
    expect(read.direction.name).toBe("Iron Forge Strength and Conditioning…");
    expect([read.direction.palette.primary!.hex, read.direction.palette.accent!.hex]).toEqual(["#b3361b", "#ff22bb"]);
    expect(read.direction.palette.soft!.hex).toBe(slotTone("soft").hex.toLowerCase());
    expect(read.direction.palette.muted!.hex).toBe(slotTone("muted").hex.toLowerCase());
    expect(read.notes.slice(0, 2)).toEqual([
      `The direction gave soft no colour as #rrggbb: it keeps the site's own, ${slotTone("soft").hex.toLowerCase()}.`,
      `The direction gave muted no colour as #rrggbb: it keeps the site's own, ${slotTone("muted").hex.toLowerCase()}.`,
    ]);
  });

  test("a type scale, a letter width or a motion that is not one of the style's keeps the style's own, said", () => {
    const read = readDirection({ ...GYM, typeScale: "enormous", letterWidth: "125%", motion: "lots" }, { ...STYLE, typeScale: "gentle", letterWidth: "narrow" });
    if (!read.ok) throw new Error(read.reason);
    expect([read.direction.typeScale, read.direction.letterWidth, read.direction.motion]).toEqual(["gentle", "narrow", "little"]);
    expect(read.notes).toEqual([
      "The direction's type scale is not one of the site's: it keeps its own, gentle.",
      "The direction's letter width is not one of the site's: it keeps its own, narrow.",
    ]);
  });

  test("the pages: a title each, an address of its own made an address, four at most; fewer than three said; none is no direction", () => {
    const page = (title: unknown, address: unknown) => ({ title, address, purpose: "x" });
    const read = readDirection({ ...GYM, pages: [page("Home", "/Iron Forge!"), page("", "lost"), page("Classes", "classes"), page("Timetable", "classes"), page("Coaches", ""), page("Prices", "prices"), page("Contact", "contact")] }, STYLE);
    if (!read.ok) throw new Error(read.reason);
    expect(read.direction.pages.map((one) => [one.title, one.address])).toEqual([["Home", "iron-forge"], ["Classes", "classes"], ["Timetable", "classes-2"], ["Coaches", "coaches"]]);
    expect(read.notes).toEqual(["Kept the direction's first 4 pages: a new site has at most 4."]);

    const short = readDirection({ ...GYM, pages: [page("Home", "")] }, STYLE);
    if (!short.ok) throw new Error(short.reason);
    // The home page with no address takes the site's name.
    expect(short.direction.pages).toEqual([{ title: "Home", address: "iron-forge", purpose: "x" }]);
    expect(short.notes).toEqual(["The direction named one page, not 3 or 4: the site has it."]);

    expect(readDirection({ ...GYM, pages: [page("", "x"), page(7, "y")] }, STYLE)).toEqual({ ok: false, reason: "The direction named no page for the site." });
    expect(readDirection("a gym", STYLE)).toEqual({ ok: false, reason: "The direction was not written as a direction." });
  });

  test("a site with no name is called New site, and one with no call to action says Get in touch, each said", () => {
    const read = readDirection({ ...GYM, name: "   ", action: 7 }, STYLE);
    if (!read.ok) throw new Error(read.reason);
    expect([read.direction.name, read.direction.action]).toEqual(["New site", "Get in touch"]);
    expect(read.notes).toEqual([
      "The direction gave the site no name: its header says “New site” until you name it.",
      "The direction gave no call to action: the header's button says “Get in touch”.",
    ]);
  });
});

// OKLab's hue angle of a colour, in degrees.
function hue(hex: string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((at) => lin(Number.parseInt(hex.slice(at, at + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return (Math.atan2(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * 180) / Math.PI;
}

// A colour between two, `share` of the way from the first, as #rrggbb.
const between = (from: string, to: string, share: number): string =>
  `#${[1, 3, 5].map((at) => Math.round(Number.parseInt(from.slice(at, at + 2), 16) * (1 - share) + Number.parseInt(to.slice(at, at + 2), 16) * share).toString(16).padStart(2, "0")).join("")}`;

describe("the contrast", () => {
  test("a palette that reads is left as it is", () => {
    expect(fixPalette(GOOD_PALETTE)).toEqual({ palette: GOOD_PALETTE, notes: [] });
  });

  test("a primary too light for the background is made darker by as little as passes, its hue kept, and said", () => {
    const palette = { ...GOOD_PALETTE, primary: { hex: "#f5a3a3" as FreeColor, role: "Headings" } };
    const { palette: fixed, notes } = fixPalette(palette);
    const made = fixed.primary!.hex;
    expect(contrastRatio(made, GOOD_PALETTE.background.hex)).toBeGreaterThanOrEqual(AA);
    // As little as passes: a little of the way back towards the colour asked for fails.
    expect(contrastRatio(between(made, "#f5a3a3", 0.08), GOOD_PALETTE.background.hex)).toBeLessThan(AA);
    expect(Math.abs(hue(made) - hue("#f5a3a3"))).toBeLessThan(6);
    expect(fixed.primary!.role).toBe("Headings");
    expect(notes).toEqual([`Made the primary colour darker, #f5a3a3 to ${made}, so that button text reads on it, and links on the background: ${(Math.floor(contrastRatio(made, GOOD_PALETTE.background.hex) * 10) / 10).toFixed(1)} to 1, as WCAG's AA asks of text.`]);
  });

  test("on a dark site, text too dark for its background is made lighter; the accent is then held to the text as it is now", () => {
    const palette: Record<string, DirectionColor> = {
      text: { hex: "#5a5a5a", role: "" }, background: { hex: "#121212", role: "" }, primary: { hex: "#ff8a3d", role: "" },
      accent: { hex: "#6b6b6b", role: "" }, soft: { hex: "#1d1d1d", role: "" }, muted: { hex: "#9a9a9a", role: "" },
    };
    const { palette: fixed, notes } = fixPalette(palette);
    expect(contrastRatio(fixed.text!.hex, "#121212")).toBeGreaterThanOrEqual(AA);
    expect(notes[0]).toMatch(/^Made the text colour lighter, #5a5a5a to #[0-9a-f]{6}, so that body text reads on the background/);
    // Measured against the text as fixed: the accent goes the other way, darker, away from the light text.
    expect(contrastRatio(fixed.accent!.hex, fixed.text!.hex)).toBeGreaterThanOrEqual(AA);
    for (const pair of PAIRS) expect(contrastRatio(fixed[pair.fix]!.hex, fixed[pair.on]!.hex), pair.fix).toBeGreaterThanOrEqual(AA);
  });

  test("readableOn: a colour that reads is as it was; one that does not ends at the side nearer to it", () => {
    expect(readableOn("#1d4e6f", "#ffffff")).toBe("#1d4e6f");
    const light = readableOn("#cccccc", "#777777");
    expect(contrastRatio(light, "#777777")).toBeGreaterThanOrEqual(AA);
    // Grey on a mid grey: white is out of reach, so darker it is.
    expect(contrastRatio(light, "#000000")).toBeLessThan(contrastRatio("#cccccc", "#000000"));
  });

  test("over random palettes, every pair reads at AA once fixed, and a colour is changed only where its pair failed", () => {
    const hex = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
      .map(([r, g, b]) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}` as FreeColor);
    const any = hex.map((value): DirectionColor => ({ hex: value, role: "" }));
    fc.assert(fc.property(fc.record({ text: any, background: any, primary: any, accent: any, soft: any, muted: any }), (palette) => {
      const { palette: fixed } = fixPalette(palette);
      for (const pair of PAIRS) {
        if (contrastRatio(fixed[pair.fix]!.hex, fixed[pair.on]!.hex) < AA) return false;
      }
      // The background is never changed, being the ground of three pairs.
      return fixed.background!.hex === palette.background.hex;
    }), { numRuns: 300 });
  });
});
