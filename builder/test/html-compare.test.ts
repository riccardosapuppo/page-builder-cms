// The comparison of two renders (html-compare.ts): it forgives exactly the
// three things its normalization names, and finds every other difference,
// each shown with a fault planted in a copy of a golden.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "../build/paths.ts";
import { canonical, compareHtml, mainOfPage, parseSections } from "./html-compare.ts";

const golden = readFileSync(join(repoRoot, "contract", "rendered", "traps-text.html"), "utf8");

describe("what the normalization forgives", () => {
  test("the line break the server writes after each block", () => {
    expect(golden).toContain("</div>\n<div");
    expect(compareHtml(golden, golden.replaceAll("</div>\n", "</div>")).equal).toBe(true);
  });

  test("the order of attributes", () => {
    const reordered = golden.replace('<section class="sec" id="traps" data-block-id="t-section"', '<section data-block-id="t-section" id="traps" class="sec"');
    expect(reordered).not.toBe(golden);
    expect(compareHtml(golden, reordered).equal).toBe(true);
  });

  test("the value of a boolean attribute", () => {
    const empty = golden.replace('<details open="open">', "<details open>");
    expect(empty).not.toBe(golden);
    expect(compareHtml(golden, empty).equal).toBe(true);
  });
});

describe("what it finds", () => {
  const plants: Array<[string, string, string]> = [
    ["an attribute value", '<h2><a href="/winter?a=1&amp;c=&#39;3&#39;#join">', '<h2><a href="/winter?a=1&amp;c=&#39;3&#39;#joined">'],
    ["an attribute gone", '<a class="sw-btn" href="tel:+44-20-7946-0958">', '<a class="sw-btn">'],
    ["an attribute added", '<a class="sw-btn">Click me</a>', '<a class="sw-btn" href="javascript:alert(1)">Click me</a>'],
    ["a class in another order", 'class="w w-heading size-heading-1"', 'class="w size-heading-1 w-heading"'],
    ["a space in the text", "  three spaces.", " three spaces."],
    ["a line break inside a block", "Yes: it is text.<br>On two lines", "Yes: it is text.\nOn two lines"],
    ["an element for another", "<em>four</em>", "<i>four</i>"],
    ["an element added", "<p>A quote with nobody named.</p></blockquote>", "<p>A quote with nobody named.</p></blockquote><figcaption></figcaption>"],
    ["a boolean attribute gone", '<details open="open">', "<details>"],
    ["markup where text was", "&lt;b&gt;Bold?&lt;/b&gt;", "<b>Bold?</b>"],
    ["a comment", "<p>No icon is drawn.</p>", "<p>No icon is drawn.<!-- x --></p>"],
  ];
  test.each(plants)("%s", (_name, from, to) => {
    const planted = golden.replace(from, to);
    expect(planted).not.toBe(golden);
    const result = compareHtml(golden, planted, "plant");
    expect(result.equal).toBe(false);
    expect(result.message).toMatch(/^plant: the trees differ at node \d+, in block t-/);
  });
});

test("a served page's main, without the line breaks of its templates around the render", () => {
  // The layout's line break, the render, the view's and the layout's.
  const page = `<!doctype html><html><body><div class="site"><main id="main_content">\n${golden}\n\n</main></div></body></html>`;
  expect(canonical(mainOfPage(page))).toEqual(canonical(parseSections(golden)));
  expect(canonical(mainOfPage(page)).map((l) => l.line)).toEqual(canonical(parseSections(golden.replaceAll("</div>\n", "</div>"))).map((l) => l.line));
  expect(() => mainOfPage("<main><section></section></main>")).toThrow(/templates' line breaks/);
  expect(canonical(mainOfPage("<main>\n\n\n</main>"))).toEqual([]);
  // A line break of the render's own, past the templates', is compared.
  expect(canonical(mainOfPage("<main>\n\n\n\n</main>"))).toEqual([{ line: '#text "\\n"', block: "(page)" }]);
});
