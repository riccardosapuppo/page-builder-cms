// The Type group's preset (./type.ts): what a heading, a text or a quote
// draws with no type of its own, read as the page's stylesheets draw it
// (the step's size and line height in tokens.css, from tokens.json, and
// the faces' weight and letter spacing in site.css, which this test reads);
// the weights a face offers; a size in another unit.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { cmsStylesheets } from "../../../build/paths.ts";
import type { Block } from "../../shared/document.ts";
import { stepType } from "../../shared/site-tokens.ts";
import { convertSize, FACE_TRACKING, FACE_WEIGHT, faceOn, presetText, typePreset, weightSteps } from "./type.ts";

const block = (type: "heading" | "text" | "quote", style: object = { base: {} }) => ({ id: "b", type, props: {}, children: [], style }) as unknown as Block;

test("the faces' weight and letter spacing are site.css's", () => {
  const css = readFileSync(join(cmsStylesheets, "site.css"), "utf8");
  const tracking = (selector: string) => Number(new RegExp(`${selector.replace(/[.]/g, "[.]")} \\{ --face-tracking: (-?[.0-9]+)em; \\}`).exec(css)?.[1]);
  expect(tracking(".w")).toBe(FACE_TRACKING.other);
  expect(tracking(".w.size-display")).toBe(FACE_TRACKING.display);
  expect(/\.w-heading \{[^}]*font-weight: (\d+);/.exec(css)?.[1]).toBe(String(FACE_WEIGHT.heading));
  // The body's face takes its column's weight, which nothing sets: the
  // browser's own, 400.
  expect(css).not.toMatch(/\.(sw|col) \{[^}]*font-weight/);
});

test("a step draws its size and line height on each device, the desktop's growing between pages 800 and 1280 wide", () => {
  expect(stepType("balanced", "display", "desktop", 1280)).toEqual({ size: 76, lineHeight: 1 });
  expect(stepType("balanced", "display", "desktop", 1440)).toEqual({ size: 76, lineHeight: 1 });
  expect(stepType("balanced", "display", "desktop", 800)).toEqual({ size: 52, lineHeight: 1 });
  // tokens.json's own figure for the 832 canvas.
  expect(stepType("balanced", "display", "desktop", 832).size).toBeCloseTo(53.6, 6);
  expect(stepType("balanced", "heading-2", "tablet", 768)).toEqual({ size: 33, lineHeight: 1.12 });
  expect(stepType("strong", "display", "phone", 390)).toEqual({ size: 48, lineHeight: 1.05 });
  expect(stepType("no such scale", "body", "phone", 390)).toEqual(stepType("balanced", "body", "phone", 390));
});

test("the preset is the step's and the face's: a heading in the headings' face, a text and a quote in the body's, unless the block sets one", () => {
  const site = { typeScale: "balanced", letterWidth: "wide" };
  expect(typePreset(block("heading"), "base", "display", site, 1280)).toEqual({ step: "display", face: "heading", size: 76, lineHeight: 1, weight: 700, letterSpacing: -0.022, letterWidth: 112.5 });
  expect(typePreset(block("heading"), "tablet", "heading-2", site, 768)).toMatchObject({ face: "heading", size: 33, lineHeight: 1.12, letterSpacing: -0.015 });
  expect(typePreset(block("text"), "phone", "body", site, 390)).toEqual({ step: "body", face: "body", size: 16, lineHeight: 1.6, weight: 400, letterSpacing: 0, letterWidth: null });
  const set = block("quote", { base: { typeface: "heading" }, phone: { typeface: "body" } });
  expect(faceOn(set, "base")).toBe("heading");
  expect(faceOn(set, "tablet")).toBe("heading");
  expect(faceOn(set, "phone")).toBe("body");
  expect(typePreset(set, "base", "heading-3", { typeScale: "balanced", letterWidth: "normal" }, 1280).letterWidth).toBe(100);
});

test("a face offers the weights it draws, and a weight kept from another face too", () => {
  expect(weightSteps("heading", null).map((step) => step.value)).toEqual(["100", "200", "300", "400", "500", "600", "700", "800", "900"]);
  expect(weightSteps("body", null).map((step) => step.name)).toEqual(["Extra Light, 200", "Light, 300", "Regular, 400", "Medium, 500", "Semibold, 600", "Bold, 700", "Extra Bold, 800", "Black, 900"]);
  expect(weightSteps("body", 100)[0]).toEqual({ value: "100", label: "100", name: "Thin, 100" });
});

test("a size in another unit is the same size on the page, with two decimals", () => {
  expect(convertSize(48, "px", "rem", 1280)).toBe(3);
  expect(convertSize(48, "px", "vw", 1280)).toBe(3.75);
  expect(convertSize(6, "vw", "px", 768)).toBe(46.08);
  expect(convertSize(6, "vw", "rem", 390)).toBe(1.46);
  expect(convertSize(2.5, "rem", "vw", 800)).toBe(5);
  expect(convertSize(33, "px", "px", 390)).toBe(33);
  expect(presetText(-0.015)).toBe("-0.015");
  expect(presetText(0.1 + 0.2)).toBe("0.3");
  expect(presetText(stepType("balanced", "display", "desktop", 832).size)).toBe("53.6");
  expect(presetText(76)).toBe("76");
});
