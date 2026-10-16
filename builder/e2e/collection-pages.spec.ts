// Collections on the site, in Chromium against the run's CMS. A page with
// a Collection list: the canvas draws the collection's published entries,
// never a draft, and its panel says how many it leaves out; published, the
// CMS draws the same cards, each leading to its entry's page. A template:
// Field blocks inserted from This entry draw the first published entry,
// then the entry picked in the Page tab, which Preview shows too; a field
// with nothing to draw is noted on the canvas; published, each entry's
// page is served at /<prefix>/<slug>, and a draft's address is not found. The cache, in a visitor's browser: the
// list's page and an entry's page are kept and revalidated with a 304
// while nothing they show changes, and change at the next visit when an
// entry is published, renamed or taken off; an address an entry had
// answers 301 to the one it has now.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { block } from "./helpers/canvas.ts";
import { makeCollection, makeEntry, publishEntry, publishPage, saveDocument, saveEntry, unpublishEntry, type MadeCollection } from "./helpers/collections.ts";
import { cms, column, drawer, expect, heading, makePage, open, section, test, unique, widget } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const FIELDS = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "day", label: "Day", type: "date", required: false },
];
const BY_DAY = { by: "day", direction: "desc" } as const;

// A collection ordered by its day, its template published: the entry's
// title as the page's heading, its day, its summary.
async function withTemplate(request: APIRequestContext, name: string): Promise<MadeCollection> {
  const collection = await makeCollection(request, `${name} ${unique("c").slice(-6)}`, FIELDS, BY_DAY);
  await saveDocument(request, collection.templateId, name, [section("s", "Entry", [column("c", [
    widget("t", "field", { field: "title", level: 1 }), widget("d", "field", { field: "day" }), widget("p", "field", { field: "summary" }),
  ])])]);
  return collection;
}

const listOf = (collectionId: number) =>
  widget("list", "collectionList", { collection: collectionId, count: 6, order: BY_DAY, layout: "grid", columns: 3, date: "day", excerpt: "summary", linkLabel: "Read more", emptyText: "No news yet." });

// The cards' titles, in the list's order.
const titles = (where: Page | Locator) => where.locator(".sw-entry-title");
const listIn = (tab: Page) => tab.locator('[data-block-id="list"]');

async function tabOpenedBy(page: Page, action: () => Promise<void>, url: string): Promise<Page> {
  const opening = page.context().waitForEvent("page");
  await action();
  const tab = await opening;
  await tab.waitForURL(url);
  await tab.waitForLoadState("load");
  return tab;
}

