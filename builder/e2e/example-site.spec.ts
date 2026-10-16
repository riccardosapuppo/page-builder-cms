// The example site as a visitor gets it, once `ruby bin/rails db:seed` has
// put it into the run's CMS (example-site/, read by cms/db/seeds.rb): each
// of its five pages, the page of one of News's entries and the page of a
// product of its shop, in Chromium, with its heading, no serious or
// critical axe finding on a desktop's width and a phone's, and no sideways
// scroll down to 320 wide, the notices page's word longer than any line
// included.
//
// The tests of a run share one CMS and make pages and collections of their
// own beside these; the seed leaves an address or a prefix that is taken
// as it is, and the shop's settings once they were changed, so this file
// can run again on the same CMS. Its seed turns the shop on, selling Club
// kit: the tests that change the shop put its settings back as they found
// them (shop.spec.ts).
import type { Page } from "@playwright/test";
import { seedCms } from "./harness/servers.ts";
import { axe } from "./helpers/axe.ts";
import { cms, expect, stripe, test, watchQuietly } from "./helpers/site.ts";

const PAGES = [
  { path: "/", heading: "Swim at slack water" },
  { path: "/winter-series", heading: "Winter series" },
  { path: "/news", heading: "News" },
  { path: "/news/winter-series-starts", heading: "The winter series starts on 1 November" },
  { path: "/shop", heading: "Shop" },
  { path: "/shop/swim-cap", heading: "Swim cap" },
  { path: "/notices", heading: "Notices" },
];

test.beforeAll(async ({ playwright }) => {
  const folder = process.env.E2E_CMS_FOLDER;
  if (!folder) throw new Error("E2E_CMS_FOLDER is not set: the run's CMS was not started by the harness");
  expect(seedCms({ folder })).toContain("Seeding the example site, Slack Water:");
  // The seed sets the shop's settings only while they were never changed,
  // and a test before this one may have changed them, and put them back:
  // the shop sold here is site.json's, Club kit, as a first seed sets it.
  const api = await playwright.request.newContext();
  try {
    const { collections } = (await (await api.get(`${cms()}/api/collections`)).json()) as { collections: Array<{ id: number; prefix: string }> };
    const kit = collections.find((one) => one.prefix === "shop");
    expect(kit, "the seed made Club kit at /shop").toBeDefined();
    const sold = await api.put(`${cms()}/api/shop`, { data: { enabled: true, currency: "GBP", productsCollectionId: kit!.id, priceField: "price" } });
    expect(sold.status(), await sold.text()).toBe(200);
  } finally {
    await api.dispose();
  }
});

async function clean(page: Page, state: string): Promise<void> {
  const report = await axe(page);
  for (const line of report.other) console.log(`${state}: ${line}`);
  expect(report.passes, `${state}: axe ran its rules`).toBeGreaterThan(10);
  expect(report.serious, state).toEqual([]);
}

