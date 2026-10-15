// Free type (./free-type.ts): what counts as a value of each key, by the
// schema's shape and the application rules' ranges and decimals, and how
// the page writes one; a number as a person types it.
// @vitest-environment node
import { expect, test } from "vitest";
import { fontSizeOf, freeNumberOf, freeTypeText, hundredthsText, isFontWeight, isFreeTypeKey, numberText, typedNumber } from "./free-type.ts";

test("a size is its number and a unit of three, written one way, within its unit's range", () => {
  expect(fontSizeOf("6vw")).toEqual({ number: 6, hundredths: 600, unit: "vw" });
  expect(fontSizeOf("48.5px")).toEqual({ number: 48.5, hundredths: 4850, unit: "px" });
  expect(fontSizeOf("0.05rem")).toBeNull();
  for (const good of ["8px", "320px", "99.99px", "0.5rem", "20rem", "0.5vw", "25vw", "2.25rem"]) expect(freeTypeText("fontSize", good), good).toBe(good);
  for (const bad of [
    "7.99px", "320.01px", "0px", "0.49rem", "20.01rem", "25.01vw", "1000px", "48.50px", "08px", ".5rem", "48 px", "48PX", "3em", "120%", "-4px",
    "1px;color:red", "1px}body{display:none", "calc(1px + 2vw)", "url(https://example.com/x.css)", "48px\n", " 48px", 48, null, ["48px"], {},
  ]) expect(freeTypeText("fontSize", bad), String(bad)).toBeNull();
});

test("a weight is one of the nine hundreds; the numbers are in their ranges with two decimals at most", () => {
  for (const weight of [100, 200, 300, 400, 500, 600, 700, 800, 900]) expect(freeTypeText("fontWeight", weight)).toBe(String(weight));
  for (const bad of [0, 50, 750, 1000, 700.5, "700", "bold", true, null]) expect(isFontWeight(bad), String(bad)).toBe(false);
  expect(freeTypeText("letterSpacing", -0.02)).toBe("-0.02");
  expect(freeTypeText("letterSpacing", -0)).toBe("0");
  expect(freeTypeText("letterSpacing", 0.5)).toBe("0.5");
  expect(freeTypeText("letterSpacing", 0.29)).toBe("0.29");
  expect(freeTypeText("lineHeight", 1.15)).toBe("1.15");
  expect(freeTypeText("letterWidth", 62.5)).toBe("62.5");
  expect(freeTypeText("letterWidth", 1e2)).toBe("100");
  for (const [key, bad] of [["letterSpacing", -0.11], ["letterSpacing", 0.025], ["letterSpacing", "0.02"], ["lineHeight", 0.79], ["lineHeight", 3.01], ["lineHeight", 1.125], ["letterWidth", 62.4], ["letterWidth", 125.5], ["letterWidth", Infinity], ["letterWidth", Number.NaN]] as const) {
    expect(freeNumberOf(key, bad), `${key} ${String(bad)}`).toBeNull();
  }
  expect(isFreeTypeKey("letterWidth")).toBe(true);
  expect(isFreeTypeKey("textSize")).toBe(false);
});

test("a number of hundredths is written with no zero ending its decimals, and a number as a person types it is read with two at most", () => {
  expect([4850, 50, -2, 0, -0, 600, 105, 110, 12345].map(hundredthsText)).toEqual(["48.5", "0.5", "-0.02", "0", "0", "6", "1.05", "1.1", "123.45"]);
  expect(numberText(0.07)).toBe("0.07");
  expect(numberText(1.1)).toBe("1.1");
  expect(typedNumber("1.5")).toBe(1.5);
  expect(typedNumber(" 0,95 ")).toBe(0.95);
  expect(typedNumber("-.02")).toBe(-0.02);
  expect(typedNumber("+4")).toBe(4);
  expect(typedNumber("12.")).toBe(12);
  expect(typedNumber("0.950")).toBe(0.95);
  expect(Object.is(typedNumber("-0"), 0)).toBe(true);
  for (const bad of ["", " ", "-", ".", "1.234", "1e3", "abc", "1.2.3", "--1", "1,2,3"]) expect(typedNumber(bad), bad).toBeNull();
});
