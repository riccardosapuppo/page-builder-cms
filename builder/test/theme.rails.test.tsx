// @vitest-environment node
//
// The site's header and footer as the editor draws them (src/render/
// theme.tsx, from GET /api/site) against the ones the CMS serves around
// every page (layouts/public.html.erb, from the same values): the same
// elements, attributes and text, compared the way the render contract
// compares a page's sections (html-compare.ts). The CMS's 404 page has the
// layout and needs no page of its own. Locked, as the canvas draws them,
// the two differ only by the marks that lock them.
//
// The storage contract, run at the same time by another file, changes the
// header and footer for a moment and puts them back: the page is served
// again until they held still around it (./style-served.ts), and drawn
// from what was stored then. Where the header folds for a longer menu is
// ../src/render/header-fit.rails.test.ts's to show, on generated headers.
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, inject, test } from "vitest";
import { SiteFooter, SiteHeader } from "../src/render/theme.tsx";
import { createRailsAdapter } from "../src/storage/rails.ts";
import { canonical, compareCanonical, findElement } from "./html-compare.ts";
import { servedWithSite } from "./style-served.ts";

type Node = DefaultTreeAdapterMap["node"];

const cms = inject("cmsUrl");
const adapter = createRailsAdapter({ apiBase: `${cms}/api` });

async function page404(): Promise<{ header: Node[]; footer: Node[] }> {
  const response = await fetch(`${cms}/no-such-page`);
  expect(response.status).toBe(404);
  const document = parse(await response.text());
  const part = (tag: string) => {
    const element = findElement(document, (e) => e.tagName === tag);
    if (!element) throw new Error(`the CMS's page has no <${tag}>`);
    return [element as Node];
  };
  return { header: part("header"), footer: part("footer") };
}

const drawn = (html: string): Node[] => {
  const document = parse(`<!doctype html><html><body>${html}</body></html>`);
  const body = findElement(document, (e) => e.tagName === "body");
  return [...(body?.childNodes ?? [])];
};

test("the editor draws the site's header and footer as the CMS serves them", async () => {
  const { served: page, stored: site } = await servedWithSite(adapter, page404);
  expect(site.menu.length).toBeGreaterThan(0);
  const header = compareCanonical(canonical(page.header), canonical(drawn(renderToStaticMarkup(<SiteHeader site={site} />))), "header");
  expect(header.message).toBeUndefined();
  const footer = compareCanonical(canonical(page.footer), canonical(drawn(renderToStaticMarkup(<SiteFooter site={site} />))), "footer");
  expect(footer.message).toBeUndefined();
  console.log(`theme: header ${header.nodes.react} nodes and footer ${footer.nodes.react} nodes as the CMS serves them`);
});

test("locked, as on the canvas, they differ only by being inert and marked as the site's", async () => {
  const { served: page, stored: site } = await servedWithSite(adapter, page404);
  const html = renderToStaticMarkup(<><SiteHeader site={site} locked /><SiteFooter site={site} locked /></>);
  const [header, footer] = drawn(html).filter((node): node is DefaultTreeAdapterMap["element"] => "tagName" in node);
  expect(header?.attrs).toEqual(expect.arrayContaining([{ name: "inert", value: "" }, { name: "data-theme-part", value: "header" }]));
  expect(footer?.attrs).toEqual(expect.arrayContaining([{ name: "inert", value: "" }, { name: "data-theme-part", value: "footer" }]));
  const unlock = (lines: ReturnType<typeof canonical>) => lines.map((l) => ({ ...l, line: l.line.replace(/ data-theme-part="(header|footer)"| inert=""/g, "") }));
  expect(compareCanonical(canonical(page.header), unlock(canonical([header!]))).message).toBeUndefined();
  expect(compareCanonical(canonical(page.footer), unlock(canonical([footer!]))).message).toBeUndefined();
});
