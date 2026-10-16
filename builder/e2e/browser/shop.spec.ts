// The Shop screen on the browser's storage (IndexedDB), as the demo keeps
// it, in Chromium with no CMS: a collection of products and an order the
// demo's checkout made, put in through the browser's storage; the screen
// showing the shop on, checkout not set up in this browser's words and
// what the full system does instead, the order in the table marked as the
// demo's, whole with no Ask Stripe again; the currency changed and saved,
// kept after a reload. The shop's settings are put back as they were found.
import type { Page } from "@playwright/test";
import type { Capabilities } from "../../src/storage/adapter.ts";
import { column, heading, open, section } from "../helpers/site.ts";
import { expect, seedPage, test, unique } from "./fixtures.ts";
import { remoteAdapter, storagePage } from "./remote.ts";

test.use({ viewport: { width: 1440, height: 900 } });

async function storage(page: Page) {
  await storagePage(page);
  const capabilities: Capabilities = await page.evaluate(() => window.storagePage!.open("shop"));
  return remoteAdapter(page, capabilities);
}

test("the shop on this browser's storage: its settings, checkout as the demo's, an order the demo's checkout made, a currency saved and kept", async ({ page }) => {
  const id = await seedPage(page, "Shop here", [section("s", "Story", [column("c", [heading("h", "The club's kit")])])]);
  const tab = await storage(page);
  const found = await tab.getShop();
  const made = await tab.createCollection({
    name: "Swim kit", prefix: unique("kit"), sort: { by: "title", direction: "asc" },
    fields: [{ key: "price", label: "Price", type: "number", required: false }, { key: "in-stock", label: "In stock", type: "toggle", required: false }],
  });
  if (!made.ok) throw new Error(JSON.stringify(made.problem));
  const cap = await tab.createEntry(made.value.id, { title: "Swim cap", slug: "swim-cap", values: { price: 12, "in-stock": true } });
  if (!cap.ok) throw new Error(JSON.stringify(cap.problem));
  expect((await tab.publishEntry(made.value.id, cap.value.id)).ok).toBe(true);
  expect((await tab.setShop({ enabled: true, currency: "GBP", productsCollectionId: made.value.id, priceField: "price" })).ok).toBe(true);
  try {
    const order = await tab.checkoutDemo([{ entryId: cap.value.id, quantity: 3 }]);

    await open(page, id);
    await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
    await page.getByRole("menuitem", { name: "Shop" }).click();
    const shop = page.getByRole("dialog", { name: "Shop" });
    await expect(shop.getByRole("button", { name: /^Settings, On, in pounds, from Swim kit$/ })).toBeVisible();
    await expect(shop.getByRole("switch", { name: "The shop is on" })).toBeChecked();
    await expect(shop.getByLabel("Collection")).toHaveValue(String(made.value.id));
    await expect(shop.getByText("Checkout is not set up.")).toBeVisible();
    await expect(shop.getByText(/^This storage is the browser's: its checkout makes an order marked Not paid: browser demo/)).toBeVisible();
    await expect(shop.getByText(/^In the full system, the CMS sends each checkout to Stripe's page/)).toBeVisible();

    await shop.getByRole("button", { name: /^Orders/ }).click();
    const row = shop.locator("tr", { has: page.locator(`[data-order-id="${order.id}"]`) });
    await expect(row.locator("td")).toHaveText(["Not paid: browser demo", "£36.00", "3 items: Swim cap × 3", "None yet"]);
    await row.getByRole("button").click();
    const detail = shop.getByRole("article", { name: `Order ${order.id}` });
    await expect(detail.getByText("None: the browser demo's checkout reaches no payment")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Ask Stripe again" })).toHaveCount(0);
    await detail.getByRole("button", { name: "All orders" }).click();

    // The currency, changed and saved, kept after a reload.
    await shop.getByRole("button", { name: /^Settings/ }).click();
    await shop.getByRole("radio", { name: "$ Dollars" }).click();
    await shop.getByRole("button", { name: "Save changes" }).click();
    await expect(shop.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();
    await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
    await page.getByRole("menuitem", { name: "Shop" }).click();
    await expect(page.getByRole("dialog", { name: "Shop" }).getByRole("button", { name: "Settings, On, in dollars, from Swim kit" })).toBeVisible();
  } finally {
    const back = await (await storage(page)).setShop({ enabled: found.enabled, currency: found.currency, productsCollectionId: found.productsCollectionId, priceField: found.priceField });
    expect(back.ok).toBe(true);
  }
});
