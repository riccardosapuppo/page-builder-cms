// A block's style as classes and as data-style, the twin of
// cms/app/models/block_style.rb, on the cases its rules are about.
// @vitest-environment node
import { expect, test } from "vitest";
import { classValue, columnWidths, dataStyle, freeColorData, styleClasses, styleValue, visibilityClasses } from "./style.ts";

const style = {
  base: { background: "soft", spaceAbove: "section-s", spaceBelow: "l", spaceBetween: "xl" },
  tablet: { spaceAbove: "section-l", spaceBelow: "none" },
  phone: { background: "none", visibility: "hidden", spaceAbove: "xs" },
};

test("a token becomes a class of its family, and an override the same class with the device first", () => {
  expect(styleClasses(style, "background")).toEqual(["bg-soft", "phone-bg-none"]);
  expect(styleClasses(style, "spaceAbove")).toEqual(["space-above-section-s", "tablet-space-above-section-l", "phone-space-above-xs"]);
  expect(styleClasses(style, "spaceBetween", { family: "cols-gap" })).toEqual(["cols-gap-xl"]);
  expect(styleClasses({ base: { aspect: "16:9" }, phone: { aspect: "original" } }, "aspect")).toEqual(["aspect-16-9", "phone-aspect-original"]);
  expect(classValue("2:1:1")).toBe("2-1-1");
});

test("a fallback stands in for a base value the style does not set, never for an override", () => {
  expect(styleClasses({ base: {} }, "textSize", { fallback: "heading-3" })).toEqual(["size-heading-3"]);
  expect(styleClasses({ base: {}, phone: { textSize: "small" } }, "textSize", { fallback: "large" })).toEqual(["size-large", "phone-size-small"]);
  expect(styleClasses({ base: { textSize: "body" } }, "textSize", { fallback: "large" })).toEqual(["size-body"]);
});

test("a device is hidden where its own value, or else base, says so", () => {
  expect(visibilityClasses(style)).toEqual(["hide-phone"]);
  expect(visibilityClasses({ base: { visibility: "hidden" }, tablet: { visibility: "visible" } })).toEqual(["hide-desktop", "hide-phone"]);
  expect(visibilityClasses({ base: {} })).toEqual([]);
});

test("data-style lists every stored setting the schema allows: devices in order, keys sorted", () => {
  expect(dataStyle(style)).toBe(
    "base.background=soft;base.spaceAbove=section-s;base.spaceBelow=l;base.spaceBetween=xl;tablet.spaceAbove=section-l;tablet.spaceBelow=none;phone.background=none;phone.spaceAbove=xs;phone.visibility=hidden",
  );
  expect(dataStyle({ base: {} })).toBeNull();
  expect(dataStyle(undefined)).toBeNull();
});

test("a value or a key the schema does not list never becomes a class or reaches data-style", () => {
  const hostile = {
    base: { textSize: "huge onclick=alert(1)", color: "#FF0000", background: "#f00", align: "justify", visibility: "maybe", spaceBelow: 24, sectionSpace: "section-l", constructor: "x" },
    desktop: { textSize: "display" },
    tablet: "not an object",
    phone: ["textSize", "display"],
  };
  for (const key of ["textSize", "color", "align", "spaceBelow"] as const) expect(styleClasses(hostile, key)).toEqual([]);
  expect(visibilityClasses(hostile)).toEqual([]);
  expect(dataStyle(hostile)).toBeNull();
  expect(styleValue(hostile, "base", "constructor")).toBeNull();
  expect(styleValue({ base: Object.create({ textSize: "display" }) }, "base", "textSize")).toBeNull();
  expect(styleClasses("not a style", "color")).toEqual([]);
});

test("a free colour is no class: it is a data attribute named by the key's family and the device, and data-style holds it", () => {
  const style = { base: { background: "#1d4e6f", color: "primary" }, tablet: { background: "soft", color: "#c2352b" } };
  expect(styleClasses(style, "background")).toEqual(["tablet-bg-soft"]);
  expect(styleClasses(style, "color")).toEqual(["fg-primary"]);
  expect(freeColorData(style, "background")).toEqual({ bg: "#1d4e6f" });
  expect(freeColorData(style, "color")).toEqual({ "tablet-fg": "#c2352b" });
  expect(freeColorData(style, "color", { family: "line" })).toEqual({ "tablet-line": "#c2352b" });
  expect(dataStyle(style)).toBe("base.background=#1d4e6f;base.color=primary;tablet.background=soft;tablet.color=#c2352b");
  // Written another way, it is no colour the schema allows.
  expect(freeColorData({ base: { background: "#1D4E6F" } }, "background")).toEqual({});
});

test("column widths apply only with one part per column", () => {
  expect(columnWidths({ columnWidths: "1:2" }, 2)).toBe("1:2");
  expect(columnWidths({ columnWidths: "2:1:1" }, 3)).toBe("2:1:1");
  expect(columnWidths({ columnWidths: "1:2:1" }, 2)).toBeNull();
  expect(columnWidths({ columnWidths: "60:40 onclick" }, 2)).toBeNull();
  expect(columnWidths({}, 2)).toBeNull();
  expect(columnWidths(null, 2)).toBeNull();
});
