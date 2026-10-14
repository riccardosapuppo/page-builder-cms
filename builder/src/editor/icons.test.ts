// The editor's icons against Lucide's files (./lucide/, as
// lucide-static 0.460.0 publishes them): every icon of the chrome, every
// block's tile and every choice of columns is its file's shapes, shape for
// shape and in order; every file there is one the editor draws, drawn as
// Lucide draws it, on a 24 grid with no fill and a round stroke; and the
// licence that came with them is beside them.
// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { expect, test } from "vitest";
import { builderRoot } from "../../build/paths.ts";
import { LAYOUT, WIDGETS } from "../widgets/registry.ts";
import { ICONS } from "./icons.tsx";

type Element = DefaultTreeAdapterMap["element"];
const children = (node: { childNodes: DefaultTreeAdapterMap["childNode"][] }): Element[] => node.childNodes.filter((n): n is Element => "tagName" in n);
const attrs = (element: Element) => Object.fromEntries(element.attrs.map((a) => [a.name, a.value]));
const folder = join(builderRoot, "src", "editor", "lucide");

// A file's root <svg>, its attributes, and its shapes.
function lucide(name: string): { root: Record<string, string>; shapes: Array<[string, Record<string, string>]> } {
  const svg = children(parseFragment(readFileSync(join(folder, `${name}.svg`), "utf8"))).find((e) => e.tagName === "svg");
  if (!svg) throw new Error(`lucide/${name}.svg holds no svg`);
  return { root: attrs(svg), shapes: children(svg).map((shape) => [shape.tagName, attrs(shape)]) };
}

const drawn = [
  ...Object.entries(ICONS).map(([name, icon]) => ({ what: `icon ${name}`, lucide: icon.lucide, shapes: icon.shapes })),
  ...WIDGETS.map((widget) => ({ what: `tile ${widget.type}`, lucide: widget.icon.lucide, shapes: widget.icon.shapes })),
  ...LAYOUT.columns.map((choice) => ({ what: choice.label, lucide: choice.icon.lucide, shapes: choice.icon.shapes })),
];

test("every icon the editor draws is its Lucide file's shapes, shape for shape", () => {
  expect(drawn.length).toBeGreaterThan(70);
  for (const { what, lucide: name, shapes } of drawn) expect({ what, name, shapes }).toEqual({ what, name, shapes: lucide(name).shapes });
});

test("every file of ./lucide is one the editor draws, as Lucide draws it, with Lucide's licence beside them", () => {
  const files = readdirSync(folder);
  expect(files.filter((file) => !file.endsWith(".svg"))).toEqual(["LICENSE"]);
  const icons = files.filter((file) => file.endsWith(".svg")).map((file) => file.slice(0, -".svg".length)).sort();
  expect(icons).toEqual([...new Set(drawn.map((icon) => icon.lucide))].sort());
  for (const name of icons) {
    expect({ name, ...lucide(name).root }).toMatchObject({ name, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" });
  }
  expect(readFileSync(join(folder, "LICENSE"), "utf8")).toMatch(/^ISC License\b/);
});
