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
// ../shared/document.ts, which document.test.ts holds to the schema. A free
// colour a background or a colour names (../shared/free-colors.ts) is no
// class: it is a data attribute (freeColorData), which the stylesheet of
// the page's free colours reads; so is free type (../shared/free-type.ts,
// freeTypeData), which the stylesheet of the page's free type reads; and so
// are a section's picture's veil, strength and focus (pictureData) and
// every block's motion (motionData), which site.css draws.
import { isObject } from "../document/json.ts";
import { COLUMN_WIDTHS_TOKENS, DEVICES, SPACE_TOKENS, STACK_TOKENS, STYLE_TOKENS, type StyleTokens } from "../shared/document.ts";
import { isFreeColor, type FreeColor } from "../shared/free-colors.ts";
import { FREE_TYPE_KEYS, freeTypeText, isFreeTypeKey, type FreeTypeKey } from "../shared/free-type.ts";

export type StyleKey = keyof StyleTokens;

// The settings drawn by data attribute rather than by class: a section's
// picture's, and motion.
type AttributeKey = "veil" | "veilStrength" | "focus" | "motion";

// The class family of each key that becomes a class of its own.
const FAMILY: Readonly<Record<Exclude<StyleKey, "visibility" | FreeTypeKey | AttributeKey>, string>> = {
  spaceInside: "pad",
  spaceBetween: "gap",
  spaceAbove: "space-above",
  spaceBelow: "space-below",
  background: "bg",
  color: "fg",
  textSize: "size",
  typeface: "face",
  align: "align",
  verticalAlign: "valign",
  aspect: "aspect",
};

// The schema's enum for each key. A map, so a key a document makes up
// ("constructor") finds nothing.
const ALLOWED: ReadonlyMap<string, readonly string[]> = new Map(Object.entries(STYLE_TOKENS));

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

// The free colour a background or a colour holds on a device, or null.
export function freeColorOf(style: unknown, device: string, key: "background" | "color"): FreeColor | null {
  if (!isObject(style)) return null;
  const part = Object.hasOwn(style, device) ? style[device] : undefined;
  if (!isObject(part) || !Object.hasOwn(part, key)) return null;
  const value = part[key];
  return isFreeColor(value) ? value : null;
}

// The value of free type a key holds on a device, as the page writes it
// ("6vw", "800", "-0.02"), or null when it holds none the schema and the
// rules take.
export function freeTypeOf(style: unknown, device: string, key: FreeTypeKey): string | null {
  if (!isObject(style)) return null;
  const part = Object.hasOwn(style, device) ? style[device] : undefined;
  if (!isObject(part) || !Object.hasOwn(part, key)) return null;
  return freeTypeText(key, part[key]);
}

// What a setting holds that the schema allows: a token, or for a
// background or a colour a free colour too, or for free type its value as
// the page writes it; null otherwise.
export function settingValue(style: unknown, device: string, key: string): string | null {
  if (key === "background" || key === "color") return styleValue(style, device, key) ?? freeColorOf(style, device, key);
  if (isFreeTypeKey(key)) return freeTypeOf(style, device, key);
  return styleValue(style, device, key);
}

// The data attribute each key of free type is carried by, named after the
// property it sets: a letter width is the face's stretch.
export const FREE_TYPE_FAMILY: Readonly<Record<FreeTypeKey, string>> = {
  fontSize: "font-size",
  fontWeight: "font-weight",
  letterSpacing: "letter-spacing",
  lineHeight: "line-height",
  letterWidth: "font-stretch",
};

// A block's free type as data attributes for BlockRoot's data, named by the
// key's family and the device's prefix as a class is ({ "font-size": "6vw",
// "tablet-font-size": "4vw" }).
export function freeTypeData(style: unknown): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of FREE_TYPE_KEYS) {
    for (const device of DEVICES) {
      const value = freeTypeOf(style, device, key);
      if (value !== null) data[device === "base" ? FREE_TYPE_FAMILY[key] : `${device}-${FREE_TYPE_FAMILY[key]}`] = value;
    }
  }
  return data;
}

// The keys a section's picture reads, each carried by a data attribute of
// its own: its veil, the veil's strength, the point of it kept in view. No
// class: site.css draws the attributes.
export const PICTURE_FAMILY = { veil: "veil", veilStrength: "veil-strength", focus: "focus" } as const;

// A section's picture's settings as data attributes, named by the key's
// family and the device's prefix as a free colour's are ({ veil: "dark",
// "tablet-veil-strength": "strong", "phone-focus": "top" }): only values the
// schema lists. The section writes them only while it draws its picture.
// The twin of BlockStyle.picture_data.
export function pictureData(style: unknown): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [key, family] of Object.entries(PICTURE_FAMILY)) {
    for (const device of DEVICES) {
      const value = styleValue(style, device, key);
      if (value !== null) data[device === "base" ? family : `${device}-${family}`] = value;
    }
  }
  return data;
}

// How a block comes into view, on every device it says one, as data
// attributes ({ motion: "rise", "phone-motion": "none" }), which site.css
// plays: every block's root carries them (./block-root.tsx). The twin of
// BlockStyle.motion_data.
export function motionData(style: unknown): Record<string, string> {
  const data: Record<string, string> = {};
  for (const device of DEVICES) {
    const value = styleValue(style, device, "motion");
    if (value !== null) data[device === "base" ? "motion" : `${device}-motion`] = value;
  }
  return data;
}

// The free colours of a background or a colour as data attributes for
// BlockRoot's data, named by the key's family and the device's prefix as a
// class is ({ bg: "#1d4e6f", "tablet-bg": "#c2352b" }): a divider's colour
// is the colour of its line (line).
export function freeColorData(style: unknown, key: "background" | "color", options: { family?: string } = {}): Record<string, string> {
  const family = options.family ?? FAMILY[key];
  const data: Record<string, string> = {};
  for (const device of DEVICES) {
    const value = freeColorOf(style, device, key);
    if (value !== null) data[device === "base" ? family : `${device}-${family}`] = value;
  }
  return data;
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
export function styleClasses(style: unknown, key: Exclude<StyleKey, "visibility" | FreeTypeKey | AttributeKey>, options: ClassOptions = {}): string[] {
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
// schema allows (a free colour and free type too, as the page writes them),
// devices in this order and keys sorted, or null when there is none. Keys are sorted by code unit, Ruby by byte; every key that can
// be written is ASCII, where the two orders are the same.
export function dataStyle(style: unknown): string | null {
  const pairs: string[] = [];
  for (const device of DEVICES) {
    const part = isObject(style) && Object.hasOwn(style, device) ? style[device] : undefined;
    if (!isObject(part)) continue;
    for (const key of Object.keys(part).sort()) {
      const value = settingValue(style, device, key);
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

// A section's stack when the schema lists it and the section has columns
// to stack, two or more; null otherwise, and they stack on tablets and
// phones.
export function stack(props: unknown, count: number): string | null {
  const value = isObject(props) && Object.hasOwn(props, "stack") ? props.stack : undefined;
  return typeof value === "string" && (STACK_TOKENS as readonly string[]).includes(value) && count >= 2 ? value : null;
}
