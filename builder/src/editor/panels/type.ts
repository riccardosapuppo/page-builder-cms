// What the Type group (./StyleFields.tsx, ./groups.tsx) works with: a
// heading's, a text's or a quote's own type (../../shared/free-type.ts)
// over its preset, the type step and the typeface it is drawn in on the
// device previewed, and that preset itself, as the page's stylesheets draw
// it: the step's size and line height in the site's type scale
// (tokens.css), the face's weight, letter spacing and letter width
// (site.css, and the site style's letter width). The preset is what a key
// left unset shows, said in its field.
import type { Block, Device, TypefaceToken } from "../../shared/document.ts";
import { FACE_AXES, FONT_SIZE_RANGES, WEIGHT_NAMES, type FontSizeUnit, type FontWeight } from "../../shared/free-type.ts";
import { letterWidth, stepType, type TypeStep } from "../../shared/site-tokens.ts";
import { shownValue } from "../device-style.ts";

// The letter spacing the headings' face is drawn with (site.css,
// --face-tracking): a little tighter at the display step. The body's face
// has none. type.test.ts reads site.css to hold these to it.
export const FACE_TRACKING = { display: -0.022, other: -0.015 } as const;

// The weight each face is drawn at when none is set (site.css: 700 for a
// heading and for .face-heading; .face-body takes its column's, the
// theme's 400).
export const FACE_WEIGHT: Readonly<Record<TypefaceToken, FontWeight>> = { heading: 700, body: 400 };

// The font each face is, as the panel names it where it says what the
// font draws.
export const FACE_FONTS: Readonly<Record<TypefaceToken, string>> = { heading: "Archivo", body: "Source Serif 4" };

// The face a block is drawn in on a device: its own there, else the base's,
// else its type's (a heading the headings', a text and a quote the body's).
export function faceOn(block: Block, device: Device): TypefaceToken {
  const own = shownValue(block.style, device, "typeface");
  return own === "heading" || own === "body" ? own : block.type === "heading" ? "heading" : "body";
}

export interface TypePreset {
  step: TypeStep;
  face: TypefaceToken;
  // In pixels.
  size: number;
  lineHeight: number;
  weight: FontWeight;
  // In em.
  letterSpacing: number;
  // A percentage of the width axis, or null for a face with none.
  letterWidth: number | null;
}

// What a block draws on a device with no type of its own, at the step it
// is drawn at there: the step's size and line height in the site's type
// scale at the page's width, and its face's weight, letter spacing and
// letter width.
export function typePreset(block: Block, device: Device, step: TypeStep, site: { typeScale?: string | null | undefined; letterWidth?: string | null | undefined } | null | undefined, pageWidth: number): TypePreset {
  const face = faceOn(block, device);
  const { size, lineHeight } = stepType(site?.typeScale, step, device === "base" ? "desktop" : device, pageWidth);
  return {
    step,
    face,
    size,
    lineHeight,
    weight: FACE_WEIGHT[face],
    letterSpacing: face === "heading" ? (step === "display" ? FACE_TRACKING.display : FACE_TRACKING.other) : 0,
    letterWidth: FACE_AXES[face].width ? Number.parseFloat(letterWidth(site?.letterWidth).display) : null,
  };
}

// The weights a face draws, as a ruler's steps; a weight it does not draw,
// set while the block was in another face, is listed too, so it shows.
export function weightSteps(face: TypefaceToken, set: number | null): Array<{ value: string; label: string; name: string }> {
  const drawn = FACE_AXES[face].weights as readonly number[];
  const weights = set !== null && !drawn.includes(set) ? [...drawn, set].sort((a, b) => a - b) : drawn;
  return weights.map((weight) => ({ value: String(weight), label: String(weight), name: `${WEIGHT_NAMES[weight as FontWeight]}, ${weight}` }));
}

// A size in another unit, the same size on the page: a rem is 16 pixels
// (the root's size, the browser's own), a vw a hundredth of the page's
// width. With two decimals, as a size is written.
export function convertSize(number: number, from: FontSizeUnit, to: FontSizeUnit, pageWidth: number): number {
  const px = from === "px" ? number : from === "rem" ? number * 16 : (number * pageWidth) / 100;
  const converted = to === "px" ? px : to === "rem" ? px / 16 : (px / pageWidth) * 100;
  return Math.round(converted * 100) / 100;
}

// The units a size is written in, as the size field offers them.
export const SIZE_UNITS: ReadonlyArray<{ value: FontSizeUnit; label: string; title: string }> = [
  { value: "px", label: "px", title: "In pixels" },
  { value: "rem", label: "rem", title: "In rem, 16 pixels each, or what the visitor's browser sets" },
  { value: "vw", label: "vw", title: "In vw, a hundredth of the page's width" },
];

// How far an arrow moves a size in each unit (Shift: ten times as far).
export const SIZE_STEP: Readonly<Record<FontSizeUnit, number>> = { px: 1, rem: 0.1, vw: 0.1 };

// A size's range in a unit, as numbers.
export function sizeRange(unit: FontSizeUnit): { min: number; max: number } {
  return { min: FONT_SIZE_RANGES[unit].min / 100, max: FONT_SIZE_RANGES[unit].max / 100 };
}

// A preset's number as a field shows it, to the thousandth where the
// theme has one (a letter spacing of -0.015).
export function presetText(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
