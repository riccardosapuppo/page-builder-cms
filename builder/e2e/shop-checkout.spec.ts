// A whole checkout, in Chromium, on the run's CMS, whose checkout goes to
// the tests' fake Stripe (harness/playwright-setup.ts): a visitor on a
// product's page puts it in the cart, changes how many on the cart's page,
// checks out and is sent to the fake's page for the session; before
// paying, puts another product in the cart; pays, and is sent back to the
// thanks page, which says the order is paid and lists what it took. The
// editor's Shop screen lists the order as paid, with the email the buyer
// gave and the items; and the cart has lost what was paid and kept the
// line put in meanwhile. The products, their template and the shop's
// settings are the test's own, the settings put back as they were found.
import type { APIRequestContext, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { makeCollection, makeEntry, saveDocument } from "./helpers/collections.ts";
import { cms, column, expect, section, stripe, test, watchQuietly, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface ShopSettings {
  enabled: boolean;
  currency: string;
  productsCollectionId: number | null;
  priceField: string | null;
}

const PRODUCT_FIELDS = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "price", label: "Price", type: "number", required: false, min: 0, max: 100000 },
  { key: "in-stock", label: "In stock", type: "toggle", required: false },
];

async function putShop(request: APIRequestContext, settings: ShopSettings): Promise<void> {
  const changed = await request.put(`${cms()}/api/shop`, { data: settings });
  expect(changed.status(), await changed.text()).toBe(200);
}

let found: ShopSettings | null = null;
test.beforeEach(async ({ request }) => {
  const shop = (await (await request.get(`${cms()}/api/shop`)).json()) as ShopSettings;
  found = { enabled: shop.enabled, currency: shop.currency, productsCollectionId: shop.productsCollectionId, priceField: shop.priceField };
});
test.afterEach(async ({ request }) => {
  if (found) await putShop(request, found);
});

// Its product's page: the title, the price as money, and Add to cart.
const PRODUCT_TEMPLATE = [section("p", "Product", [column("pc", [
  widget("p-title", "field", { field: "title", level: 1 }),
  widget("p-price", "field", { field: "price" }),
  widget("p-cart", "addToCart", { label: "Add to cart", quantity: true }),
])])];

// A visitor's tab, a browser context of its own: its own cookies, held to
// the run's checks, the fake's page among the run's servers.
async function visitorTab(page: Page): Promise<{ tab: Page; problems: string[]; close: () => Promise<void> }> {
  const context = await page.context().browser()!.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1440, height: 900 } });
  const tab = await context.newPage();
  const problems = await watchQuietly(tab, "");
  return { tab, problems, close: () => context.close() };
}

