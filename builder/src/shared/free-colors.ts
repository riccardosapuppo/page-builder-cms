// Free colours: a colour of the site's own choosing, as "#1d4e6f", where a
// palette slot of Site style or a block's colour setting names one instead
// of a curated name. The page carries it as a data attribute (data-bg,
// data-fg, data-line on a block, with their tablet- and phone- forms, and
// data-<slot> on the page root), never as an inline style, which the
// published pages' Content-Security-Policy would block; the rules that
// colour it come from a stylesheet made for the colours the page uses
// (../render/free-colors-css.ts), which the CMS serves from an address that
// is that list (cms/app/models/free_colors.rb writes the same rules).
//
// A free background brings the colours that read on it, as a slot's does
// (tokens.css, bg-<slot>): of the site's Text and Background tones, the one
// that reads better on it is its text, and headings, links, icons and
// captions follow it.
import type { PaletteSlot } from "./document.ts";

// WCAG 2's contrast ratio of two #RRGGBB colours, from 1 to 21.
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type FreeColor = `#${string}`;

// Six lowercase hex digits after #: the one way a document or the site
// style writes a free colour.
export const FREE_COLOR_PATTERN = "^#[0-9a-f]{6}$";
const FREE_COLOR = new RegExp(FREE_COLOR_PATTERN);

export function isFreeColor(value: unknown): value is FreeColor {
  return typeof value === "string" && FREE_COLOR.test(value);
}

// A colour as a person types it ("#1D4E6F", "1d4e6f", "#abc") in the one
// way it is kept, or null when it is not one.
export function normalizeHex(input: string): FreeColor | null {
  const digits = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(digits)) return `#${digits}`;
  if (/^[0-9a-f]{3}$/.test(digits)) return `#${[...digits].map((d) => d + d).join("")}`;
  return null;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Hue in degrees (0 to 360), saturation and value from 0 to 1.
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hexToRgb(hex: FreeColor): Rgb {
  return { r: Number.parseInt(hex.slice(1, 3), 16), g: Number.parseInt(hex.slice(3, 5), 16), b: Number.parseInt(hex.slice(5, 7), 16) };
}

export function rgbToHex({ r, g, b }: Rgb): FreeColor {
  const part = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const chroma = v * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1 ? [chroma, x, 0] : sector < 2 ? [x, chroma, 0] : sector < 3 ? [0, chroma, x] : sector < 4 ? [0, x, chroma] : sector < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = v - chroma;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// The three slots a background in their tone carries the Background
// slot's colour on, and the one it carries the Text slot's colour on with
// headings, links and icons in it too (tokens.css, DARK_SLOTS and
// INK_SLOTS of cms/lib/site_theme/token_css.rb).
export const DARK_SLOTS: readonly PaletteSlot[] = ["text", "primary", "muted"];
export const INK_SLOTS: readonly PaletteSlot[] = ["accent"];

// The site's Text or Background tone, whichever reads better on a free
// background: "dark" when it is the Background tone (the background is the
// darker of the two), "ink" when it is the Text tone.
export function pairingOn(color: FreeColor, site: { text: string; background: string }): "dark" | "ink" {
  return contrastRatio(color, site.background) > contrastRatio(color, site.text) ? "dark" : "ink";
}

// The colour the words take on a background: its paired slot's tone.
export function wordsOn(color: FreeColor, site: { text: string; background: string }): string {
  return pairingOn(color, site) === "dark" ? site.background : site.text;
}
