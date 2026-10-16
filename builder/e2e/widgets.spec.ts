// Each widget's accessibility test (src/widgets/<widget>/a11y.ts), in
// Chromium: its cases saved to the run's CMS and published; on the page the
// CMS serves, each case exposes what its test says (role, name, level, how
// many, for a form's field whether the accessibility tree says it is
// required, and the words the tree reads in a paragraph), a hidden one
// exposes nothing, and axe finds nothing serious or critical in the widget;
// on the editor's canvas, each case that is not hidden exposes the same,
// and the same blocks pass axe too. A widget whose cases draw from a
// collection (a Collection list's) has it made first, its entries
// published; one that only a template holds (a Field block) has its cases
// in that collection's template, published, and is read on its first
// entry's page, and on the canvas with that entry; one that draws for the
// shop (Add to cart) has the shop on and selling from that collection
// while it is read, the shop's settings put back as they were found after.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { WIDGET_A11Y } from "../src/widgets/a11y-all.ts";
import { A11Y_COLLECTION, type A11yCase, type WidgetA11y } from "../src/widgets/a11y.ts";
import { axProperties, axTexts } from "./helpers/ax.ts";
import { axe } from "./helpers/axe.ts";
import { makeCollection, makeEntry, publishPage, saveDocument } from "./helpers/collections.ts";
import { cms, column, expect, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// What the case says it exposes, found inside the block's root. Words that
// are no name (a paragraph's) are read in the accessibility tree.
async function exposes(page: Page, root: Locator, c: A11yCase, where: string): Promise<void> {
  for (const exposed of c.exposes) {
    const named = root.getByRole(exposed.role, {
      ...(exposed.name === undefined ? {} : { name: exposed.name, exact: true }),
      ...(exposed.level === undefined ? {} : { level: exposed.level }),
    });
    const found = exposed.text === undefined ? named : named.filter({ hasText: exposed.text });
    const what = `${where}, ${c.name}: ${exposed.role}${exposed.name ? ` "${exposed.name}"` : ""}${exposed.text ? ` reading "${exposed.text}"` : ""}`;
    await expect(found, what).toHaveCount(exposed.count ?? 1);
    // A text's paragraph ends with an empty character (site.css, .w-text
    // p::after), which the tree keeps and no screen reader says.
    if (exposed.text !== undefined) for (const one of await found.all()) expect((await axTexts(page, one)).join("").replaceAll("​", ""), what).toBe(exposed.text);
    if (exposed.required === undefined) continue;
    for (const one of await found.all()) expect((await axProperties(page, one)).get("required") ?? false, `${what} is required`).toBe(exposed.required);
  }
}

// The shop's settings as the CMS holds them, and a change of them.
interface ShopSettings {
  enabled: boolean;
  currency: string;
  productsCollectionId: number | null;
  priceField: string | null;
}
async function shopSettings(request: APIRequestContext): Promise<ShopSettings> {
  const shop = (await (await request.get(`${cms()}/api/shop`)).json()) as ShopSettings;
  return { enabled: shop.enabled, currency: shop.currency, productsCollectionId: shop.productsCollectionId, priceField: shop.priceField };
}
async function setShop(request: APIRequestContext, settings: ShopSettings): Promise<void> {
  const changed = await request.put(`${cms()}/api/shop`, { data: settings });
  expect(changed.status(), await changed.text()).toBe(200);
}

// Where the cases are published and opened: a page of their own, or the
// template of their collection, read on its first entry's page; the shop
// selling from that collection when the cases draw for it.
async function publishCases(request: APIRequestContext, widgetTest: WidgetA11y, blocks: (collection: number | null) => unknown[]): Promise<{ address: string; opened: number }> {
  const title = `The ${widgetTest.type}`;
  if (!widgetTest.collection) {
    const made = await makePage(request, title, [section("s", "Cases", [column("c", blocks(null))])]);
    await publishPage(request, made.id);
    return { address: `${cms()}/${made.slug}`, opened: made.id };
  }
  const collection = await makeCollection(request, widgetTest.collection.name, widgetTest.collection.fields);
  for (const entry of widgetTest.collection.entries) await makeEntry(request, collection, entry);
  if (widgetTest.sells) await setShop(request, { enabled: true, currency: "GBP", productsCollectionId: collection.id, priceField: widgetTest.sells.priceField });
  const sections = [section("s", "Cases", [column("c", blocks(collection.id))])];
  if (widgetTest.inTemplate) {
    await saveDocument(request, collection.templateId, title, sections);
    return { address: `${cms()}/${collection.prefix}/${widgetTest.collection.entries[0]!.slug}`, opened: collection.templateId };
  }
  const made = await makePage(request, title, sections);
  await publishPage(request, made.id);
  return { address: `${cms()}/${made.slug}`, opened: made.id };
}

for (const widgetTest of WIDGET_A11Y) {
  test(`the ${widgetTest.type}'s accessibility test: ${widgetTest.cases.map((c) => c.name).join("; ")}`, { tag: "@a11y" }, async ({ page, request }) => {
    const id = (index: number) => `${widgetTest.type}-${index}`;
    // The collection the CMS made stands where the cases name theirs.
    const blocks = (collection: number | null) => widgetTest.cases.map((c, index) =>
      widget(id(index), widgetTest.type, collection !== null && c.props.collection === A11Y_COLLECTION ? { ...c.props, collection } : c.props));
    const found = widgetTest.sells ? await shopSettings(request) : null;
    try {
      const made = await publishCases(request, widgetTest, blocks);

      // The published page, as a visitor's browser has it.
      await page.goto(made.address);
      for (const [index, c] of widgetTest.cases.entries()) {
        const root = page.locator(`[data-block-id="${id(index)}"]`);
        await expect(root, c.name).toHaveCount(1);
        if (c.hidden) {
          await expect(root, c.name).toHaveAttribute("aria-hidden", "true");
          // Nothing of it in the accessibility tree.
          expect((await root.ariaSnapshot()).trim(), c.name).toBe("");
        }
        await exposes(page, root, c, "the published page");
      }
      const published = await axe(page, { include: `[data-block-type="${widgetTest.type}"]` });
      // axe looked: at least one of its rules applied and passed (a hidden
      // widget has nothing a rule applies to).
      if (!widgetTest.cases.every((c) => c.hidden)) expect(published.passes, "axe ran its rules on the published widget").toBeGreaterThan(0);
      expect(published.serious, "the published page").toEqual([]);

      // The editor's canvas, where a hidden block stays drawn to be edited.
      await open(page, made.opened);
      for (const [index, c] of widgetTest.cases.entries()) {
        if (!c.hidden) await exposes(page, page.locator(`.canvas [data-block-id="${id(index)}"]`), c, "the canvas");
      }
      const canvas = await axe(page, { include: `.canvas [data-block-type="${widgetTest.type}"]` });
      if (!widgetTest.cases.every((c) => c.hidden)) expect(canvas.passes, "axe ran its rules on the canvas").toBeGreaterThan(0);
      expect(canvas.serious, "the editor's canvas").toEqual([]);
    } finally {
      if (found) await setShop(request, found);
    }
  });
}