test("a visitor checks out on the CMS: a product put in from its page, its quantity changed, Checkout to the fake Stripe's page, paid, back on the thanks page; the order paid in the Shop screen; the cart rid of what was paid, the line put in meanwhile kept", async ({ page, request }) => {
  test.setTimeout(120_000);
  const kit = await makeCollection(request, "Checkout kit", PRODUCT_FIELDS, { by: "title", direction: "asc" });
  await makeEntry(request, kit, { title: "Swim cap", slug: "swim-cap", values: { summary: "A bright cap.", price: 12, "in-stock": true } });
  await makeEntry(request, kit, { title: "Tow float", slug: "tow-float", values: { summary: "An orange float.", price: 24, "in-stock": true } });
  await saveDocument(request, kit.templateId, "Checkout kit", PRODUCT_TEMPLATE);
  await putShop(request, { enabled: true, currency: "GBP", productsCollectionId: kit.id, priceField: "price" });

  const { tab, problems, close } = await visitorTab(page);
  try {
    // 1. A product's page, its price as money.
    await tab.goto(`${cms()}/${kit.prefix}/swim-cap`);
    await expect(tab.getByRole("heading", { level: 1, name: "Swim cap" })).toBeVisible();
    await expect(tab.locator("[data-block-id=p-price]")).toHaveText("£12.00");

    // 2. Add to cart: the cart's page, in the site's frame, with the line.
    await tab.getByRole("button", { name: "Add to cart" }).click();
    await expect(tab).toHaveURL(`${cms()}/cart`);
    await expect(tab.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
    await expect(tab.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Swim cap"]);
    await expect(tab.getByRole("link", { name: "Swim cap" })).toHaveAttribute("href", `/${kit.prefix}/swim-cap`);

    // 3. How many, changed on the cart's page.
    await tab.getByRole("spinbutton", { name: "Quantity of Swim cap" }).fill("3");
    await tab.getByRole("button", { name: "Update Swim cap" }).click();
    await expect(tab).toHaveURL(`${cms()}/cart`);
    await expect(tab.locator(".sw-cart-amount")).toHaveText(["£36.00"]);
    await expect(tab.locator(".sw-cart-total")).toHaveText("Total £36.00");
    await expect(tab.locator(".sw-cart-head p")).toHaveText("You have 3 items in your cart.");

    // 4. Checkout: the order made, open, and the visitor on the fake's
    // page for its session.
    await tab.getByRole("button", { name: "Checkout" }).click();
    await tab.waitForURL(new RegExp(`^${stripe().replaceAll(".", "\\.")}/c/pay/cs_test_[0-9A-Za-z]+$`));
    const pay = tab.url();
    const session = pay.slice(pay.lastIndexOf("/") + 1);
    const orders = async () => ((await (await request.get(`${cms()}/api/orders`)).json()) as { orders: Array<{ id: number; status: string; total: number; stripeSessionId: string; email: string | null; lines: Array<{ title: string; quantity: number }> }> }).orders;
    const order = (await orders()).find((one) => one.stripeSessionId === session);
    expect(order).toMatchObject({ status: "open", total: 3600, email: null, lines: [{ title: "Swim cap", quantity: 3 }] });

    // Meanwhile, before paying, the float put in the cart, which keeps
    // the caps until they are paid for.
    await tab.goto(`${cms()}/${kit.prefix}/tow-float`);
    await tab.getByRole("button", { name: "Add to cart" }).click();
    await expect(tab.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Swim cap", "Tow float"]);

    // 5. Paid on the fake's page, and back on the thanks page.
    await tab.goto(pay);
    await tab.getByRole("button", { name: "Pay" }).click();
    await tab.waitForURL(`${cms()}/cart/thanks?session_id=${session}`);
    await expect(tab.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
    await expect(tab.locator(".sw-cart-head p")).toHaveText("Your order is paid: £36.00.");
    const sold = tab.locator(".sw-order .sw-cart-line");
    await expect(sold.locator(".sw-cart-title")).toHaveText(["Swim cap"]);
    await expect(sold.locator(".sw-cart-price")).toHaveText(["3 × £12.00"]);
    await expect(sold.locator(".sw-cart-amount")).toHaveText(["£36.00"]);
    await expect(tab.getByRole("link", { name: "Back to the shop" })).toBeVisible();
    // In the site's frame, its header and footer around it.
    await expect(tab.locator("header.sw-header")).toHaveCount(1);
    await expect(tab.locator("footer.sw-footer")).toHaveCount(1);
    const audit = await axe(tab);
    expect(audit.serious, "the thanks page").toEqual([]);

    // 7. The cart: the caps paid for are gone, the float put in meanwhile
    // stays.
    await tab.goto(`${cms()}/cart`);
    await expect(tab.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Tow float"]);
    await expect(tab.locator(".sw-cart-total")).toHaveText("Total £24.00");
    expect(problems).toEqual([]);
  } finally {
    await close();
  }

  // 6. The order paid in the editor's Shop screen, with the buyer's email.
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Switch page/ })).toBeVisible();
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Shop" }).click();
  const shop = page.getByRole("dialog", { name: "Shop" });
  await shop.getByRole("button", { name: /^Orders/ }).click();
  const row = shop.locator("tbody tr").first();
  await expect(row).toHaveAttribute("data-status", "paid");
  await expect(row.locator(".shop-status")).toHaveText("Paid");
  await expect(row.locator(".shop-amount")).toHaveText("£36.00");
  await expect(row.locator(".shop-items")).toHaveText("3 items: Swim cap × 3");
  await expect(row.locator(".shop-email")).toHaveText("buyer@example.com");
});
