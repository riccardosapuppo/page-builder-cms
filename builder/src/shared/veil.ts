// The veil over a section's picture (schema/block-document.schema.json,
// veilToken and veilStrengthToken): a layer of colour over the picture, so
// the words over it read. site.css draws it (.sw-picture::after) in these
// colours and at these strengths, which veil.test.ts holds it to; the
// panel's check and the Assistant's plan measure the words against it here.
//
// A picture can be anything, so the words are measured where it hurts
// them most: under a veil that darkens, where the picture is white; under
// one that lightens, where it is black; of the two, the worse.
import { contrastRatio } from "./free-colors.ts";
import type { VeilStrengthToken, VeilToken } from "./document.ts";

// The neutral veils' colours; the Text tone's is the site's.
export const VEIL_COLORS = { dark: "#000000", light: "#ffffff" } as const;
// How much of the picture each strength hides: the veil's opacity.
export const VEIL_OPACITY: Readonly<Record<VeilStrengthToken, number>> = { light: 0.4, medium: 0.6, strong: 0.8 };
// The strength a veil has when the section names none.
export const VEIL_STRENGTH_DEFAULT: VeilStrengthToken = "medium";

// The site's Text and Background tones, as #rrggbb.
export interface SiteInk {
  text: string;
  background: string;
}

// The colour the words take on a veil, as on a band (site.css): the
// site's Background on a dark veil and on the Text tone's, its Text on a
// light one.
export function wordsOnVeil(veil: Exclude<VeilToken, "none">, site: SiteInk): string {
  return veil === "light" ? site.text : site.background;
}

export function veilColor(veil: Exclude<VeilToken, "none">, site: SiteInk): string {
  return veil === "text" ? site.text : VEIL_COLORS[veil];
}

// `top` laid over `under` at `opacity`, as #rrggbb.
export function over(top: string, under: string, opacity: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5].map((at) => Math.round(channel(top, at) * opacity + channel(under, at) * (1 - opacity)).toString(16).padStart(2, "0")).join("")}`;
}

// The contrast of the words with the veiled picture where the picture is
// worst for them: the veil over a white picture and over a black one, the
// lower of the two.
export function veilContrast(veil: Exclude<VeilToken, "none">, strength: VeilStrengthToken, site: SiteInk): { words: string; ratio: number; worst: "white" | "black" } {
  const words = wordsOnVeil(veil, site);
  const color = veilColor(veil, site);
  const opacity = VEIL_OPACITY[strength];
  const onWhite = contrastRatio(words, over(color, "#ffffff", opacity));
  const onBlack = contrastRatio(words, over(color, "#000000", opacity));
  return onWhite <= onBlack ? { words, ratio: onWhite, worst: "white" } : { words, ratio: onBlack, worst: "black" };
}
