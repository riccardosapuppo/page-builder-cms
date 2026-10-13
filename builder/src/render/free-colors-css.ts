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

// The rules of one device for the free colours: the attribute's prefix is
// the device's, as a class's is (data-tablet-bg).
function deviceRules(prefix: string, colors: readonly FreeColor[], site: { text: string; background: string }): string[] {
  const rules: string[] = [];
  for (const color of colors) {
    const background = freeBackground(color, site);
    rules.push(`[data-${prefix}bg="${color}"] { ${background.declarations} }`);
    rules.push(`[data-${prefix}bg="${color}"] > * { --ring-color: ${background.ring}; }`);
    rules.push(`[data-${prefix}fg="${color}"] { color: ${color}; }`);
    rules.push(`[data-${prefix}line="${color}"] { --line-color: ${color}; }`);
  }
  return rules;
}

// A tablet or phone override in a slot's tone on a block whose own colour
// is free: tokens.css draws it, but before this stylesheet, whose base rule
// for the free colour would otherwise win on that device too. The same
// declarations again, on the blocks that have a free colour.
function overridesOverFree(prefix: string): string[] {
  const rules: string[] = [];
  for (const slot of ["none", ...PALETTE_SLOTS] as const) {
    const background = slotBackground(slot);
    rules.push(`[data-bg].${prefix}bg-${slot} { ${background.declarations} }`);
    rules.push(`[data-bg].${prefix}bg-${slot} > * { --ring-color: ${background.ring}; }`);
  }
  for (const slot of PALETTE_SLOTS) rules.push(`[data-fg].${prefix}fg-${slot} { color: var(--sw-${slot}); }`);
  for (const slot of PALETTE_SLOTS) rules.push(`[data-line].${prefix}line-${slot} { --line-color: var(--sw-${slot}); }`);
  return rules;
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
    out.push(...deviceRules("", colors, site));
    for (const device of DEVICES) {
      if (device === "base") continue;
      out.push(`@container site (${QUERIES[device]}) {`);
      out.push(...deviceRules(`${device}-`, colors, site).map((rule) => `  ${rule}`));
      out.push(...overridesOverFree(`${device}-`).map((rule) => `  ${rule}`));
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
