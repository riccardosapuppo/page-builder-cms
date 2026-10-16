// A page as the demo shows it in a tab of its own, where the full system's
// CMS would serve it: the draft as it would be published (Preview), the
// page as it was published in this browser (Publish), an entry of a
// collection as it was published here, drawn with its collection's
// published template (a Collection list's card leads there), the cart this
// browser keeps, and an order its checkout made. The same renderer as the
// canvas and the same markup as the CMS's page (../render/), inside the
// site's header and footer as the CMS draws them: a published page, an
// entry, the cart or an order inside the parts published here (or the
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
//   with its answers, and sending says it again;
// - Add to cart puts the product in the cart this browser keeps
//   (./cart-page.ts, by the shop's rules, as the CMS's cart does) and
//   opens the cart, drawn as the CMS draws /cart (./cart-view.tsx), whose
//   forms set a line's quantity and take it out; its Checkout makes an
//   order through the browser's storage (checkoutDemo), marked as the
//   demo's, not paid, and the cart loses what the order took, then the
//   order is shown as the CMS shows a visitor back from Stripe;
// - a link to another page of the site ("/winter-series", "/") opens that
//   page as the demo draws it, published if it is, its draft if not; a
//   link to an entry ("/news/first-swim") opens it as published here, and
//   one to /cart the cart; one to a page or an entry this browser does not
//   have says so, rather than leave for an address the demo's host does
//   not serve.
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { mediaResolver } from "../editor/media.ts";
import { PUBLISHED_IN_BROWSER } from "../editor/App.tsx";
import { collectionResolver, previewedEntry, readSiteEntries, sampleEntry, shownEntry, type SiteEntries } from "../editor/collections/content.ts";
import { PageRoot } from "../render/page.tsx";
import type { Decoration, ListedCollection, ListedEntry, RawBlock, RenderContext, ShownEntry } from "../render/context.ts";
import { SITE_THEME } from "virtual:site-theme";
import type { SiteParts } from "../render/theme.tsx";
import type { Collection, Entry, MediaItem, Order, PageSummary, SiteStyle, StorageAdapter } from "../storage/adapter.ts";
import { addToCart, afterOrder, priceCart, productState, setQuantity, type CartLine, type Currency, type ShopProduct, type ShopSettings } from "../shared/shop.ts";
import { isStorageError } from "../storage/adapter.ts";
import { WORDS } from "../storage/browser-rules.ts";
import { CART_ITEMS } from "../widgets/addToCart/render.tsx";
import { CART_KEY, cartCountWords, cartShown, EMPTY, keepDemoCart, readDemoCart, REFUSED_STATES } from "./cart-page.ts";
import { CartBody, CartHead, OrderBody } from "./cart-view.tsx";
import { DemoLine } from "./DemoLine.tsx";
import { cartAddress, entryAddress, orderAddress, previewAddress, publishedAddress, type View } from "./views.ts";

export const PREVIEW_LINE = "The draft, as it would be published. In the full system, Rails draws this preview and never stores it.";
export const NOT_PUBLISHED_LINE = "This page is not published in this browser yet: Publish in the editor shows it here.";
export const NO_HOME_LINE = "This browser has no page to show the header and footer on yet: make one in the editor.";
export const FORM_LINE = "In the full system, Rails keeps these answers for the CMS's Form responses.";
export const FORM_NOT_SENT = "Not sent: in the full system, Rails keeps these answers for the CMS's Form responses.";
export const NO_ENTRY_LINE = "This browser has no such entry: it may have been deleted.";
export const ENTRY_NOT_PUBLISHED_LINE = "This entry is not published in this browser yet: Publish in Collections shows it here.";
// The cart and an order, above them.
export const CART_VIEW_LINE = "The cart, kept in this browser. In the full system, Rails keeps a visitor's cart in a cookie of its own and serves it at /cart, and Checkout goes to Stripe's checkout, in its test mode.";
export const ORDER_LINE = "An order made in this browser, and nothing was paid. In the full system, Rails sends the visitor to Stripe's checkout, in its test mode, and this page says the order is paid once Stripe does.";
export const SHOP_OFF_LINE = "The shop is off in this browser: the Shop screen in the editor turns it on. In the full system, /cart is the site's 404 page while the shop is off.";
export const NO_ORDER_LINE = "This browser has no such order.";
// What the page of an order says of it, in the site's frame.
export const ORDER_TITLE = "Order made";
export const ORDER_SAID = "Not paid: browser demo. It is listed in the editor's Shop screen, under Orders.";

