// The widget registry against the schema and the approved design: one
// definition for every widget type the schema has, in the design's
// groups and order, named as the design's tiles are, and the widgets made
// after it in a group of their own; each tile's icon drawn as it is held
// (Lucide's, held to its file by ../editor/icons.test.ts); and every new
// widget a valid block, on a valid page.
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
import { WIDGET_A11Y } from "./a11y-all.ts";
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

// The widgets made after the approved design, which drew the site's header
// and footer as fixed parts of the theme: the blocks a header and a footer
// are made of, in the last group, of their own.
const AFTER_DESIGN: readonly WidgetType[] = ["logo", "menu"];
const AFTER_DESIGN_GROUP = "site";

test("one definition for every widget type of the schema, each once", () => {
  expect(WIDGETS.map((w) => w.type).sort()).toEqual([...WIDGET_TYPES].sort());
});

test("Insert's groups, order and labels are the approved design's widget tiles', and the widgets after it come last, in a group of their own", () => {
  const panel = designPanel().filter((group) => group.title !== "Layout");
  const groups = WIDGET_GROUPS.filter((g) => g.id !== AFTER_DESIGN_GROUP);
  expect(groups.map((g) => g.label)).toEqual(panel.map((g) => g.title));
  const ours = groups.map((g) => ({ title: g.label, tiles: WIDGETS.filter((w) => w.group === g.id).map((w) => ({ label: w.label, symbol: `w-${w.type}` })) }));
  expect(ours).toEqual(panel);
  expect(WIDGET_GROUPS.at(-1)?.id).toBe(AFTER_DESIGN_GROUP);
  expect(WIDGETS.filter((w) => w.group === AFTER_DESIGN_GROUP).map((w) => w.type)).toEqual(AFTER_DESIGN);
  for (const widget of WIDGETS) expect(widget.label).toBe(TYPE_NAMES[widget.type]);
  // The design's Layout group: the section, which Insert offers as the
  // choice of its columns.
  const layout = designPanel().find((g) => g.title === "Layout")!;
  expect(layout.tiles).toEqual([{ label: LAYOUT.section.label, symbol: "w-section" }]);
});

test("each tile draws its icon's shapes under their SVG names, on Lucide's grid", () => {
  // React's development build says when a prop is no DOM property (an
  // attribute handed over as it is written in SVG) and still writes it:
  // the markup alone would not show the fault.
  const said = vi.spyOn(console, "error").mockImplementation(() => {});
  onTestFinished(() => said.mockRestore());
  const icons: Array<[string, IconData]> = [
    ...WIDGETS.map((w): [string, IconData] => [w.type, w.icon]),
    ...LAYOUT.columns.map((c): [string, IconData] => [c.label, c.icon]),
  ];
  for (const [what, icon] of icons) {
    const svg = elements(parseFragment(renderToStaticMarkup(createElement(WidgetIcon, { icon }))))[0]!;
    expect(attr(svg, "viewBox"), what).toBe("0 0 24 24");
    const drawn = elements(svg).map((shape) => [shape.tagName, Object.fromEntries(shape.attrs.map((a) => [a.name, a.value]))]);
    expect(drawn, what).toEqual(icon.shapes.map(([tag, attributes]) => [tag, { ...attributes }]));
  }
  expect(said.mock.calls.map((call) => String(call[0]))).toEqual([]);
});

// What Insert or a "+" hands a widget that needs something first.
const library: ImageRef = { mediaId: "m1", alt: "The bay at dawn" };
const external: ImageRef = { url: "https://images.example.org/swim.jpg", decorative: true };
const inputs: { [T in WidgetType]: Array<InputOf[T]> } = {
  heading: [undefined], text: [undefined], button: [undefined], divider: [undefined], spacer: [undefined],
  map: [undefined], iconbox: [undefined], quote: [undefined], accordion: [undefined], form: [undefined],
  logo: [undefined], menu: [undefined],
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

test("every widget has its accessibility test, each case a valid block of its type", () => {
  expect(WIDGET_A11Y.map((test) => test.type)).toEqual(WIDGETS.map((widget) => widget.type));
  const blocks = WIDGET_A11Y.flatMap((test) => {
    expect(test.cases.length, test.type).toBeGreaterThan(0);
    return test.cases.map((c, index) => ({ id: `${test.type}-${index}`, type: test.type, props: c.props, children: [], style: { base: {} } }));
  });
  const page = {
    schemaVersion: 1,
    title: "Every case",
    sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: blocks }] }],
  };
  const result = validateDocument(page);
  expect(result.valid ? [] : result.errors).toEqual([]);
});
