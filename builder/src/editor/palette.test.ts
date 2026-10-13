// The palette of ready colours (./palette.ts): nineteen hues, each with its
// shades from the lightest to the darkest and, for most, four accents;
// every one a free colour; a colour found back by its name.
// @vitest-environment node
import { expect, test } from "vitest";
import { isFreeColor, hexToRgb, rgbToHsv } from "../shared/free-colors.ts";
import { mainShade, PALETTE, paletteName, shadeOf } from "./palette.ts";

const lightness = (color: string) => rgbToHsv(hexToRgb(color as `#${string}`)).v * (1 - rgbToHsv(hexToRgb(color as `#${string}`)).s / 2);

test("nineteen hues, each with 50 to 900 and, but for the three greys, A100 to A700, every shade a free colour", () => {
  expect(PALETTE.map((hue) => hue.name)).toEqual(["Red", "Pink", "Purple", "Deep purple", "Indigo", "Blue", "Light blue", "Cyan", "Teal", "Green", "Light green", "Lime", "Yellow", "Amber", "Orange", "Deep orange", "Brown", "Grey", "Blue grey"]);
  for (const hue of PALETTE) {
    const names = hue.shades.map(([name]) => name);
    expect(names.slice(0, 10), hue.name).toEqual(["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]);
    expect(names.slice(10), hue.name).toEqual(["Brown", "Grey", "Blue grey"].includes(hue.name) ? [] : ["A100", "A200", "A400", "A700"]);
    for (const [name, color] of hue.shades) expect(isFreeColor(color), `${hue.name} ${name}`).toBe(true);
  }
});

test("a hue's shades go from light to dark, and its swatch is its 500", () => {
  for (const hue of PALETTE) {
    const shades = hue.shades.slice(0, 10).map(([, color]) => lightness(color));
    expect(shades[0]!, hue.name).toBeGreaterThan(shades[9]!);
    expect(mainShade(hue)).toBe(hue.shades[5]![1]);
  }
});

test("a colour of the palette is found back by its hue and shade, and named by them", () => {
  expect(shadeOf("#00796b")).toMatchObject({ name: "700", hue: { name: "Teal" } });
  expect(paletteName("#00796b")).toBe("Teal 700");
  expect(paletteName("#3f51b5")).toBe("Indigo 500");
  expect(shadeOf("#123456")).toBeNull();
  expect(paletteName("#123456")).toBeNull();
});