// The line above an entry as published here, and above a template's
// preview.
export const entryLine = (prefix: string, slug: string): string =>
  `The entry as published in this browser. In the full system, Rails serves it at /${prefix}/${slug}, with the cache.`;
export const templateNotPublished = (name: string): string =>
  `The template of ${name} is not published in this browser yet: Publish it in the editor, and its entries show here.`;

// What the cart is priced and drawn from: the collection the shop sells
// from, its products as they went live, the shop's currency and price
// field, and where an empty cart leads.
export interface CartShop {
  collection: Collection;
  products: ReadonlyMap<number, ShopProduct>;
  published: ReadonlyMap<number, { slug: string; values: unknown }>;
  currency: Currency;
  priceField: string;
  // The page at the products' prefix, published here, as the site's path
  // the CMS gives it; else the home page's.
  shopPath: string;
}

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
    // The cart's page, or an order's.
    cart: CartShop | null;
    order: Order | null;
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

// What the cart is drawn from, while the shop is on and its collection is
// there; null otherwise, when the CMS answers /cart with its 404 page.
export function cartShop(site: SiteEntries | null, shop: ShopSettings | null, pages: readonly PageSummary[]): CartShop | null {
  if (!shop?.enabled || shop.productsCollectionId === null || shop.priceField === null) return null;
  const collection = site?.collections.find((one) => one.id === shop.productsCollectionId);
  if (!collection) return null;
  const live = (site?.entries.get(collection.id) ?? []).flatMap((entry) => (entry.published ? [{ id: entry.id, ...entry.published }] : []));
  return {
    collection,
    products: new Map(live.map((entry) => [entry.id, { id: entry.id, title: entry.title, values: entry.values }])),
    published: new Map(live.map((entry) => [entry.id, { slug: entry.slug, values: entry.values }])),
    currency: shop.currency,
    priceField: shop.priceField,
    shopPath: pages.some((page) => page.published?.slug === collection.prefix) ? `/${collection.prefix}` : "/",
  };
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
  const ready = (document: unknown, title: string, line: string, entry: ShownEntry | null = null, also: { cart?: CartShop; order?: Order } = {}): Shown =>
    ({ kind: "ready", document, title, line, pages, parts, style, media: library, site, entry, shop: settings, cart: also.cart ?? null, order: also.order ?? null });
  const page = (title: string) => ({ schemaVersion: 1, title, sections: [] });

  // The cart, and an order its checkout made: pages of no document.
  if (view.kind === "cart") {
    const cart = cartShop(site, settings, pages);
    return cart ? ready(page("Your cart"), "Your cart", CART_VIEW_LINE, null, { cart }) : { kind: "failed", message: SHOP_OFF_LINE };
  }
  if (view.kind === "order") {
    const order = adapter.capabilities.shop ? await adapter.getOrder(view.orderId).catch((error: unknown) => (isStorageError(error) && error.failure.kind === "not-found" ? null : Promise.reject(error))) : null;
    if (!order) return { kind: "failed", message: NO_ORDER_LINE };
    const cart = cartShop(site, settings, pages);
    return ready(page("Your order"), "Your order", ORDER_LINE, null, { order, ...(cart ? { cart } : {}) });
  }

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
  const shownPage = opened.page.kind === "page" ? opened : await homeOf(adapter, pages);
  if (!shownPage) return { kind: "failed", message: NO_HOME_LINE };
  if (preview) return ready(shownPage.draft.document, shownPage.draft.document.title, PREVIEW_LINE);
  if (!shownPage.published) return { kind: "failed", message: NOT_PUBLISHED_LINE };
  const version = await adapter.getVersion(shownPage.page.id, shownPage.published.versionNumber);
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

// The line goes under a form; Add to cart has none: the demo's cart takes
// what it sends.
const decorations = (block: RawBlock): Decoration | undefined => (block.type === "form" ? FORM_DECORATION : undefined);

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

// The digits a form sends for an id or a quantity, as a number; null for
// anything else, which the shop's rules refuse (CartController#form_integer).
const formNumber = (value: FormDataEntryValue | null): number | null => (typeof value === "string" && /^[0-9]{1,16}$/.test(value) ? Number(value) : null);

// Another of the demo's pages opened in this tab, by its address.
const assign = (address: string) => window.location.assign(new URL(address, window.location.href).href);

// The cart's page: the cart this browser keeps, priced from what the
// products published, drawn as the CMS draws /cart.
function CartPage({ cart, lines, said, media }: { cart: CartShop; lines: readonly CartLine[]; said: string | null; media: RenderContext["media"] }) {
  const priced = priceCart(lines, (id) => cart.products.get(id) ?? null, cart.collection.fields, cart.priceField);
  const shown = cartShown(priced.lines, { fields: cart.collection.fields, prefix: cart.collection.prefix, live: cart.collection.template.published !== null }, cart.published);
  const closed = priced.lines.length > 0 && priced.orderLines.length === 0 ? WORDS.nothingToCheckOut : null;
  return (
    <>
      <CartHead title="Your cart" said={priced.lines.length === 0 ? EMPTY : cartCountWords(priced.lines)} />
      <CartBody priced={priced} shown={shown} media={media} currency={cart.currency} said={said} closed={closed} shopPath={cart.shopPath} />
    </>
  );
}

export interface PageViewProps {
  adapter: StorageAdapter;
  view: View;
  // The demo's checkout (BrowserAdapter.checkoutDemo): an order of the
  // cart's lines for sale, marked as the demo's.
  checkout?: (lines: readonly CartLine[]) => Promise<Order>;
  // How another of the demo's pages opens: in this tab, unless a test
  // says otherwise.
  go?: (address: string) => void;
}

export function PageView({ adapter, view, checkout, go = assign }: PageViewProps) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  const [said, setSaid] = useState<string | null>(null);
  // The cart, as this browser keeps it, and what its last change said.
  const [lines, setLines] = useState<CartLine[]>(() => readDemoCart());
  const [notice, setNotice] = useState<string | null>(null);
  const checkingOut = useRef(false);

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
  // The cart another tab of this browser changed, drawn again; a storage
  // cleared whole says so with no key.
  useEffect(() => {
    const redraw = (event: StorageEvent) => {
      if (event.key === null || event.key === CART_KEY) setLines(readDemoCart());
    };
    window.addEventListener("storage", redraw);
    return () => window.removeEventListener("storage", redraw);
  }, []);
  useEffect(() => {
    if (shown.kind === "ready") document.title = shown.title || "Untitled page";
  }, [shown]);

  const ctx = useMemo<RenderContext | null>(() => (shown.kind === "ready"
    ? { media: mediaResolver(shown.media), collections: collectionResolver(shown.site), entry: shown.entry, shop: shown.shop, entryHref, useDecoration: decorations }
    : null), [shown]);

  // A link to a page of the site, to an entry, or to the cart, opens it as
  // the demo draws it.
  const follow = (event: MouseEvent<HTMLElement>) => {
    if (shown.kind !== "ready" || event.defaultPrevented || event.button !== 0) return;
    const link = (event.target as Element).closest?.("a[href]");
    const href = link?.getAttribute("href") ?? "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    if (href.split(/[?#]/, 1)[0] === "/cart") {
      go(cartAddress);
      return;
    }
    const entry = entryAt(shown.site, href);
    if (entry) {
      go(entryAddress(entry.id));
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
    go((page.published ? publishedAddress(page.id) : previewAddress(page.id)) + fragment);
  };

  // A product put in the cart from its page, as the CMS's cart takes it
  // (POST /cart/items): held to the shop's rules and to the products as
  // they went live, then the cart opened; refused, the line above says why.
  const putIn = (form: HTMLFormElement) => {
    if (shown.kind !== "ready") return;
    const data = new FormData(form);
    const entryId = formNumber(data.get("entry"));
    const change = addToCart(readDemoCart(), entryId, data.has("quantity") ? formNumber(data.get("quantity")) : 1);
    if (!change.ok) {
      setSaid(change.fault.message);
      return;
    }
    const cart = cartShop(shown.site, shown.shop, shown.pages);
    if (!cart) {
      setSaid(SHOP_OFF_LINE);
      return;
    }
    const state = productState(cart.products.get(entryId!) ?? null, cart.collection.fields, cart.priceField);
    if (state !== "forSale") {
      setSaid(REFUSED_STATES[state]);
      return;
    }
    keepDemoCart(change.lines);
    go(cartAddress);
  };

  // A line's quantity set, 0 taking it out, as POST /cart/items/<id> sets
  // it: kept and drawn again, or refused, saying why above the cart. The
  // change starts from the cart as kept at this moment, which another tab
  // may have written since this one drew it, and is kept before anything
  // else can run.
  const changeLine = (cart: CartShop, entryId: number, form: HTMLFormElement) => {
    const quantity = formNumber(new FormData(form).get("quantity"));
    const change = setQuantity(readDemoCart(), entryId, quantity);
    if (!change.ok) {
      setNotice(change.fault.message);
      return;
    }
    if (quantity !== null && quantity > 0) {
      const state = productState(cart.products.get(entryId) ?? null, cart.collection.fields, cart.priceField);
      if (state !== "forSale") {
        setNotice(REFUSED_STATES[state]);
        return;
      }
    }
    keepDemoCart(change.lines);
    setLines(change.lines);
    setNotice(null);
  };

  // The demo's checkout: the order made in this browser of the cart as kept
  // when it is pressed, then the cart, as kept once the order is made (what
  // another tab put in meanwhile included), rid of what the order took,
  // and the order shown.
  const checkOut = async () => {
    if (!checkout || checkingOut.current) return;
    checkingOut.current = true;
    try {
      const order = await checkout(readDemoCart());
      const left = afterOrder(readDemoCart(), order.lines);
      keepDemoCart(left);
      setLines(left);
      go(orderAddress(order.id));
    } catch (error) {
      setNotice(isStorageError(error) && error.failure.kind === "not-found" ? SHOP_OFF_LINE : describe(error));
    } finally {
      checkingOut.current = false;
    }
  };

  const submit = (event: FormEvent<HTMLDivElement>) => {
    if (shown.kind !== "ready" || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    const action = form.getAttribute("action") ?? "";
    if (action === CART_ITEMS) {
      event.preventDefault();
      putIn(form);
      return;
    }
    if (!shown.cart || shown.order) return;
    if (action === "/cart/checkout") {
      event.preventDefault();
      void checkOut();
      return;
    }
    const line = /^\/cart\/items\/([1-9][0-9]{0,15})$/.exec(action);
    if (line) {
      event.preventDefault();
      changeLine(shown.cart, Number(line[1]), form);
    }
  };

  return (
    <>
      <aside className="demo-bar chrome" aria-label="About this page">
        <p>{shown.kind === "ready" ? shown.line : shown.kind === "failed" ? shown.message : "Opening the page…"}</p>
        <p className="demo-bar-said" role="status">{said}</p>
      </aside>
      {shown.kind === "ready" && ctx && (
        <div onClick={follow} onSubmit={submit}>
          <PageRoot document={shown.document} ctx={ctx} siteStyle={shown.style} parts={shown.parts}>
            {shown.order ? (
              <>
                <CartHead title={ORDER_TITLE} said={ORDER_SAID} />
                <OrderBody lines={shown.order.lines} total={shown.order.total} currency={shown.order.currency} back={{ href: shown.cart?.shopPath ?? "/", words: "Back to the shop" }} />
              </>
            ) : shown.cart ? (
              <CartPage cart={shown.cart} lines={lines} said={notice} media={ctx.media} />
            ) : null}
          </PageRoot>
        </div>
      )}
      <DemoLine />
    </>
  );
}
