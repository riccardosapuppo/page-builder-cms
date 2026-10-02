// The widget registry against the schema and the approved design: one
// definition for every widget type the schema has, in the widget panel's
// groups and order, named and drawn as the design's tiles are; and every
// new widget a valid block, on a valid page.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, onTestFinished, test, vi } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { TYPE_NAMES } from "../document/labels.ts";
import { WIDGET_TYPES, type ImageRef, type WidgetType } from "../shared/document.ts";
import { validateBlockSchema, validateDocument } from "../shared/validate.ts";
import { WidgetIcon } from "./icon.tsx";
import { LAYOUT, WIDGETS } from "./registry.ts";
import { newWidget, WIDGET_GROUPS, type AnyWidgetDefinition, type IconData, type InputOf, type WidgetDefinition } from "./types.ts";

type Element = DefaultTreeAdapterMap["element"];
const design = parseFragment(readFileSync(join(repoRoot, "design", "index.html"), "utf8"));
const elements = (root: { childNodes: DefaultTreeAdapterMap["childNode"][] }): Element[] =>
  root.childNodes.flatMap((node) => ("tagName" in node ? [node, ...elements(node)] : []));
const all = elements(design);
const attr = (element: Element, name: string) => element.attrs.find((a) => a.name === name)?.value;
const textOf = (element: Element): string =>
  element.childNodes.map((node) => ("value" in node ? node.value : "tagName" in node ? textOf(node) : "")).join("");

// The design's Add panel: each group's title and its tiles' labels and symbols.
function designPanel(): Array<{ title: string; tiles: Array<{ label: string; symbol: string }> }> {
  const panel = all.find((e) => e.tagName === "section" && attr(e, "data-states") === "drag history");
  if (!panel) throw new Error("design/index.html has no Add panel");
  return elements(panel).filter((e) => e.tagName === "div" && attr(e, "class") === "group").map((group) => {
    const title = textOf(elements(group).find((e) => e.tagName === "h3")!);
    const tiles = elements(group).filter((e) => e.tagName === "button" && (attr(e, "class") ?? "").split(" ").includes("tile")).map((tile) => ({
      label: textOf(elements(tile).find((e) => e.tagName === "span")!),
      symbol: attr(elements(tile).find((e) => e.tagName === "use")!, "href")!.slice(1),
    }));
    return { title, tiles };
  });
}

// A symbol of the design's sprite as IconData.
function designSymbol(id: string): IconData {
  const symbol = all.find((e) => e.tagName === "symbol" && attr(e, "id") === id);
  if (!symbol) throw new Error(`design/index.html has no symbol ${id}`);
  return {
    viewBox: attr(symbol, "viewBox")!,
    shapes: elements(symbol).map((shape) => [shape.tagName, Object.fromEntries(shape.attrs.map((a) => [a.name, a.value]))] as const),
  };
}

test("one definition for every widget type of the schema, each once", () => {
  expect(WIDGETS.map((w) => w.type).sort()).toEqual([...WIDGET_TYPES].sort());
});

test("the widget panel's groups, order and labels are the approved design's (its Form tile comes with stage 5)", () => {
  const panel = designPanel().filter((group) => group.title !== "Layout" && group.title !== "Forms");
  expect(WIDGET_GROUPS.map((g) => g.label)).toEqual(panel.map((g) => g.title));
  const ours = WIDGET_GROUPS.map((g) => ({ title: g.label, tiles: WIDGETS.filter((w) => w.group === g.id).map((w) => ({ label: w.label, symbol: `w-${w.type}` })) }));
  expect(ours).toEqual(panel);
  for (const widget of WIDGETS) expect(widget.label).toBe(TYPE_NAMES[widget.type]);
});

test("each tile's icon is the design's symbol, shape for shape", () => {
  for (const widget of WIDGETS) expect(widget.icon, widget.type).toEqual(designSymbol(`w-${widget.type}`));
  expect(LAYOUT.section.icon).toEqual(designSymbol("w-section"));
  for (const choice of LAYOUT.columns) expect(choice.icon, choice.label).toEqual(designSymbol(`w-col-${choice.count}`));
  const layout = designPanel().find((g) => g.title === "Layout")!;
  expect(layout.tiles).toEqual([{ label: LAYOUT.section.label, symbol: "w-section" }]);
});

test("each tile draws its shapes under their SVG names, as the design's symbol holds them", () => {
  // React's development build says when a prop is no DOM property
  // (stroke-dasharray handed over as it is written in SVG) and still
  // writes it: the markup alone would not show the fault.
  const said = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => said.mockRestore());
  const icons: Array<[string, IconData]> = [
    ...WIDGETS.map((w): [string, IconData] => [`w-${w.type}`, w.icon]),
    ["w-section", LAYOUT.section.icon],
    ...LAYOUT.columns.map((c): [string, IconData] => [`w-col-${c.count}`, c.icon]),
  ];
  for (const [symbol, icon] of icons) {
    const svg = elements(parseFragment(renderToStaticMarkup(createElement(WidgetIcon, { icon }))))[0]!;
    expect(attr(svg, "viewBox"), symbol).toBe(icon.viewBox);
    const drawn = elements(svg).map((shape) => [shape.tagName, Object.fromEntries(shape.attrs.map((a) => [a.name, a.value]))]);
    expect(drawn, symbol).toEqual(designSymbol(symbol).shapes);
  }
  // The section's dashes are the one hyphenated attribute among them.
  expect(renderToStaticMarkup(createElement(WidgetIcon, { icon: LAYOUT.section.icon }))).toContain('stroke-dasharray="1.5 1.5"');
  expect(said.mock.calls.map((call) => String(call[0]))).toEqual([]);
});

// What the widget panel hands a widget that needs something first.
const library: ImageRef = { mediaId: "m1", alt: "The bay at dawn" };
const external: ImageRef = { url: "https://images.example.org/swim.jpg", decorative: true };
const inputs: { [T in WidgetType]: Array<InputOf[T]> } = {
  heading: [undefined], text: [undefined], button: [undefined], divider: [undefined], spacer: [undefined],
  map: [undefined], iconbox: [undefined], quote: [undefined], accordion: [undefined],
  image: [library, external],
  gallery: [[library], [library, external]],
  video: [{ provider: "youtube", videoId: "M7lc1UVf-VE" }, { provider: "vimeo", videoId: "76979871" }],
};

test("every new widget is a valid block, and a page holding one of each is a valid page", () => {
  const made = WIDGETS.flatMap((widget: AnyWidgetDefinition) =>
    (inputs[widget.type] as unknown[]).map((input, index) => newWidget(widget as WidgetDefinition<WidgetType>, `${widget.type}-${index}`, input as never)),
  );
  for (const block of made) {
    const result = validateBlockSchema(block);
    expect(result.valid ? [] : result.errors, block.id).toEqual([]);
    expect(Object.keys(block)).toEqual(["id", "type", "props", "children", "style"]);
  }
  const page = {
    schemaVersion: 1,
    title: "Every widget",
    sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: made }] }],
  };
  const result = validateDocument(page);
  expect(result.valid ? [] : result.errors).toEqual([]);
  expect(WIDGETS.filter((w) => w.needs !== null).map((w) => [w.type, w.needs])).toEqual([["image", "image"], ["gallery", "images"], ["video", "video"]]);
});

test("a new widget's props are its own: changing one never changes the next", () => {
  for (const widget of WIDGETS) {
    const input = (inputs[widget.type] as unknown[])[0];
    const make = () => (widget as WidgetDefinition<WidgetType>).props(input as never);
    expect(make()).not.toBe(make());
    expect(make()).toEqual(make());
  }
});
