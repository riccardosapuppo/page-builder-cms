// A page as the demo shows it in a tab of its own, where the full system's
// CMS would serve it: the draft as it would be published (Preview), the
// page as it was published in this browser (Publish), or an entry of a
// collection as it was published here, drawn with its collection's
// published template (a Collection list's card leads there). The same
// renderer as the canvas and the same markup as the CMS's page
// (../render/), inside the site's header and footer as the CMS draws them:
// a published page or entry inside the parts published here (or the
// starters, for a part never published), a preview inside the parts'
// drafts; a part's own preview is the home page's, and a template's is its
// draft drawn with an entry's draft (the one its address names, else the
// first published, else values made up from its fields' types). The site
// style is this browser's, the images from the browser's library, the
// collections and entries from its storage, and the shop's settings, by
// which a price is money and Add to cart draws, all read when the page is
// opened.
//
// The demo serves nothing, so the page says so in one line above it, and
// what would leave for the server stays here:
// - a form is not sent: under it, one line says what the full system does
//   with its answers, and sending says it again; Add to cart sends nothing
//   either, and says what the full system does with it, where it draws a
//   form (out of stock, or not a product's, it has nothing to send);
// - a link to another page of the site ("/winter-series", "/") opens that
//   page as the demo draws it, published if it is, its draft if not; a
//   link to an entry ("/news/first-swim") opens it as published here; one
//   to a page or an entry this browser does not have says so, rather than
//   leave for an address the demo's host does not serve.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { mediaResolver } from "../editor/media.ts";
import { PUBLISHED_IN_BROWSER } from "../editor/App.tsx";
import { collectionResolver, previewedEntry, readSiteEntries, sampleEntry, shownEntry, type SiteEntries } from "../editor/collections/content.ts";
import { blockProps } from "../render/block-root.tsx";
import { PageRoot } from "../render/page.tsx";
import type { Decoration, ListedCollection, ListedEntry, RawBlock, RenderContext, ShownEntry } from "../render/context.ts";
import { SITE_THEME } from "virtual:site-theme";
import type { SiteParts } from "../render/theme.tsx";
import type { Collection, Entry, MediaItem, PageSummary, SiteStyle, StorageAdapter } from "../storage/adapter.ts";
import type { ShopSettings } from "../shared/shop.ts";
import { isStorageError } from "../storage/adapter.ts";
import { cartDrawing } from "../widgets/addToCart/drawing.ts";
import { DemoLine } from "./DemoLine.tsx";
import { entryAddress, previewAddress, publishedAddress, type View } from "./views.ts";

export const PREVIEW_LINE = "The draft, as it would be published. In the full system, Rails draws this preview and never stores it.";
export const NOT_PUBLISHED_LINE = "This page is not published in this browser yet: Publish in the editor shows it here.";
export const NO_HOME_LINE = "This browser has no page to show the header and footer on yet: make one in the editor.";
export const FORM_LINE = "In the full system, Rails keeps these answers for the CMS's Form responses.";
export const FORM_NOT_SENT = "Not sent: in the full system, Rails keeps these answers for the CMS's Form responses.";
export const CART_LINE = "In the full system, this puts the product in the visitor's cart, at /cart.";
export const CART_NOT_SENT = "Not added: in the full system, Rails puts the product in the visitor's cart, at /cart.";
export const NO_ENTRY_LINE = "This browser has no such entry: it may have been deleted.";
export const ENTRY_NOT_PUBLISHED_LINE = "This entry is not published in this browser yet: Publish in Collections shows it here.";

// The line above an entry as published here, and above a template's
// preview.
export const entryLine = (prefix: string, slug: string): string =>
  `The entry as published in this browser. In the full system, Rails serves it at /${prefix}/${slug}, with the cache.`;
export const templateNotPublished = (name: string): string =>
  `The template of ${name} is not published in this browser yet: Publish it in the editor, and its entries show here.`;

type Shown =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | {
    kind: "ready";
    document: unknown;
    title: string;
    line: string;
    pages: readonly PageSummary[];
    parts: SiteParts;
    style: SiteStyle;
    media: ReadonlyMap<string, MediaItem>;
    site: SiteEntries | null;
    entry: ShownEntry | null;
    shop: ShopSettings | null;
  };

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// The collection an entry is of, and the entry, among those of this
// browser.
function findEntry(site: SiteEntries | null, entryId: number): { collection: Collection; entry: Entry } | null {
  for (const collection of site?.collections ?? []) {
    const entry = site?.entries.get(collection.id)?.find((one) => one.id === entryId);
    if (entry) return { collection, entry };
  }
  return null;
}

