// A block's style ({base, tablet?, phone?}, token names only) as the classes
// the page carries and as its data-style attribute: the twin of
// cms/app/models/block_style.rb.
//
// A token becomes a class of tokens.css (spaceInside "l" is pad-l), and the
// same value overridden on tablets becomes tablet-pad-l, which applies only
// inside the tablet container query. Only the values the schema's enums
// list ever become a class or reach data-style, whatever a document holds,
// so a document that reached the renderer without the schema's check cannot
// write a class of its own choosing. The lists come from
// ../shared/document.ts, which document.test.ts holds to the schema.
import { isObject } from "../document/json.ts";
import {
  ALIGN_TOKENS, ASPECT_TOKENS, BACKGROUND_TOKENS, COLUMN_WIDTHS_TOKENS, DEVICES, PALETTE_SLOTS, SECTION_SPACE_TOKENS,
  SPACE_TOKENS, TYPE_STEPS, VERTICAL_ALIGN_TOKENS, VISIBILITY_TOKENS, type StyleTokens,
} from "../shared/document.ts";

export type StyleKey = keyof StyleTokens;

// The class family of each key that becomes a class of its own.
const FAMILY: Readonly<Record<Exclude<StyleKey, "visibility">, string>> = {
  spaceInside: "pad",
  spaceBetween: "gap",
  spaceAbove: "space-above",
  spaceBelow: "space-below",
  background: "bg",
  color: "fg",
  textSize: "size",
  align: "align",
  verticalAlign: "valign",
  aspect: "aspect",
};

// The schema's enum for each key.
const ALLOWED: ReadonlyMap<string, readonly string[]> = new Map<StyleKey, readonly string[]>([
  ["spaceInside", SPACE_TOKENS],
  ["spaceBetween", SPACE_TOKENS],
  ["spaceAbove", SECTION_SPACE_TOKENS],
  ["spaceBelow", SECTION_SPACE_TOKENS],
  ["background", BACKGROUND_TOKENS],
  ["color", PALETTE_SLOTS],
  ["textSize", TYPE_STEPS],
  ["align", ALIGN_TOKENS],
  ["verticalAlign", VERTICAL_ALIGN_TOKENS],
  ["visibility", VISIBILITY_TOKENS],
  ["aspect", ASPECT_TOKENS],
]);

// The spacing steps, which a spacer's size takes too.
export function isSpaceToken(value: unknown): value is string {
  return typeof value === "string" && (SPACE_TOKENS as readonly string[]).includes(value);
}

// A token as a class name: "16:9" is aspect-16-9.
export function classValue(value: string): string {
  return value.replaceAll(":", "-");
}

// The stored value, if the schema allows it for that key; null otherwise.
export function styleValue(style: unknown, device: string, key: string): string | null {
  if (!isObject(style)) return null;
  const part = Object.hasOwn(style, device) ? style[device] : undefined;
  if (!isObject(part) || !Object.hasOwn(part, key)) return null;
  const value = part[key];
  return typeof value === "string" && (ALLOWED.get(key) ?? []).includes(value) ? value : null;
}

interface ClassOptions {
  // Replaces the key's own family where a block means it differently: a
  // section's spaceBetween is the gap between its columns (cols-gap), a
  // divider's colour the colour of its line (line).
  family?: string;
  // The base value when the style has none (a heading's size by its level).
  fallback?: string;
}

// The classes for one key: the base value (or the fallback), then the
// tablet and phone overrides with their prefix.
export function styleClasses(style: unknown, key: Exclude<StyleKey, "visibility">, options: ClassOptions = {}): string[] {
  const family = options.family ?? FAMILY[key];
  const classes: string[] = [];
  for (const device of DEVICES) {
    let value = styleValue(style, device, key);
    if (value === null && device === "base") value = options.fallback ?? null;
    if (value === null) continue;
    const name = classValue(value);
    classes.push(device === "base" ? `${family}-${name}` : `${device}-${family}-${name}`);
  }
  return classes;
}

// hide-desktop, hide-tablet and hide-phone where the block is hidden. A
// device without an override shows what base says.
export function visibilityClasses(style: unknown): string[] {
  const base = styleValue(style, "base", "visibility") ?? "visible";
  const shown = {
    desktop: base,
    tablet: styleValue(style, "tablet", "visibility") ?? base,
    phone: styleValue(style, "phone", "visibility") ?? base,
  };
  return Object.entries(shown).filter(([, value]) => value === "hidden").map(([device]) => `hide-${device}`);
}

// "base.textSize=display;phone.textSize=heading-1": every stored setting the
// schema allows, devices in this order and keys sorted, or null when there
// is none. Keys are sorted by code unit, Ruby by byte; every key that can
// be written is ASCII, where the two orders are the same.
export function dataStyle(style: unknown): string | null {
  const pairs: string[] = [];
  for (const device of DEVICES) {
    const part = isObject(style) && Object.hasOwn(style, device) ? style[device] : undefined;
    if (!isObject(part)) continue;
    for (const key of Object.keys(part).sort()) {
      const value = styleValue(style, device, key);
      if (value !== null) pairs.push(`${device}.${key}=${value}`);
    }
  }
  return pairs.length === 0 ? null : pairs.join(";");
}

// A section's columnWidths when the schema lists it and it has one part per
// column the section holds; null otherwise, and the columns share the width
// equally. A preset for another count is never stretched to fit.
export function columnWidths(props: unknown, count: number): string | null {
  const value = isObject(props) && Object.hasOwn(props, "columnWidths") ? props.columnWidths : undefined;
  return typeof value === "string" && (COLUMN_WIDTHS_TOKENS as readonly string[]).includes(value) && value.split(":").length === count ? value : null;
}
