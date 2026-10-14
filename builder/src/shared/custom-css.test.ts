// Custom CSS checked before it is kept or drawn (./custom-css.ts), on the
// cases the CMS's check reads too (contract/custom-css/cases.json): the
// problem each case has, or none, the same on both sides; the stylesheet
// drawn inside the site, stopping at the editor's controls on the canvas;
// and, on the canvas alone, its classes of the site's own renamed as the
// canvas names them, the theme's and everything that is no selector left
// as written.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { CANVAS_CLASS_PREFIX, canvasCss, checkCustomCss, scopedCss } from "./custom-css.ts";

interface Case {
  name: string;
  css?: string;
  repeat?: { text: string; times: number };
  problem: { message: string; line: number } | null;
}
const { cases } = JSON.parse(readFileSync(join(repoRoot, "contract", "custom-css", "cases.json"), "utf8")) as { cases: Case[] };

test("every shared case finds the problem the CMS finds, or none", () => {
  expect(cases.length).toBeGreaterThan(15);
  for (const each of cases) {
    const css = each.css ?? each.repeat!.text.repeat(each.repeat!.times);
    expect(checkCustomCss(css), each.name).toEqual(each.problem);
  }
});

test("the stylesheet is drawn inside the site, and nothing for none; on the canvas it stops at the editor's controls", () => {
  expect(scopedCss("  .a { color: red; }\n")).toBe("@scope (.site) {\n.a { color: red; }\n}\n");
  expect(scopedCss(" \n ")).toBe("");
  expect(scopedCss(".a { color: red; }", ".clamp, .ins")).toBe("@scope (.site) to (.clamp, .ins) {\n.a { color: red; }\n}\n");
});

test("on the canvas, a class of the site's own is renamed in every selector, a theme's is not", () => {
  expect(CANVAS_CLASS_PREFIX).toBe("own-");
  const rename = (css: string) => canvasCss(css);
  expect(rename(".btn { color: red; }")).toBe(".own-btn { color: red; }");
  // Compound, descendant, lists, pseudo-classes and pseudo-elements.
  expect(rename("main .hero.big > h2, .card:hover::after { color: red; }")).toBe("main .own-hero.own-big > h2, .own-card:hover::after { color: red; }");
  expect(rename(":is(.a, .b) :not(.c):has(.d) { margin: 0; }")).toBe(":is(.own-a, .own-b) :not(.own-c):has(.own-d) { margin: 0; }");
  // The theme's own, as the canvas draws them unchanged.
  expect(rename(".hero .sw-btn, .bg-primary .w-heading, .sec, .Hide-desktop { color: red; }")).toBe(".own-hero .sw-btn, .bg-primary .w-heading, .sec, .Hide-desktop { color: red; }");
  // An id, an element, an attribute, the scope root: as written.
  expect(rename("#prices, a[href^=\"/\"], :scope > p { color: red; }")).toBe("#prices, a[href^=\"/\"], :scope > p { color: red; }");
});

test("on the canvas, only selectors change: declarations, strings, comments, addresses and escapes stay", () => {
  const rename = (css: string) => canvasCss(css);
  // A dot in a declaration, a string, a comment, an address.
  expect(rename(".a { transition: opacity .3s; font: 1.5em/1.2 serif; content: \".b\"; }")).toBe(".own-a { transition: opacity .3s; font: 1.5em/1.2 serif; content: \".b\"; }");
  expect(rename("/* .c { } */ .d { background: url(/media/x.e.png); }")).toBe("/* .c { } */ .own-d { background: url(/media/x.e.png); }");
  expect(rename(".f { background: url( \"/a.g.png\" ); }")).toBe(".own-f { background: url( \"/a.g.png\" ); }");
  // An escaped name, or one that goes on past ASCII, is no class of the site's.
  expect(rename(".a\\.b, .café, .x\\:y { color: red; }")).toBe(".a\\.b, .café, .x\\:y { color: red; }");
  // A class in a string of the selector: as written.
  expect(rename("[data-x=\".h\"] .i { color: red; }")).toBe("[data-x=\".h\"] .own-i { color: red; }");
});

test("on the canvas, nested rules and @scope are renamed, @supports only inside selector(), other at-rules as written", () => {
  const rename = (css: string) => canvasCss(css);
  expect(rename(".card { color: red; .btn { color: blue; } &.big { margin: 0; } }")).toBe(".own-card { color: red; .own-btn { color: blue; } &.own-big { margin: 0; } }");
  expect(rename("@media (width < 37.5em) { .a { color: red; } }")).toBe("@media (width < 37.5em) { .own-a { color: red; } }");
  expect(rename("@scope (.card) to (.content) { p { color: red; } }")).toBe("@scope (.own-card) to (.own-content) { p { color: red; } }");
  expect(rename("@supports selector(:has(.a)) and (display: grid) { .b { display: grid; } }")).toBe("@supports selector(:has(.own-a)) and (display: grid) { .own-b { display: grid; } }");
  expect(rename("@layer base.reset { .a { margin: 0; } }\n@layer base.reset;")).toBe("@layer base.reset { .own-a { margin: 0; } }\n@layer base.reset;");
  expect(rename("@keyframes rise { from { opacity: 0; } 50.5% { opacity: .5; } }")).toBe("@keyframes rise { from { opacity: 0; } 50.5% { opacity: .5; } }");
  // Another prefix, and nothing for nothing.
  expect(canvasCss(".a { color: red; }", "p-")).toBe(".p-a { color: red; }");
  expect(canvasCss("")).toBe("");
});