test("a Collection list draws the published entries on the canvas, never a draft, and the CMS's page draws the same cards, each leading to its entry's page", async ({ page, request, browser }) => {
  const collection = await withTemplate(request, "Harbour news");
  await makeEntry(request, collection, { title: "Dawn swims start again", slug: "dawn-swims", values: { summary: "Twice a week at first light.", day: "2026-05-02" } });
  await makeEntry(request, collection, { title: "Winter series opens", slug: "winter-series", values: { summary: "Ten swims from November to March.", day: "2026-11-01" } });
  await makeEntry(request, collection, { title: "Night swim", slug: "night-swim", values: { day: "2026-12-24" } }, { publish: false });
  const made = await makePage(request, "Club news", [section("s", "News", [column("c", [heading("h", "From the club"), listOf(collection.id)])])]);

  await open(page, made.id);
  await expect(titles(block(page, "list"))).toHaveText(["Winter series opens", "Dawn swims start again"]);
  await block(page, "list").click();
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await expect(sidebar).toContainText("A list shows published entries only. 1 draft is not shown.");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");

  const reader = await visitor(browser);
  try {
    expect((await reader.visit(`${cms()}/${made.slug}`)).status).toBe(200);
    await expect(titles(listIn(reader.tab))).toHaveText(["Winter series opens", "Dawn swims start again"]);
    await expect(listIn(reader.tab).locator(".sw-entry-date")).toHaveText(["1 November 2026", "2 May 2026"]);
    await expect(reader.tab.getByText("Night swim")).toHaveCount(0);
    const link = reader.tab.getByRole("link", { name: "Winter series opens", exact: true });
    await expect(link).toHaveAttribute("href", `/${collection.prefix}/winter-series`);

    // The card's foot, which the title's link covers, leads there too: a
    // click where its words are drawn lands on the link.
    const foot = (await listIn(reader.tab).locator(".sw-entry-more").first().boundingBox())!;
    await reader.tab.mouse.click(foot.x + foot.width / 2, foot.y + foot.height / 2);
    await reader.tab.waitForURL(`${cms()}/${collection.prefix}/winter-series`);
    await expect(reader.tab.locator('[data-block-id="t"] h1')).toHaveText("Winter series opens");
    await expect(reader.tab).toHaveTitle("Winter series opens");
    await expect(reader.tab.locator('[data-block-id="p"]')).toHaveText("Ten swims from November to March.");
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
});

test("a template's Field blocks, from This entry, draw the first published entry, then the one picked, which Preview shows; published, the entry's page is served and a draft's address is not found", async ({ page, request, browser }) => {
  const collection = await makeCollection(request, `Events ${unique("e").slice(-6)}`, FIELDS, BY_DAY);
  await makeEntry(request, collection, { title: "Harbour swim", slug: "harbour-swim", values: { summary: "Meet at the slipway.", day: "2026-06-01" } });
  const draft = await makeEntry(request, collection, { title: "Lake swim", slug: "lake-swim", values: { summary: "A coach leaves at eight.", day: "2026-07-01" } }, { publish: false });
  await makeEntry(request, collection, { title: "Pool swim", slug: "pool-swim", values: { day: "2026-08-01" } }, { publish: false });
  await saveDocument(request, collection.templateId, "Events", [section("s", "Entry", [column("c", [heading("h", "Club events")])])], { publish: false });
  await open(page, collection.templateId);

  // This entry comes first, its Field block alone; a new one draws the
  // title of the first published entry, the draft of 1 July being none.
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await expect(insert.getByRole("group", { name: "This entry" }).getByRole("button")).toHaveText(["Field"]);
  await insert.getByRole("group", { name: "This entry" }).getByRole("button", { name: "Field" }).click();
  const fields = page.locator('.canvas [data-block-type="field"]');
  await expect(fields).toHaveCount(1);
  await expect(fields.first().getByRole("heading", { level: 1 })).toHaveText("Harbour swim");

  // A second, showing the summary, as the panel chooses it.
  await insert.getByRole("group", { name: "This entry" }).getByRole("button", { name: "Field" }).click();
  await expect(fields).toHaveCount(2);
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("combobox", { name: "Field", exact: true }).selectOption({ label: "Summary" });
  await expect(fields.nth(1).locator("p")).toHaveText("Meet at the slipway.");

  // The Page tab picks the entry the canvas draws, and Preview's.
  await sidebar.getByRole("tab", { name: "Page" }).click();
  const picker = sidebar.getByRole("combobox", { name: "Preview with" });
  await expect(picker.locator("option")).toHaveText(["Pool swim (draft)", "Lake swim (draft)", "Harbour swim", "Sample values"]);
  await picker.selectOption({ label: "Lake swim (draft)" });
  await expect(fields.first().getByRole("heading", { level: 1 })).toHaveText("Lake swim");
  await expect(fields.nth(1).locator("p")).toHaveText("A coach leaves at eight.");
  const preview = await tabOpenedBy(page, () => page.getByRole("link", { name: "Preview" }).click(), `${cms()}/preview/${collection.templateId}?entry=${draft.id}`);
  await expect(preview.locator(".w-field h1")).toHaveText("Lake swim");
  await expect(preview).toHaveTitle("Preview: Lake swim");
  await preview.close();
  // A draft with no summary: its field draws nothing, which the canvas
  // alone says, faintly, where the block is.
  await picker.selectOption({ label: "Pool swim (draft)" });
  await expect(fields.nth(1).locator(".field-none")).toBeVisible();
  await expect(fields.nth(1).locator(".field-none")).toHaveText("No “Summary” in this entry");

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");
  const reader = await visitor(browser);
  try {
    expect((await reader.visit(`${cms()}/${collection.prefix}/harbour-swim`)).status).toBe(200);
    await expect(reader.tab.locator('[data-block-id="h"]')).toHaveText("Club events");
    await expect(reader.tab.locator(".w-field h1")).toHaveText("Harbour swim");
    await expect(reader.tab.getByText("Meet at the slipway.")).toBeVisible();
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
  expect((await request.get(`${cms()}/${collection.prefix}/lake-swim`)).status(), "a draft's address").toBe(404);
  expect((await request.get(`${cms()}/${collection.prefix}/no-such-entry`)).status(), "an address no entry has").toBe(404);
});

test("an entry published, renamed and moved, then taken off: the list's page and the entry's change at the next visit, kept with a 304 in between; the address it had answers 301 to the new one", async ({ request, browser }) => {
  const collection = await withTemplate(request, "Tide news");
  const spring = await makeEntry(request, collection, { title: "Spring tides", slug: "spring-tides", values: { summary: "Big water.", day: "2026-04-01" } });
  const made = await makePage(request, "Tide page", [section("s", "News", [column("c", [listOf(collection.id)])])]);
  await publishPage(request, made.id);
  const live = `${cms()}/${made.slug}`;
  const entryPage = (slug: string) => `${cms()}/${collection.prefix}/${slug}`;

  const reader = await visitor(browser);
  try {
    const first = await reader.visit(live);
    expect(first.status).toBe(200);
    await expect(titles(listIn(reader.tab))).toHaveText(["Spring tides"]);
    expect(await reader.visit(live)).toMatchObject({ sent: first.etag, status: 304 });

    // Another entry published: the list's page changes.
    await makeEntry(request, collection, { title: "Neap tides", slug: "neap-tides", values: { summary: "Small water.", day: "2026-04-09" } });
    const second = await reader.visit(live);
    expect([second.sent, second.status]).toEqual([first.etag, 200]);
    await expect(titles(listIn(reader.tab))).toHaveText(["Neap tides", "Spring tides"]);

    // The entry's own page, kept as a page is; a draft saved changes
    // nothing a visitor sees.
    const own = await reader.visit(entryPage("spring-tides"));
    expect(own.status).toBe(200);
    const moved = await saveEntry(request, collection, spring, { title: "Spring tides are here", slug: "spring-tides-here", values: { summary: "Big water.", day: "2026-04-01" } });
    expect(await reader.visit(entryPage("spring-tides"))).toMatchObject({ sent: own.etag, status: 304 });
    expect(await reader.visit(live)).toMatchObject({ sent: second.etag, status: 304 });

    // Published under its new title and slug: the old address answers 301
    // to the new, and the list's card says and links the new.
    await publishEntry(request, collection, moved);
    const old = await request.get(entryPage("spring-tides"), { maxRedirects: 0 });
    expect(old.status()).toBe(301);
    expect(new URL(old.headers().location ?? "", cms()).href).toBe(entryPage("spring-tides-here"));
    expect((await reader.visit(entryPage("spring-tides-here"))).status).toBe(200);
    await expect(reader.tab.locator('[data-block-id="t"] h1')).toHaveText("Spring tides are here");
    const third = await reader.visit(live);
    expect([third.sent, third.status]).toEqual([second.etag, 200]);
    await expect(titles(listIn(reader.tab))).toHaveText(["Neap tides", "Spring tides are here"]);
    await expect(reader.tab.getByRole("link", { name: "Spring tides are here", exact: true })).toHaveAttribute("href", `/${collection.prefix}/spring-tides-here`);

    // Taken off: its page and the address it had are not found, and the
    // list leaves it out.
    await unpublishEntry(request, collection, moved);
    expect((await request.get(entryPage("spring-tides-here"))).status()).toBe(404);
    expect((await request.get(entryPage("spring-tides"), { maxRedirects: 0 })).status()).toBe(404);
    const fourth = await reader.visit(live);
    expect([fourth.sent, fourth.status]).toEqual([third.etag, 200]);
    await expect(titles(listIn(reader.tab))).toHaveText(["Neap tides"]);
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
});
