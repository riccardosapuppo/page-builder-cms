// The renderer as the canvas uses it, in a DOM: what React DOM builds is
// the tree the render contract compared (the contract renders to a string,
// the canvas into the page); the editor's decoration reaches each block's
// root and nothing else; and a change draws again only what it touched.
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { canonical, compareCanonical, parseSections } from "../../test/html-compare.ts";
import { PageSections } from "./blocks.tsx";
import type { Decoration, RawBlock, RenderContext } from "./context.ts";
import { contractMedia } from "./media.tsx";
import { PageRoot } from "./page.tsx";

const drawn = vi.hoisted(() => ({ texts: 0 }));
vi.mock("./rich-text.tsx", async (importOriginal) => {
  const original = await importOriginal<typeof import("./rich-text.tsx")>();
  return {
    ...original,
    renderRichText: (doc: unknown) => {
      drawn.texts += 1;
      return original.renderRichText(doc);
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: Array<() => void> = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

function mount(node: ReactNode): { element: HTMLElement; render: (next: ReactNode) => void } {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  act(() => root.render(node));
  mounted.push(() => {
    act(() => root.unmount());
    element.remove();
  });
  return { element, render: (next) => act(() => root.render(next)) };
}

const ctx: RenderContext = { media: contractMedia };
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(repoRoot, "contract", "fixtures", name), "utf8"));

test.each(["edge.json", "traps-text.json", "traps-media.json", "traps-structure.json"])(
  "%s: React DOM builds the tree the contract compared",
  (name) => {
    const document = fixture(name);
    const { element } = mount(<PageSections document={document} ctx={ctx} />);
    const result = compareCanonical(canonical(parseSections(renderToStaticMarkup(<PageSections document={document} ctx={ctx} />))), canonical(parseSections(element.innerHTML)), name);
    expect(result.message ?? "").toBe("");
    expect(result.nodes.react).toBeGreaterThan(50);
  },
);

const heading = (id: string, text: string): RawBlock => ({ id, type: "heading", props: { level: 2, text }, children: [], style: { base: {} } });
const textBlock = (id: string, words: string, style: object = { base: {} }): RawBlock => ({
  id, type: "text", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }, children: [], style,
});
const page = (widgets: RawBlock[]) => ({
  schemaVersion: 1,
  title: "Canvas",
  sections: [{ id: "s1", type: "section", props: {}, style: { base: {} }, children: [{ id: "c1", type: "column", props: {}, style: { base: {} }, children: widgets }] }],
});

test("the canvas's decoration reaches each block's root; the page's own attributes win", () => {
  const ref = { current: null as HTMLElement | null };
  const decorated: RenderContext = {
    media: contractMedia,
    useDecoration: (block): Decoration | undefined =>
      block.id === "h1"
        ? {
            attributes: { tabIndex: 0, "data-selected": "true", className: "editor-own", "data-block-id": "forged", dangerouslySetInnerHTML: { __html: "<b>x</b>" } },
            ref,
            after: <span className="editor-bar">Heading</span>,
          }
        : undefined,
  };
  const { element } = mount(<PageSections document={page([heading("h1", "Winter"), heading("h2", "Summer")])} ctx={decorated} />);
  const root = element.querySelector<HTMLElement>('[data-block-id="h1"]')!;
  expect(root.getAttribute("tabindex")).toBe("0");
  expect(root.dataset.selected).toBe("true");
  expect(root.className).toBe("w w-heading size-heading-2");
  expect(root.innerHTML).toBe('<h2>Winter</h2><span class="editor-bar">Heading</span>');
  expect(ref.current).toBe(root);
  expect(element.querySelector('[data-block-id="h2"]')!.outerHTML).toBe('<div class="w w-heading size-heading-2" data-block-id="h2" data-block-type="heading"><h2>Summer</h2></div>');
});

test("a change draws again the blocks on its way down, and a text only when its document changed", () => {
  const renders = new Map<string, number>();
  const counting: RenderContext = {
    media: contractMedia,
    useDecoration: (block) => {
      renders.set(String(block.id), (renders.get(String(block.id)) ?? 0) + 1);
      return undefined;
    },
  };
  const first = page([heading("h1", "Winter"), textBlock("t1", "Cold swims."), heading("h2", "Summer")]);
  drawn.texts = 0;
  const { element, render } = mount(<PageSections document={first} ctx={counting} />);
  expect(Object.fromEntries(renders)).toEqual({ s1: 1, c1: 1, h1: 1, t1: 1, h2: 1 });
  expect(drawn.texts).toBe(1);

  // A new heading text: a new heading, column, section and page, as the
  // editor's commands make them; the other blocks are the same objects.
  const column = first.sections[0]!.children[0]!;
  const second = { ...first, sections: [{ ...first.sections[0]!, children: [{ ...column, children: [heading("h1", "Winter swims"), column.children[1]!, column.children[2]!] }] }] };
  render(<PageSections document={second} ctx={counting} />);
  expect(Object.fromEntries(renders)).toEqual({ s1: 2, c1: 2, h1: 2, t1: 1, h2: 1 });
  expect(element.querySelector('[data-block-id="h1"]')!.textContent).toBe("Winter swims");

  // The text's style changes and its document does not: the block draws
  // again, its text does not.
  const old = column.children[1]!;
  const third = { ...second, sections: [{ ...second.sections[0]!, children: [{ ...column, children: [second.sections[0]!.children[0]!.children[0]!, { ...old, style: { base: { align: "center" } } }, column.children[2]!] }] }] };
  render(<PageSections document={third} ctx={counting} />);
  expect(renders.get("t1")).toBe(2);
  expect(drawn.texts).toBe(1);
  expect(element.querySelector('[data-block-id="t1"]')!.className).toBe("w w-text align-center");
});

test("the page root carries the site style the server would, and the width the canvas gives it", () => {
  const siteStyle = {
    palette: { primary: "harbour", accent: "not-a-tone", text: "ink" },
    typeScale: "strong",
    letterWidth: "widest",
    choices: { palette: { primary: [{ color: "sea" }, { color: "harbour" }], accent: [{ color: "buoy" }], text: [{ color: "ink" }] }, typeScales: [{ name: "balanced" }, { name: "strong" }], letterWidths: [{ name: "normal" }, { name: "widest" }] },
  };
  const { element } = mount(<PageRoot document={page([heading("h1", "Winter")])} ctx={ctx} siteStyle={siteStyle} width={768} landmark={false} />);
  const site = element.firstElementChild as HTMLElement;
  expect(site.className).toBe("site");
  expect({ ...site.dataset }).toEqual({ primary: "harbour", text: "ink", typeScale: "strong", letterWidth: "widest" });
  expect(site.style.width).toBe("768px");
  expect(site.querySelector(":scope > .sw > .sw-main > section.sec")).not.toBeNull();
  expect(element.querySelector("main")).toBeNull();
});
