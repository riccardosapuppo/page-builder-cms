// What every block may have of its own, as the page draws it
// (./block-root.tsx, ./policy.ts; the server's block_root and RenderPolicy
// are held to the same by the render contract and twins.rails.test.ts):
// its classes of the site's own after the theme's, each once, none of the
// theme's names and nothing that is no class name; its anchor as its id,
// on any block; on the canvas, each class with the canvas's prefix
// (OwnClassPrefix). The site's custom CSS beside it (./page.tsx), and a
// sticky header (./theme.tsx).
// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PageSections } from "./blocks.tsx";
import { OwnClassPrefix, type RenderContext } from "./context.ts";
import { CustomCssStyle } from "./page.tsx";
import { siteClasses } from "./policy.ts";
import { SitePart, type PartKind } from "./theme.tsx";

type Raw = Record<string, unknown>;
const ctx: RenderContext = { media: () => null };
const widget = (id: string, type: string, props: Raw): Raw => ({ id, type, props, children: [], style: { base: {} } });
// A page of one section of one column, its own props given.
const page = (sectionProps: Raw, columnProps: Raw, widgets: Raw[]): Raw => ({
  schemaVersion: 1,
  title: "Classes",
  sections: [{ id: "s", type: "section", props: sectionProps, style: { base: {} }, children: [{ id: "c", type: "column", props: columnProps, style: { base: {} }, children: widgets }] }],
});
const host = (markup: string): HTMLElement => {
  const element = window.document.createElement("div");
  element.innerHTML = markup;
  return element;
};
const drawn = (document: Raw, prefix = ""): HTMLElement =>
  host(renderToStaticMarkup(<OwnClassPrefix.Provider value={prefix}><PageSections document={document} ctx={ctx} /></OwnClassPrefix.Provider>));
const root = (where: HTMLElement, id: string): HTMLElement => where.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;

test("every block takes its classes of the site's own after the theme's, and its anchor as its id", () => {
  const where = drawn(page({ className: "hero", anchor: "top" }, { className: "side", anchor: "side" }, [
    widget("h", "heading", { level: 2, text: "Prices", className: "lede big", anchor: "prices" }),
    widget("i", "image", { url: "https://example.com/a.jpg", alt: "The bay", className: "photo", anchor: "photo" }),
    widget("d", "divider", { className: "rule" }),
    widget("b", "button", { label: "Join", href: "#prices" }),
  ]));
  expect([...root(where, "s").classList].at(-1)).toBe("hero");
  expect(root(where, "s").id).toBe("top");
  expect([...root(where, "c").classList].at(-1)).toBe("side");
  expect(root(where, "c").id).toBe("side");
  expect([...root(where, "h").classList].slice(-2)).toEqual(["lede", "big"]);
  expect(root(where, "h").id).toBe("prices");
  expect([...root(where, "i").classList].at(-1)).toBe("photo");
  expect(root(where, "i").id).toBe("photo");
  expect([...root(where, "d").classList].at(-1)).toBe("rule");
  expect(root(where, "d").hasAttribute("id")).toBe(false);
  expect(root(where, "b").hasAttribute("id")).toBe(false);
});

test("on the canvas, each class of the site's own carries the canvas's prefix, so the editor's own btn never reaches it", () => {
  const where = drawn(page({}, {}, [widget("h", "heading", { level: 2, text: "Prices", className: "btn menu", anchor: "prices" })]), "own-");
  const classes = [...root(where, "h").classList];
  expect(classes.slice(-2)).toEqual(["own-btn", "own-menu"]);
  expect(classes).not.toContain("btn");
  expect(root(where, "h").id).toBe("prices");
});

test("a className gives the names that are class names and not the theme's, in order, once each", () => {
  expect(siteClasses("hero big hero")).toEqual(["hero", "big"]);
  expect(siteClasses("hero  big")).toEqual(["hero", "big"]);
  expect(siteClasses("sw-btn hero Hide-desktop sec fill")).toEqual(["hero"]);
  expect(siteClasses("2col hero! café a\tb")).toEqual([]);
  for (const value of [null, 1, {}, [], ""]) expect(siteClasses(value), JSON.stringify(value)).toEqual([]);
});

test("the site's custom CSS: inside the site on a page; on the canvas renamed and stopping at the editor's controls; nothing when it does not keep to the site", () => {
  const style = (css: string, prefix = "", leave?: string): string | null =>
    host(renderToStaticMarkup(<OwnClassPrefix.Provider value={prefix}><CustomCssStyle css={css} leave={leave} /></OwnClassPrefix.Provider>))
      .querySelector("style[data-custom-css]")?.textContent ?? null;
  expect(style(".btn { color: red; }")).toBe("@scope (.site) {\n.btn { color: red; }\n}\n");
  expect(style(".btn { color: red; }", "own-", ".clamp, .ins")).toBe("@scope (.site) to (.clamp, .ins) {\n.own-btn { color: red; }\n}\n");
  expect(style(".btn { color: red; } }")).toBeNull();
  expect(style("")).toBeNull();
});

test("a header that says it is sticky is marked so, with its rows on each device; a footer never is, nor a header that does not say so", () => {
  const part = (sticky?: unknown): Raw => ({ ...page({}, {}, [widget("l", "logo", { name: "Slack Water" })]), ...(sticky === undefined ? {} : { sticky }) });
  const element = (kind: PartKind, document: Raw): Element => host(renderToStaticMarkup(<SitePart kind={kind} document={document} ctx={ctx} />)).firstElementChild!;
  expect(element("header", part(true)).getAttribute("data-sticky")).toBe("1 1 1");
  expect(element("header", part()).hasAttribute("data-sticky")).toBe(false);
  expect(element("header", part(false)).hasAttribute("data-sticky")).toBe(false);
  expect(element("footer", part(true)).hasAttribute("data-sticky")).toBe(false);
});
