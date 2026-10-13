// Free colours (./free-colors.ts): what counts as one, a colour as a person
// types it in the one way it is kept, the trips between hex, RGB and HSV
// the picker makes, WCAG's ratio, and which of the site's tones reads on a
// free background.
// @vitest-environment node
import { expect, test } from "vitest";
import { contrastRatio, hexToRgb, hsvToRgb, isFreeColor, normalizeHex, pairingOn, rgbToHex, rgbToHsv, wordsOn } from "./free-colors.ts";

test("a free colour is #rrggbb in lower case, and nothing else", () => {
  for (const good of ["#1d4e6f", "#000000", "#ffffff"]) expect(isFreeColor(good), good).toBe(true);
  for (const bad of ["#1D4E6F", "1d4e6f", "#fff", "#12345g", " #1d4e6f", "#1d4e6f ", "red", "", null, 42, undefined, ["#1d4e6f"]]) expect(isFreeColor(bad), String(bad)).toBe(false);
});

test("a typed colour is kept as #rrggbb: upper case, no hash, three digits and spaces around taken as meant", () => {
  expect(normalizeHex("#1D4E6F")).toBe("#1d4e6f");
  expect(normalizeHex("1d4e6f")).toBe("#1d4e6f");
  expect(normalizeHex("  #ABC ")).toBe("#aabbcc");
  for (const bad of ["#1d4e6", "#1d4e6f0", "#ggg", "blue", "", "#"]) expect(normalizeHex(bad), bad).toBeNull();
});

test("hex to RGB to HSV and back gives the same colour, greys keeping no hue", () => {
  for (const color of ["#1d4e6f", "#c2352b", "#f2a541", "#000000", "#ffffff", "#808080", "#00796b"] as const) {
    expect(rgbToHex(hexToRgb(color)), color).toBe(color);
    expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(color)))), color).toBe(color);
  }
  expect(rgbToHsv(hexToRgb("#808080"))).toMatchObject({ s: 0 });
  expect(rgbToHsv(hexToRgb("#ff0000"))).toEqual({ h: 0, s: 1, v: 1 });
  expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
});

test("WCAG's contrast ratio, the same either way round", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  expect(contrastRatio("#c2352b", "#c2352b")).toBeCloseTo(1, 5);
});

test("a free background takes the site's tone that reads better on it, as the CMS pairs it", () => {
  const site = { text: "#0e2a35", background: "#ffffff" };
  expect(pairingOn("#3b2f5c", site)).toBe("dark");
  expect(pairingOn("#e9dcc3", site)).toBe("ink");
  expect(pairingOn("#f2c94c", site)).toBe("ink");
  expect(wordsOn("#3b2f5c", site)).toBe("#ffffff");
  expect(wordsOn("#e9dcc3", site)).toBe("#0e2a35");
  // A dark site turns it round.
  expect(pairingOn("#e9dcc3", { text: "#f4f1ea", background: "#101418" })).toBe("dark");
});
