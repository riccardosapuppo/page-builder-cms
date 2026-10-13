// What the editor's chrome needs from the site's tokens (schema/tokens.json,
// imported as it is): the widths at which the published page changes
// layout, which the canvas's width rule marks; the palette slots with
// their tones, which the Style panel's swatches and Site style show in the
// site's colours; and each type scale's steps, which Site style lists.
import tokens from "../../../schema/tokens.json";
import { PALETTE_SLOTS, type PaletteSlot } from "./document.ts";

// The page root's width below which it lays out as a tablet, and as a
// phone: the container queries of the published page's stylesheets.
export const LAYOUT_BREAKPOINTS: Readonly<{ tablet: number; phone: number }> = {
  tablet: tokens.breakpoints.container["tablet-below"],
  phone: tokens.breakpoints.container["phone-below"],
};

// The space between a column's widgets when the column sets none: the
// theme's own, in the published page's stylesheet (site.css, --col-gap,
// which site-tokens.test.ts reads to hold the two together).
export const COLUMN_GAP_DEFAULT = "l";

const COLORS: Readonly<Record<string, string>> = tokens.color;
const TONES = tokens["site-tones"];

// The name of a slot as Site style shows it: "Primary".
export function slotLabel(slot: PaletteSlot): string {
  return TONES[slot].label;
}

// A slot's tone in the given palette (slot to colour name, as the site
// style gives it), or the tone a new site starts with: its name, its
// label and its colour.
export function slotTone(slot: PaletteSlot, palette?: Readonly<Record<string, string>> | null): { color: string; label: string; hex: string } {
  const chosen = palette?.[slot];
  const tone = TONES[slot].tones.find((t) => t.color === chosen) ?? TONES[slot].tones.find((t) => t.color === TONES[slot].default) ?? TONES[slot].tones[0]!;
  return { color: tone.color, label: tone.label, hex: COLORS[tone.color] ?? "#000000" };
}

// The tone a slot has on a new site (its default).
export function defaultTone(slot: PaletteSlot): string {
  return TONES[slot].default;
}

// The site style's choices and the style a new site starts with, read as
// the server's SiteTokens reads them (cms/app/models/site_tokens.rb): every
// slot of site-tones in the file's order, its tones with their colours,
// the type scales and the letter widths. For the browser's storage
// adapter, which keeps the site style itself.
export interface SiteStyleChoices {
  palette: Record<string, Array<{ color: string; label: string; hex: string }>>;
  typeScales: Array<{ name: string; label: string }>;
  letterWidths: Array<{ name: string; label: string }>;
}

const SLOT_ENTRIES = Object.entries(TONES).filter(([name]) => !name.startsWith("$")) as Array<[string, { label: string; default: string; tones: Array<{ color: string; label: string }> }]>;

export function siteStyleChoices(): SiteStyleChoices {
  return {
    palette: Object.fromEntries(SLOT_ENTRIES.map(([name, slot]) => [name, slot.tones.map((tone) => ({ color: tone.color, label: tone.label, hex: COLORS[tone.color]! }))])),
    typeScales: tokens["site-type-scale"].choices.map((choice) => ({ name: choice.name, label: choice.label })),
    letterWidths: WIDTHS.choices.map((choice) => ({ name: choice.name, label: choice.label })),
  };
}

export function defaultSiteStyle(): { palette: Record<string, string>; typeScale: string; letterWidth: string } {
  return {
    palette: Object.fromEntries(SLOT_ENTRIES.map(([name, slot]) => [name, slot.default])),
    typeScale: tokens["site-type-scale"].default,
    letterWidth: WIDTHS.default,
  };
}

const WIDTHS = tokens["site-letter-width"];

// The widths a letter-width choice draws the Headings typeface at, by its
// name ("normal"): display for headings and the logo, strong for buttons,
// ui for labels and captions, as tokens.css gives them to the page. The
// default's for a name the tokens do not have.
export function letterWidth(name: string | null | undefined): { display: string; strong: string; ui: string } {
  const choice = WIDTHS.choices.find((c) => c.name === name) ?? WIDTHS.choices.find((c) => c.name === WIDTHS.default)!;
  return { display: choice.display, strong: choice.strong, ui: choice.ui };
}

// The steps of the site's type, largest first, as Site style names them.
export const TYPE_STEPS = [
  { key: "display", label: "Display", sans: true },
  { key: "heading-1", label: "Heading 1", sans: true },
  { key: "heading-2", label: "Heading 2", sans: true },
  { key: "heading-3", label: "Heading 3", sans: true },
  { key: "large", label: "Large text", sans: false },
  { key: "body", label: "Body", sans: false },
  { key: "small", label: "Small", sans: false },
] as const;
export type TypeStep = (typeof TYPE_STEPS)[number]["key"];

interface Steps {
  ratio: { desktop: number };
}
type StepSizes = Record<TypeStep, { desktop: readonly [number, number] }>;

const SCALES = tokens["site-type-scale"];
const TYPE: Readonly<Record<string, unknown>> = tokens.type;

// A type scale's steps in a wide window (size and line height in pixels),
// and how much larger each step is than the next, from the scale's name
// ("balanced"); null for a name the tokens do not have.
export function typeScale(name: string): { ratio: number; steps: Array<{ key: TypeStep; label: string; sans: boolean; size: number; lineHeight: number }> } | null {
  const choice = SCALES.choices.find((c) => c.name === name);
  const scale = choice ? (TYPE[choice.steps] as (Steps & StepSizes) | undefined) : undefined;
  if (!scale) return null;
  return {
    ratio: scale.ratio.desktop,
    steps: TYPE_STEPS.map((step) => {
      const [size, lineHeight] = scale[step.key].desktop;
      return { key: step.key, label: step.label, sans: step.sans, size, lineHeight: Math.round(size * lineHeight) };
    }),
  };
}

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

export { PALETTE_SLOTS };