// The pages are listed first: in a browser that has none yet, the first
// listing puts the example site in (withExampleSite), and the page asked
// for may be one of its pages. A preview opened in a fresh browser would
// otherwise read an empty store and say there is nothing there.
export async function readShown(adapter: StorageAdapter, view: View): Promise<Shown> {
  const pages = await adapter.listPages();
  const [partList, style, media, site, shop] = await Promise.all([
    adapter.listParts(), adapter.getSiteStyle(), adapter.listMedia(), adapter.capabilities.collections ? readSiteEntries(adapter) : Promise.resolve(null),
    adapter.capabilities.shop ? adapter.getShop() : Promise.resolve(null),
  ]);
  const settings: ShopSettings | null = shop ? { enabled: shop.enabled, currency: shop.currency, productsCollectionId: shop.productsCollectionId, priceField: shop.priceField } : null;
  const library = new Map(media.map((item) => [item.id, item]));
  const preview = view.kind === "preview";
  // The parts around the page: their drafts in a preview; published, what
  // each published, or its starter, as the CMS draws them.
  const partDocument = async (part: PageSummary): Promise<unknown> => {
    if (preview) return (await adapter.getDraft(part.id)).document;
    if (part.published) return (await adapter.getVersion(part.id, part.published.versionNumber)).document;
    return SITE_THEME.parts[part.kind === "footer" ? "footer" : "header"];
  };
  const [header, footer] = await Promise.all(["header", "footer"].map((kind) => {
    const part = partList.find((p) => p.kind === kind);
    return part ? partDocument(part) : Promise.resolve(SITE_THEME.parts[kind === "footer" ? "footer" : "header"]);
  }));
  const parts: SiteParts = { header, footer };
  const ready = (document: unknown, title: string, line: string, entry: ShownEntry | null = null): Shown =>
    ({ kind: "ready", document, title, line, pages, parts, style, media: library, site, entry, shop: settings });

  // An entry as published here: its collection's published template, with
  // what the entry published.
  if (view.kind === "entry") {
    const found = findEntry(site, view.entryId);
    if (!found) return { kind: "failed", message: NO_ENTRY_LINE };
    const live = found.entry.published;
    if (!live) return { kind: "failed", message: ENTRY_NOT_PUBLISHED_LINE };
    const template = found.collection.template;
    if (!template.published) return { kind: "failed", message: templateNotPublished(found.collection.name) };
    const version = await adapter.getVersion(template.id, template.published.versionNumber);
    return ready(version.document, live.title, entryLine(found.collection.prefix, live.slug), shownEntry(found.collection, { ...live, id: found.entry.id }));
  }

  const opened = await adapter.getPage(view.pageId);
  // A template's preview: its draft, with an entry's draft or made-up
  // values.
  if (opened.page.kind === "template" && preview) {
    const collection = site?.collections.find((one) => one.template.id === opened.page.id);
    const entries = collection ? (site?.entries.get(collection.id) ?? []) : [];
    const picked = collection ? previewedEntry(collection, entries, view.entry ?? null) : null;
    const entry = !collection ? null : picked ? shownEntry(collection, picked) : sampleEntry(collection, new Date());
    return ready(opened.draft.document, `Preview: ${entry?.title ?? opened.draft.document.title}`, PREVIEW_LINE, entry);
  }
  // A part has no page of its own, nor a template: their published view
  // is the home page's.
  const page = opened.page.kind === "page" ? opened : await homeOf(adapter, pages);
  if (!page) return { kind: "failed", message: NO_HOME_LINE };
  if (preview) return ready(page.draft.document, page.draft.document.title, PREVIEW_LINE);
  if (!page.published) return { kind: "failed", message: NOT_PUBLISHED_LINE };
  const version = await adapter.getVersion(page.page.id, page.published.versionNumber);
  return ready(version.document, version.document.title, PUBLISHED_IN_BROWSER);
}

// The home page of this browser, or its first page.
async function homeOf(adapter: StorageAdapter, pages: readonly PageSummary[]) {
  const home = pages.find((p) => p.home) ?? pages[0];
  return home ? adapter.getPage(home.id) : null;
}

// The line under a form, which sending says again, as news.
function FormLine({ line: before, sent: after }: { line: string; sent: string }) {
  const line = useRef<HTMLParagraphElement>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const form = line.current?.parentElement?.querySelector("form");
    if (!form) return;
    // The browser checks the fields first, as on the page: only a form it
    // would send gets here.
    const hold = (event: SubmitEvent) => {
      event.preventDefault();
      setSent(true);
    };
    form.addEventListener("submit", hold);
    return () => form.removeEventListener("submit", hold);
  }, []);
  return <p ref={line} className="demo-form-line chrome" role="status">{sent ? after : before}</p>;
}

