// Free type: a heading's, a text's or a quote's own size, weight, letter
// spacing, line height and letter width (the schema's fontSize, fontWeight,
// letterSpacing, lineHeight and letterWidth), each over what its type step
// and its typeface give, on its own: a block with a size of its own keeps
// its step's line height, its face's weight and the rest. Each is a style
// key like any other, with a tablet's and a phone's own values.
//
// Where the schema cannot say how far a value goes, the application rules
// do (schema/tools/rules.ts: sizeRange, decimals), and this file reads
// their tables and their tests, so the renderer draws only what both
// validators take, and the panel offers only that.
//
// The page carries each value as a data attribute on the block's root
// (data-font-size="6vw", data-tablet-font-weight="800"), never as an inline
// style, which the published pages' Content-Security-Policy would block; a
// stylesheet made for the values the page uses draws them
// (../render/free-type-css.ts), which the CMS serves from an address of its
// own (cms/app/models/free_type.rb writes the same rules).
import {
  FONT_SIZE_RANGES, FONT_SIZE_UNITS, FREE_NUMBER_RANGES, fontSizeInRange, fontSizeParts, hundredthsText, twoDecimals,
  type FontSizeUnit, type FreeNumberKey,
} from "../../../schema/tools/rules.ts";
import type { TypefaceToken } from "./document.ts";

export { FONT_SIZE_RANGES, FONT_SIZE_UNITS, FREE_NUMBER_RANGES, hundredthsText, type FontSizeUnit, type FreeNumberKey };

export const FREE_TYPE_KEYS = ["fontSize", "fontWeight", "letterSpacing", "lineHeight", "letterWidth"] as const;
export type FreeTypeKey = (typeof FREE_TYPE_KEYS)[number];

// The block types that take free type: those that take a type step and a
// typeface (the schema's textStyle).
export const FREE_TYPE_BLOCKS = ["heading", "text", "quote"] as const;

export function isFreeTypeKey(key: unknown): key is FreeTypeKey {
  return typeof key === "string" && (FREE_TYPE_KEYS as readonly string[]).includes(key);
}

// A size, its number and its unit as one string, written one way: the
// schema's fontSize pattern, which document.test.ts holds to the schema.
export type FontSize = `${number}${FontSizeUnit}`;
export const FONT_SIZE_PATTERN = "^(?:0|[1-9][0-9]{0,2})(?:[.][0-9]?[1-9])?(?:px|rem|vw)$";

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

// A weight's name, as the faces' makers name their instances.
export const WEIGHT_NAMES: Readonly<Record<FontWeight, string>> = {
  100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra Bold", 900: "Black",
};

export function isFontWeight(value: unknown): value is FontWeight {
  return typeof value === "number" && (FONT_WEIGHTS as readonly number[]).includes(value);
}

// What each face draws, read from its font file (cms/app/assets/fonts;
// free-type.fonts.test.ts reads their axes): Archivo, the headings' face,
// every weight from 100 to 900, and widths from 62% to 125%; Source Serif 4,
// the body's, from 200 to 900, and one width only, so a letter width does
// nothing in it.
export const FACE_AXES: Readonly<Record<TypefaceToken, { weights: readonly FontWeight[]; width: boolean }>> = {
  heading: { weights: FONT_WEIGHTS, width: true },
  body: { weights: [200, 300, 400, 500, 600, 700, 800, 900], width: false },
};

// A size the schema and the rules take: its number, that number in
// hundredths, and its unit; null for any other value.
export function fontSizeOf(value: unknown): { number: number; hundredths: number; unit: FontSizeUnit } | null {
  const parts = fontSizeParts(value);
  return parts !== null && fontSizeInRange(parts) ? { number: parts.hundredths / 100, hundredths: parts.hundredths, unit: parts.unit } : null;
}

// A number of letter spacing, line height or letter width the schema and
// the rules take, or null.
export function freeNumberOf(key: FreeNumberKey, value: unknown): number | null {
  const range = FREE_NUMBER_RANGES[key];
  return typeof value === "number" && value >= range.min && value <= range.max && twoDecimals(value) ? value : null;
}

// A value of free type as the page writes it, in its data attributes and
// in data-style: a size as the schema writes it ("6vw", "48.5px"), a weight
// ("800"), a number with no zero ending its decimals ("-0.02", "62.5");
// null for any value the schema or the rules refuse. Written from the
// number read, so a value that got past neither carries nothing of its own
// to the page.
export function freeTypeText(key: FreeTypeKey, value: unknown): string | null {
  if (key === "fontSize") {
    const size = fontSizeOf(value);
    return size === null ? null : `${hundredthsText(size.hundredths)}${size.unit}`;
  }
  if (key === "fontWeight") return isFontWeight(value) ? String(value) : null;
  const number = freeNumberOf(key, value);
  return number === null ? null : hundredthsText(Math.round(number * 100));
}

// A number as a person types it ("1.5", " 0,95 ", "-.02") read with two
// decimals at most, or null when it is no number or has a third decimal.
// A comma is taken as a decimal point, as a person with another keyboard
// writes one.
export function typedNumber(text: string): number | null {
  const found = /^\s*([+-]?)(\d*)(?:[.,](\d*))?\s*$/.exec(text);
  if (!found || (found[2] === "" && (found[3] ?? "") === "")) return null;
  const decimals = found[3] ?? "";
  if (decimals.replace(/0+$/, "").length > 2) return null;
  const hundredths = Number(found[2] || "0") * 100 + Number(decimals.slice(0, 2).padEnd(2, "0"));
  return (found[1] === "-" && hundredths !== 0 ? -hundredths : hundredths) / 100;
}

// The number as the panel shows it, written as the page writes it.
export function numberText(value: number): string {
  return hundredthsText(Math.round(value * 100));
}
