// The editor's icons against the approved design's sprite
// (design/index.html): every i-* symbol is here under its name, shape for
// shape, a group's fill and stroke written on each of its shapes. The
// approved layout's sprite (design/layout/index.html) draws the same
// symbols the same way, and a few more (Block edges): an icon of the
// editor's that the first does not have is the layout's, shape for shape.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { ICONS } from "./icons.tsx";

type Element = DefaultTreeAdapterMap["element"];
const children = (node: { childNodes: DefaultTreeAdapterMap["childNode"][] }): Element[] => node.childNodes.filter((n): n is Element => "tagName" in n);
const all = (node: { childNodes: DefaultTreeAdapterMap["childNode"][] }): Element[] => children(node).flatMap((e) => [e, ...all(e)]);
const attrs = (element: Element) => Object.fromEntries(element.attrs.map((a) => [a.name, a.value]));

function designIcons(...file: string[]): Record<string, { viewBox: string; shapes: Array<[string, Record<string, string>]> }> {
  const html = parseFragment(readFileSync(join(repoRoot, "design", ...file), "utf8"));
  const out: Record<string, { viewBox: string; shapes: Array<[string, Record<string, string>]> }> = {};
  for (const symbol of all(html).filter((e) => e.tagName === "symbol" && (attrs(e).id ?? "").startsWith("i-"))) {
    const shapes: Array<[string, Record<string, string>]> = [];
    for (const shape of children(symbol)) {
      if (shape.tagName === "g") for (const inner of children(shape)) shapes.push([inner.tagName, { ...attrs(shape), ...attrs(inner) }]);
      else shapes.push([shape.tagName, attrs(shape)]);
    }
    out[attrs(symbol).id!.slice(2)] = { viewBox: attrs(symbol).viewBox!, shapes };
  }
  return out;
}

test("every chrome icon of the design is the editor's, shape for shape, and the layout's own come from its sprite", () => {
  const design = designIcons("index.html");
  const layout = designIcons("layout", "index.html");
  expect(Object.keys(design).length).toBeGreaterThan(50);
  expect(Object.keys(layout).length).toBeGreaterThan(50);
  // The two sprites agree on every icon they share.
  for (const name of Object.keys(design).filter((n) => n in layout)) expect({ name, ...layout[name] }).toEqual({ name, ...design[name] });
  const own = Object.keys(ICONS).filter((name) => !(name in design));
  expect(own.filter((name) => !(name in layout))).toEqual([]);
  expect(own).toContain("edges");
  for (const [name, icon] of Object.entries({ ...design, ...Object.fromEntries(own.map((n) => [n, layout[n]!])) })) {
    const ours = ICONS[name as keyof typeof ICONS];
    expect({ name, viewBox: ours?.viewBox, shapes: ours?.shapes }).toEqual({ name, viewBox: icon.viewBox, shapes: icon.shapes });
  }
});