const FORM_DECORATION: Decoration = { after: <FormLine line={FORM_LINE} sent={FORM_NOT_SENT} /> };
const CART_DECORATION: Decoration = { after: <FormLine line={CART_LINE} sent={CART_NOT_SENT} /> };

// The line goes under a form, and under Add to cart where it draws one, for
// a product for sale: out of stock or with no price it has nothing to send,
// and for anything else it draws nothing.
function decorationsFor(entry: ShownEntry | null, shop: ShopSettings | null) {
  return (block: RawBlock): Decoration | undefined => {
    if (block.type === "form") return FORM_DECORATION;
    if (block.type === "addToCart" && cartDrawing(blockProps(block), entry, shop)?.state === "forSale") return CART_DECORATION;
    return undefined;
  };
}

// A Collection list's card leads to the entry as the demo draws it.
const entryHref = (_collection: ListedCollection, entry: ListedEntry): string => entryAddress(entry.id);

// The page of the site a path names, as the site's links give it: "/" for
// the home page, "/<slug>" for the others; a fragment or a query is left
// out.
export function pageAt(pages: readonly PageSummary[], href: string): PageSummary | null {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  if (path === "/" || path === "") return pages.find((page) => page.home) ?? null;
  const slug = path.replace(/^\/+|\/+$/g, "");
  return pages.find((page) => page.slug === slug || page.published?.slug === slug) ?? null;
}

// The entry an address of the site names, /<prefix>/<slug>, by its live
// slug, among those published in this browser.
export function entryAt(site: SiteEntries | null, href: string): Entry | null {
  const found = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/.exec(href.split(/[?#]/, 1)[0] ?? "");
  const collection = found ? site?.collections.find((one) => one.prefix === found[1]) : undefined;
  return (collection && site?.entries.get(collection.id)?.find((entry) => entry.published?.slug === found?.[2])) ?? null;
}

export function PageView({ adapter, view }: { adapter: StorageAdapter; view: View }) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    readShown(adapter, view).then(
      (result) => current && setShown(result),
      (error: unknown) => current && setShown({ kind: "failed", message: `This page could not be shown: ${describe(error)}` }),
    );
    return () => {
      current = false;
    };
  }, [adapter, view]);

  useEffect(() => {
    document.body.classList.add("demo-page");
    return () => document.body.classList.remove("demo-page");
  }, []);
  useEffect(() => {
    if (shown.kind === "ready") document.title = shown.title || "Untitled page";
  }, [shown]);

  const ctx = useMemo<RenderContext | null>(() => (shown.kind === "ready"
    ? { media: mediaResolver(shown.media), collections: collectionResolver(shown.site), entry: shown.entry, shop: shown.shop, entryHref, useDecoration: decorationsFor(shown.entry, shown.shop) }
    : null), [shown]);

  // A link to a page of the site, or to an entry, opens it as the demo
  // draws it.
  const follow = (event: MouseEvent<HTMLElement>) => {
    if (shown.kind !== "ready" || event.defaultPrevented || event.button !== 0) return;
    const link = (event.target as Element).closest?.("a[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    const entry = entryAt(shown.site, href);
    if (entry) {
      window.location.assign(new URL(entryAddress(entry.id), window.location.href).href);
      return;
    }
    const page = pageAt(shown.pages, href);
    if (!page) {
      setSaid(`There is no page at ${href.split(/[?#]/, 1)[0]} in this browser.`);
      return;
    }
    // The section the link names comes along ("/#swims"): on the page
    // shown, the browser only scrolls to it.
    const fragment = href.includes("#") ? href.slice(href.indexOf("#")) : "";
    window.location.assign(new URL((page.published ? publishedAddress(page.id) : previewAddress(page.id)) + fragment, window.location.href).href);
  };

  return (
    <>
      <aside className="demo-bar chrome" aria-label="About this page">
        <p>{shown.kind === "ready" ? shown.line : shown.kind === "failed" ? shown.message : "Opening the page…"}</p>
        <p className="demo-bar-said" role="status">{said}</p>
      </aside>
      {shown.kind === "ready" && ctx && (
        <div onClick={follow}>
          <PageRoot document={shown.document} ctx={ctx} siteStyle={shown.style} parts={shown.parts} />
        </div>
      )}
      <DemoLine />
    </>
  );
}
