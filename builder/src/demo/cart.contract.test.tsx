// The cart's contract, the browser demo's half (contract/cart/cases.json
// says what it holds): each case's cart priced by the shop's rules
// (../shared/shop.ts) and drawn by the demo's cart pages (./cart-view.tsx,
// ./cart-page.ts) gives the tree of the CMS's golden for it, under the
// render contract's normalization (../../test/html-compare.ts) and
// nothing else. The CMS's half, cms/test/contract/cart_goldens_test.rb,
// writes the goldens from its own pages.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { compareHtml } from "../../test/html-compare.ts";
import { contractMedia } from "../render/media.tsx";
import { priceCart, readCart, type Currency, type OrderLine, type ShopProduct } from "../shared/shop.ts";
import { WORDS } from "../storage/browser-rules.ts";
import { cartCountWords, cartShown, EMPTY, REFUSED_STATES } from "./cart-page.ts";
import { CartBody, CartHead, OrderBody } from "./cart-view.tsx";

interface CartCase {
  name: string;
  page: "cart" | "order";
  about: string;
  currency?: Currency;
  live?: boolean;
  lines?: unknown;
  // Its words, or those of a product refused for its state.
  said: string | null | { state: keyof typeof REFUSED_STATES };
  shopPath?: string;
  title?: string;
  order?: { currency: Currency; total: number; lines: OrderLine[] };
  back?: { href: string; words: string };
}

interface CartCases {
  collection: { prefix: string; priceField: string; fields: Array<{ key: string; type: string }> };
  products: Array<ShopProduct & { slug: string }>;
  cases: CartCase[];
}

const folder = join(repoRoot, "contract", "cart");
const cases = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8")) as CartCases;
const golden = (name: string) => readFileSync(join(folder, `${name}.html`), "utf8");

// A case drawn as the demo draws its page.
export function renderCase(one: CartCase): string {
  const notice = typeof one.said === "object" && one.said !== null ? REFUSED_STATES[one.said.state] : one.said;
  if (one.page === "order") {
    return renderToStaticMarkup(<><CartHead title={one.title!} said={notice} /><OrderBody lines={one.order!.lines} total={one.order!.total} currency={one.order!.currency} back={one.back!} /></>);
  }
  const { collection } = cases;
  const products = new Map(cases.products.map((product) => [product.id, product]));
  const priced = one.lines === null ? null : priceCart(readCart(one.lines), (id) => products.get(id) ?? null, collection.fields, collection.priceField);
  const published = new Map(cases.products.map((product) => [product.id, { slug: product.slug, values: product.values }]));
  const shown = priced ? cartShown(priced.lines, { fields: collection.fields, prefix: collection.prefix, live: one.live === true }, published) : new Map();
  const closed = priced !== null && priced.lines.length > 0 && priced.orderLines.length === 0 ? WORDS.nothingToCheckOut : null;
  const said = priced === null ? null : priced.lines.length === 0 ? EMPTY : cartCountWords(priced.lines);
  return renderToStaticMarkup(<><CartHead title="Your cart" said={said} /><CartBody priced={priced} shown={shown} media={contractMedia} currency={one.currency!} said={notice} closed={closed} shopPath={one.shopPath!} /></>);
}

test("the cases are there, each with its golden, every kind of line among them", () => {
  expect(cases.cases.length).toBeGreaterThanOrEqual(5);
  const drawn = cases.cases.map((one) => golden(one.name)).join("");
  for (const state of ["forSale", "outOfStock", "noPrice", "gone"]) expect(drawn, state).toContain(`data-state="${state}"`);
});

describe.each(cases.cases)("$name", (one) => {
  test(`the demo draws the tree of the CMS's golden: ${one.about}`, () => {
    const result = compareHtml(golden(one.name), renderCase(one), one.name);
    expect(result.message ?? "").toBe("");
    expect(result.equal).toBe(true);
    expect(result.nodes.react).toBeGreaterThan(10);
  });
});
