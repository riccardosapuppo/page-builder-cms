// What the editor's chrome needs from the site's tokens (schema/tokens.json,
// imported as it is): the widths at which the published page changes
// layout, which the canvas's width rule marks, and the palette slots with
// their tones, which the Style panel's swatches show in the site's colours.
import tokens from "../../../schema/tokens.json";
import { PALETTE_SLOTS, type PaletteSlot } from "./document.ts";

// The page root's width below which it lays out as a tablet, and as a
// phone: the container queries of the published page's stylesheets.
export const LAYOUT_BREAKPOINTS: Readonly<{ tablet: number; phone: number }> = {
  tablet: tokens.breakpoints.container["tablet-below"],
  phone: tokens.breakpoints.container["phone-below"],
};

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

export { PALETTE_SLOTS };
