// The stylesheet of a page's free colours (../shared/free-colors.ts): the
// site style's free tones on the page root, and each free colour a block
// names as a background, a text colour and a line colour, on every device.
// The canvas puts it in the editor's page, the browser demo in the pages it
// draws; the CMS serves the same rules (cms/app/models/free_colors.rb).
import { DEVICES, PALETTE_SLOTS, type PaletteSlot } from "../shared/document.ts";
import { DARK_SLOTS, INK_SLOTS, isFreeColor, pairingOn, type FreeColor } from "../shared/free-colors.ts";
import { LAYOUT_BREAKPOINTS, slotTone } from "../shared/site-tokens.ts";

export interface FreeColorsInput {
  // The site's Text and Background tones, as colours.
  text: string;
  background: string;
  // The free tones of Site style's slots.
  slots: Readonly<Partial<Record<PaletteSlot, FreeColor>>>;
  // Every free colour a block of the page names.
  colors: readonly FreeColor[];
}

const QUERIES: Readonly<Record<"tablet" | "phone", string>> = {
  tablet: `${LAYOUT_BREAKPOINTS.phone}px <= width < ${LAYOUT_BREAKPOINTS.tablet}px`,
  phone: `width < ${LAYOUT_BREAKPOINTS.phone}px`,
};

// What a background in a slot's tone sets, as tokens.css has it.
function slotBackground(slot: PaletteSlot | "none"): { declarations: string; ring: string } {
  if (slot === "none") {
    return {
      declarations: "background-color: transparent; color: inherit; --heading-color: inherit; --link-color: inherit; --icon-color: inherit; --mark-disc: inherit; --mark-line: inherit; --caption-color: inherit;",
      ring: "inherit",
    };
  }
  const paired = DARK_SLOTS.includes(slot)
    ? `color: var(--sw-background); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; --mark-disc: var(--sw-background); --mark-line: var(--sw-${slot}); --caption-color: currentColor;`
    : INK_SLOTS.includes(slot)
      ? "color: var(--sw-text); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; --mark-disc: initial; --mark-line: initial; --caption-color: currentColor;"
      : "color: var(--sw-text); --heading-color: initial; --link-color: initial; --icon-color: initial; --mark-disc: initial; --mark-line: initial; --caption-color: initial;";
  return { declarations: `background-color: var(--sw-${slot}); ${paired}`, ring: DARK_SLOTS.includes(slot) ? "var(--sw-background)" : "var(--sw-text)" };
}

// What a free background sets: its colour, and the colours of the slot
// tone that reads on it.
function freeBackground(color: FreeColor, site: { text: string; background: string }): { declarations: string; ring: string } {
  if (pairingOn(color, site) === "dark") {
    return {
      declarations: `background-color: ${color}; color: var(--sw-background); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; --mark-disc: var(--sw-background); --mark-line: ${color}; --caption-color: currentColor;`,
      ring: "var(--sw-background)",
    };
  }
  return {
    declarations: `background-color: ${color}; color: var(--sw-text); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; --mark-disc: initial; --mark-line: initial; --caption-color: currentColor;`,
    ring: "var(--sw-text)",
  };
}

// Which colour wins, as tokens.css has it for the curated tones, kept with
// free colours (a rule weighs what its selector does: one for each
// attribute or class):
// - on one device, a block's own colour wins over the colour its
//   background brings, curated or free: the colour rules come after the
//   background rules, and a slot's colour over a free background is
//   written again, heavier ([data-bg].fg-primary);
// - a tablet's or a phone's own background brings its colour over the
//   desktop's own colour, as a device's slot does: a device's rules weigh
//   two ([data-tablet-bg="..."][data-tablet-bg]), the desktop's one.
//
// One device's rules for the free colours: the attribute's prefix is the
// device's, as a class's is (data-tablet-bg); the desktop's weigh one, a
// device's two.
const attribute = (prefix: string, family: string, color: FreeColor) =>
  prefix === "" ? `[data-${family}="${color}"]` : `[data-${prefix}${family}="${color}"][data-${prefix}${family}]`;

function backgroundRules(prefix: string, colors: readonly FreeColor[], site: { text: string; background: string }): string[] {
  return colors.flatMap((color) => {
    const background = freeBackground(color, site);
    const selector = attribute(prefix, "bg", color);
    return [`${selector} { ${background.declarations} }`, `${selector} > * { --ring-color: ${background.ring}; }`];
  });
}

