// @vitest-environment node
//
// The site's header and footer as the editor draws them (src/render/
// theme.tsx, SitePart) against the ones the CMS serves around every page
// (layouts/public.html.erb, site_part): the same elements, attributes and
// text, compared the way the render contract compares a page's sections
// (html-compare.ts). Each is drawn from what the CMS draws it from: the
// version the part published, or, while it has published nothing, its
// starter. The CMS's 404 page has the layout and needs no page of its own.
// Locked, as the canvas draws them, the two differ only by the marks that
// lock them.
//
// Another suite run at the same time may publish a part (the example
// site's does): the page is served again until the parts held still around
// it (./style-served.ts), and drawn from what they were then. Where a menu
// folds for longer links is ../src/render/header-fit.rails.test.ts's to
// show, on generated menus.
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, inject, test } from "vitest";
import { SITE_THEME } from "virtual:site-theme";
import { SitePart, type PartKind } from "../src/render/theme.tsx";
import type { PageSummary } from "../src/storage/adapter.ts";
import { createRailsAdapter } from "../src/storage/rails.ts";
import { canonical, compareCanonical, findElement } from "./html-compare.ts";
import { servedWithParts } from "./style-served.ts";

type Node = DefaultTreeAdapterMap["node"];
const KINDS: readonly PartKind[] = ["header", "footer"];

const cms = inject("cmsUrl");
const adapter = createRailsAdapter({ apiBase: `${cms}/api` });

// The CMS's own page, its header and footer elements; none for a part
// published with no section, which the layout leaves out.
async function page404(): Promise<Record<PartKind, Node[]>> {
  const response = await fetch(`${cms}/no-such-page`);
  expect(response.status).toBe(404);
  const document = parse(await response.text());
  const part = (tag: PartKind) => {
    const element = findElement(document, (e) => e.tagName === tag);
    return element ? [element as Node] : [];
  };
  return { header: part("header"), footer: part("footer") };
}

// What every page draws for each part: the version it published, else its
// starter.
async function liveDocuments(parts: readonly PageSummary[]): Promise<Record<PartKind, unknown>> {
  const live = async (kind: PartKind) => {
    const part = parts.find((p) => p.kind === kind);
    if (!part?.published) return SITE_THEME.parts[kind];
    return (await adapter.getVersion(part.id, part.published.versionNumber)).document;
  };
  return { header: await live("header"), footer: await live("footer") };
}

const drawn = (html: string): Node[] => {
  const document = parse(`<!doctype html><html><body>${html}</body></html>`);
  const body = findElement(document, (e) => e.tagName === "body");
  return [...(body?.childNodes ?? [])];
};
// The starters and the example site's parts hold no library image.
const ctx = { media: () => null };

test("the editor draws the site's header and footer as the CMS serves them, from what each published or its starter", async () => {
  const { served: page, parts } = await servedWithParts(adapter, page404);
  expect(parts.map((part) => part.kind)).toEqual([...KINDS]);
  const live = await liveDocuments(parts);
  for (const kind of KINDS) {
    expect(page[kind], kind).toHaveLength(1);
    const compared = compareCanonical(canonical(page[kind]), canonical(drawn(renderToStaticMarkup(<SitePart kind={kind} document={live[kind]} ctx={ctx} />))), kind);
    expect(compared.message, kind).toBeUndefined();
    console.log(`theme: the ${kind}, ${compared.nodes.react} nodes, as the CMS serves it`);
  }
});

test("locked, as on the canvas, they differ only by being inert and marked as the site's", async () => {
  const { served: page, parts } = await servedWithParts(adapter, page404);
  const live = await liveDocuments(parts);
  for (const kind of KINDS) {
    const [element] = drawn(renderToStaticMarkup(<SitePart kind={kind} document={live[kind]} ctx={ctx} locked />)).filter((node): node is DefaultTreeAdapterMap["element"] => "tagName" in node);
    expect(element?.attrs, kind).toEqual(expect.arrayContaining([{ name: "inert", value: "" }, { name: "data-theme-part", value: kind }]));
    const unlock = (lines: ReturnType<typeof canonical>) => lines.map((l) => ({ ...l, line: l.line.replace(/ data-theme-part="(header|footer)"| inert=""/g, "") }));
    expect(compareCanonical(canonical(page[kind]), unlock(canonical([element!]))).message, kind).toBeUndefined();
  }
});