for (const { path, heading } of PAGES) {
  test(`the example site's ${path} is served with its heading, passes axe at 1440 and 390 wide, and does not scroll sideways at 320`, { tag: "@a11y" }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto(`${cms()}${path}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    // The news at the collection's prefix lists its five entries; an
    // entry's page, two of the others.
    if (path === "/news") await expect(page.locator("main .sw-entry-title a")).toHaveCount(5);
    if (path.startsWith("/news/")) await expect(page.locator("main [data-block-id=more-list] .sw-entry-title a")).toHaveCount(2);
    // The shop's page lists its four products, each with its price in
    // pounds; a product's page, its price and Add to cart, and two others.
    if (path === "/shop") await expect(page.locator("main .sw-entry-price")).toHaveText(["£9.50", "£12.00", "£24.00", "£25.00"]);
    if (path.startsWith("/shop/")) {
      await expect(page.locator("main [data-field=price]")).toHaveText("£12.00");
      await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
      await expect(page.locator("main [data-block-id=more-list] .sw-entry-title a")).toHaveCount(2);
    }
    if (path === "/") {
      // The video and the map are closed cards: the third party is asked
      // only once a visitor opens one, and the shared fixture fails any
      // request outside the run's servers.
      await expect(page.locator("[data-block-type=video] details, [data-block-type=map] details")).toHaveCount(2);
      await expect(page.locator("[data-block-type=video] details[open], [data-block-type=map] details[open]")).toHaveCount(0);
    }
    await clean(page, `${path}, 1440 wide`);

    await page.setViewportSize({ width: 390, height: 844 });
    await clean(page, `${path}, 390 wide`);

    await page.setViewportSize({ width: 320, height: 640 });
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0], `${path} scrolls sideways at 320 wide`).toBeLessThanOrEqual(widths[1]!);
  });
}

// What a visitor's browser makes of a page as it is now: axe at 1440 and
// 390 wide, no sideways scroll at 320, the window put back as it was.
async function servedClean(tab: Page, state: string): Promise<void> {
  const size = tab.viewportSize()!;
  await tab.setViewportSize({ width: 1440, height: 900 });
  await clean(tab, `${state}, 1440 wide`);
  await tab.setViewportSize({ width: 390, height: 844 });
  await clean(tab, `${state}, 390 wide`);
  await tab.setViewportSize({ width: 320, height: 640 });
  const widths = await tab.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0], `${state} scrolls sideways at 320 wide`).toBeLessThanOrEqual(widths[1]!);
  await tab.setViewportSize(size);
}

// Two caps and a float put in the cart from their pages, as a visitor does.
async function fillCart(tab: Page): Promise<void> {
  await tab.goto(`${cms()}/shop/swim-cap`);
  await tab.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await tab.getByRole("button", { name: "Add to cart" }).click();
  await expect(tab).toHaveURL(`${cms()}/cart`);
  await tab.goto(`${cms()}/shop/tow-float`);
  await tab.getByRole("button", { name: "Add to cart" }).click();
  await expect(tab.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Swim cap", "Tow float"]);
}

// Every control of the cart's own band that a finger presses, at least 44
// pixels each way.
async function smallTargets(tab: Page): Promise<string[]> {
  return tab.locator(".sw-cart a, .sw-cart button, .sw-cart input:not([type=hidden])").evaluateAll((controls) => controls.flatMap((control) => {
    const box = control.getBoundingClientRect();
    return box.width >= 44 && box.height >= 44 ? [] : [`${control.outerHTML.slice(0, 80)}: ${Math.round(box.width)} by ${Math.round(box.height)}`];
  }));
}

test("the example site's cart, empty and with its lines, and the page a visitor comes back to from Stripe's checkout, are served in the site's frame, pass axe at 1440 and 390 wide, do not scroll sideways at 320, and stand 44 px tall for a finger", { tag: "@a11y" }, async ({ browser }) => {
  test.setTimeout(120_000);
  // A visitor's own browser: the cart is a cookie of theirs.
  const desk = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 1440, height: 900 } });
  const tab = await desk.newPage();
  const problems = await watchQuietly(tab, "");
  try {
    await tab.goto(`${cms()}/cart`);
    await expect(tab.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
    await expect(tab.locator(".sw-cart-head p")).toHaveText("Your cart is empty.");
    await expect(tab.getByRole("link", { name: "See what the shop sells" })).toHaveAttribute("href", "/shop");
    await expect(tab.locator("header.sw-header .w-logo-link span")).toHaveText("Slack Water");
    await expect(tab.locator("footer.sw-footer .w-menu-links a[href='/shop']")).toHaveText("Shop");
    await servedClean(tab, "/cart, empty");

    await fillCart(tab);
    await expect(tab.locator(".sw-cart-picture img")).toHaveCount(2);
    await expect(tab.locator(".sw-cart-total")).toHaveText("Total £48.00");
    await servedClean(tab, "/cart, with its lines");

    // Checked out, the fake's page for the session, and back: before it is
    // paid, then paid.
    await tab.getByRole("button", { name: "Checkout" }).click();
    await tab.waitForURL(/\/c\/pay\/cs_test_/);
    const session = new URL(tab.url()).pathname.split("/").pop()!;
    await tab.goto(`${cms()}/cart/thanks?session_id=${session}`);
    await expect(tab.getByRole("heading", { level: 1, name: "Not paid yet" })).toBeVisible();
    await servedClean(tab, "/cart/thanks, not paid yet");
    await tab.goto(`${stripe()}/c/pay/${session}`);
    await tab.getByRole("button", { name: "Pay" }).click();
    await tab.waitForURL(`${cms()}/cart/thanks?session_id=${session}`);
    await expect(tab.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
    await servedClean(tab, "/cart/thanks, paid");
    expect(problems).toEqual([]);
  } finally {
    await desk.close();
  }

  // A phone, its pointer a finger: every control of the cart's band, and
  // of the page back from Stripe, 44 pixels each way.
  const phone = await browser.newContext({ locale: "en-US", timezoneId: "UTC", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const finger = await phone.newPage();
  const fingerProblems = await watchQuietly(finger, "");
  try {
    await fillCart(finger);
    expect(await finger.evaluate(() => matchMedia("(pointer: coarse)").matches), "the phone's pointer is coarse").toBe(true);
    expect(await smallTargets(finger), "the cart's controls").toEqual([]);
    await finger.getByRole("button", { name: "Checkout" }).click();
    await finger.waitForURL(/\/c\/pay\/cs_test_/);
    await finger.getByRole("button", { name: "Pay" }).click();
    await expect(finger.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
    expect(await smallTargets(finger), "the thanks page's controls").toEqual([]);
    expect(fingerProblems).toEqual([]);
  } finally {
    await phone.close();
  }
});