function colourRules(prefix: string, colors: readonly FreeColor[]): string[] {
  return colors.flatMap((color) => [`${attribute(prefix, "fg", color)} { color: ${color}; }`, `${attribute(prefix, "line", color)} { --line-color: ${color}; }`]);
}

// A slot's colour on a block whose own background is free, on the desktop:
// tokens.css draws it before this stylesheet, whose background rule would
// otherwise bring its own colour over it.
function slotColoursOverFree(): string[] {
  return PALETTE_SLOTS.map((slot) => `[data-bg].fg-${slot} { color: var(--sw-${slot}); }`);
}

// A tablet's or a phone's override in a slot's tone, on a block with a free
// colour of the desktop's: tokens.css draws it before this stylesheet, whose
// rules for the free colour would otherwise win on that device too. The
// same declarations again, weighing two: its background (with the colour
// it brings) over the desktop's free background or colour, before the
// device's own free colours; its colour over those and over the device's
// free background, after them.
function slotBackgroundsOverFree(prefix: string): string[] {
  return (["none", ...PALETTE_SLOTS] as const).flatMap((slot) => {
    const background = slotBackground(slot);
    const selector = `:is([data-bg], [data-fg]).${prefix}bg-${slot}`;
    return [`${selector} { ${background.declarations} }`, `${selector} > * { --ring-color: ${background.ring}; }`];
  });
}

function slotColoursOverDeviceFree(prefix: string): string[] {
  return [
    ...PALETTE_SLOTS.map((slot) => `:is([data-bg], [data-fg], [data-${prefix}bg]).${prefix}fg-${slot} { color: var(--sw-${slot}); }`),
    ...PALETTE_SLOTS.map((slot) => `[data-line].${prefix}line-${slot} { --line-color: var(--sw-${slot}); }`),
  ];
}

// The stylesheet for the free colours of a page: the site style's free
// tones on the page root, then each free colour as a background, a text
// colour and a line colour on every device. Empty when there are none.
export function freeColorsCss(input: FreeColorsInput): string {
  const colors = [...new Set(input.colors.filter(isFreeColor))].sort();
  const slots = PALETTE_SLOTS.filter((slot) => isFreeColor(input.slots[slot]));
  if (colors.length === 0 && slots.length === 0) return "";
  const site = { text: input.text, background: input.background };
  const out: string[] = ["/* Free colours of this page: Site style's own tones, then the colours its blocks name. */"];
  for (const slot of slots) {
    const color = input.slots[slot]!;
    out.push(`.site[data-${slot}="${color}"] { --sw-${slot}: ${color}; }`);
  }
  if (colors.length > 0) {
    out.push(...backgroundRules("", colors, site), ...colourRules("", colors), ...slotColoursOverFree());
    for (const device of DEVICES) {
      if (device === "base") continue;
      const prefix = `${device}-`;
      out.push(`@container site (${QUERIES[device]}) {`);
      const rules = [...backgroundRules(prefix, colors, site), ...slotBackgroundsOverFree(prefix), ...colourRules(prefix, colors), ...slotColoursOverDeviceFree(prefix)];
      out.push(...rules.map((rule) => `  ${rule}`));
      out.push("}");
    }
  }
  return `${out.join("\n")}\n`;
}

// Every free colour a document's blocks name, as a background or a colour,
// on any device.
export function freeColorsOf(document: unknown): FreeColor[] {
  const found: FreeColor[] = [];
  const walk = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (typeof block !== "object" || block === null) continue;
      const style = (block as { style?: unknown }).style;
      if (typeof style === "object" && style !== null) {
        for (const part of Object.values(style)) {
          if (typeof part !== "object" || part === null) continue;
          for (const key of ["background", "color"] as const) {
            const value = (part as Record<string, unknown>)[key];
            if (isFreeColor(value)) found.push(value);
          }
        }
      }
      walk((block as { children?: unknown }).children);
    }
  };
  walk(typeof document === "object" && document !== null ? (document as { sections?: unknown }).sections : undefined);
  return found;
}

// What the stylesheet needs from the site style and the documents a page
// draws (its own, the header's and the footer's).
export function freeColorsFor(palette: Readonly<Record<string, string>> | null | undefined, documents: readonly unknown[]): FreeColorsInput {
  const slots: Partial<Record<PaletteSlot, FreeColor>> = {};
  for (const slot of PALETTE_SLOTS) {
    const value = palette?.[slot];
    if (isFreeColor(value)) slots[slot] = value;
  }
  return {
    text: slotTone("text", palette).hex,
    background: slotTone("background", palette).hex,
    slots,
    colors: documents.flatMap(freeColorsOf),
  };
}
