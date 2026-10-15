// Collections in Chromium against the run's CMS. From the mark's menu: a
// collection made from the Articles preset, a field of every other type
// added in its settings and saved; an entry written with every type of
// field (an image uploaded in the library opened over the screen, a rich
// text with a bold word), a value past its field's bound refused at the
// field with nothing sent, then saved, published and unpublished, the CMS
// keeping each step; the entries searched by their titles; one deleted
// after asking; axe on the screen. Two tabs on one entry: the second save
// meets the conflict, and Keep mine saves it over the first. The template
// opened on the canvas as a part opens, and back. A phone's window: the
// screen the whole window, one level at a time.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { png } from "./helpers/images.ts";
import { cms, column, expect, heading, makePage, open, section, test, unique, watchQuietly } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface ApiEntry {
  id: number;
  title: string;
  slug: string;
  revision: number;
  values: Record<string, unknown>;
  published: { slug: string; values: Record<string, unknown> } | null;
}

const entries = async (request: APIRequestContext, collectionId: number): Promise<ApiEntry[]> =>
  ((await (await request.get(`${cms()}/api/collections/${collectionId}/entries`)).json()) as { entries: ApiEntry[] }).entries;

const collectionOf = async (request: APIRequestContext, prefix: string) =>
  ((await (await request.get(`${cms()}/api/collections`)).json()) as { collections: Array<{ id: number; prefix: string; name: string; fields: Array<{ key: string; type: string }>; template: { id: number } }> }).collections.find((c) => c.prefix === prefix)!;

// A collection made through the API, as the editor makes one, with an entry.
async function makeCollection(request: APIRequestContext, name: string, fields: unknown[] = [{ key: "summary", label: "Summary", type: "paragraph", required: false }]) {
  const prefix = unique("swims");
  const made = await request.post(`${cms()}/api/collections`, { data: { name, prefix, fields, sort: { by: "updatedAt", direction: "desc" } } });
  expect(made.status(), await made.text()).toBe(201);
  return { ...((await made.json()) as { id: number; template: { id: number } }), prefix };
}

async function openCollections(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Collections" }).click();
  const screen = page.getByRole("dialog", { name: "Collections" });
  await expect(screen).toBeVisible();
  return screen;
}

const story = () => [section("s", "Story", [column("c", [heading("h", "Swim when the tide stands still")])])];

test("a collection from a preset, a field of every type, an entry written, refused at a field, saved, published, unpublished, searched and deleted", { tag: "@a11y" }, async ({ page, request }) => {
  const made = await makePage(request, "Collections home", story());
  await open(page, made.id);
  const screen = await openCollections(page);

  // A collection from the Articles preset, its prefix from its name.
  const name = `Harbour news ${unique("n").slice(-6)}`;
  await screen.getByRole("button", { name: "New collection" }).first().click();
  await screen.getByRole("textbox", { name: /^Name/ }).fill(name);
  await screen.getByRole("textbox", { name: /^Name/ }).press("Tab");
  const prefixField = screen.getByRole("textbox", { name: /^Prefix/ });
  await expect(prefixField).toHaveValue(/^harbour-news-[a-z0-9-]+$/);
  const prefix = await prefixField.inputValue();
  await expect(screen.getByRole("radio", { name: /^Articles/ })).toHaveAttribute("aria-checked", "true");
  await screen.getByRole("button", { name: "Create collection" }).click();
  await expect(screen.getByRole("button", { name: "Write the first entry" })).toBeFocused();
  const collection = await collectionOf(request, prefix);
  expect(collection.fields.map((f) => f.type)).toEqual(["paragraph", "image", "richText", "date"]);

  // The other five types, added in the settings and saved in one change.
  await screen.getByRole("tab", { name: "Settings" }).click();
  for (const [type, label] of [["Text", "Place"], ["Number", "Water temperature"], ["Link", "Read more"], ["Toggle", "Members only"], ["Choice", "Level"]] as const) {
    await screen.getByRole("button", { name: "Add a field" }).click();
    await screen.getByRole("group", { name: "Add a field of the type:" }).getByRole("button", { name: new RegExp(`^${type}`) }).click();
    const card = screen.getByRole("listitem", { name: `${type}, ${type}` });
    await expect(card.getByRole("textbox", { name: "Label" })).toBeFocused();
    await card.getByRole("textbox", { name: "Label" }).fill(label);
    await card.getByRole("textbox", { name: "Label" }).press("Tab");
    const named = screen.getByRole("listitem", { name: `${label}, ${type}` });
    if (type === "Number") {
      await named.getByRole("textbox", { name: "Lowest" }).fill("0");
      await named.getByRole("textbox", { name: "Highest" }).fill("30");
      await named.getByRole("textbox", { name: "Highest" }).press("Tab");
    }
    if (type === "Choice") {
      await named.getByRole("textbox", { name: "Option 1" }).fill("Beginner");
      await named.getByRole("button", { name: "Add option" }).click();
      await named.getByRole("textbox", { name: "Option 2" }).fill("Strong");
      await named.getByRole("textbox", { name: "Option 2" }).press("Tab");
    }
  }
  await screen.getByRole("button", { name: "Save changes" }).click();
  await expect(screen.locator(".co-settings-head .co-said")).toHaveText("Saved.");
  expect((await collectionOf(request, prefix)).fields.map((f) => [f.key, f.type])).toEqual([
    ["summary", "paragraph"], ["image", "image"], ["body", "richText"], ["date", "date"],
    ["place", "text"], ["water-temperature", "number"], ["read-more", "link"], ["members-only", "toggle"], ["level", "choice"],
  ]);

  // An entry, every type of field written.
  await screen.getByRole("tab", { name: "Entries" }).click();
  await screen.getByRole("button", { name: "Write the first entry" }).click();
  // The form, named by its heading: "New entry", then the entry's title.
  await expect(screen.getByRole("region", { name: "New entry" })).toBeVisible();
  const form = screen.locator(".co-form");
  await expect(form.getByRole("textbox", { name: /^Title/ })).toBeFocused();
  await form.getByRole("textbox", { name: /^Title/ }).fill("First swim of the season");
  await form.getByRole("textbox", { name: /^Title/ }).press("Tab");
  await expect(form.getByRole("textbox", { name: /^Slug/ })).toHaveValue("first-swim-of-the-season");
  await form.getByRole("textbox", { name: /^Summary/ }).fill("Cold water,\nwarm hearts.");
  // The image, uploaded in the library opened over the screen: the
  // library's images only, and Esc there closes it alone.
  await form.getByRole("button", { name: "Choose image" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  await expect(library.getByText("Or an image from another site")).toHaveCount(0);
  const file = `${unique("harbour")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name: file, mimeType: "image/png", buffer: png(1200, 800, (x) => (x < 600 ? [30, 110, 90] : [230, 200, 140])) });
  await expect(library.getByRole("radio", { name: new RegExp(`^${file.replace(/\./g, "\\.")}`) })).toBeVisible({ timeout: 30_000 });
  await library.getByRole("textbox", { name: /^Alt text/ }).fill("The harbour at dawn");
  await library.getByRole("button", { name: "Use image" }).click();
  await expect(library).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Replace image" })).toBeFocused();
  await expect(form.getByRole("textbox", { name: /^Alt text/ })).toHaveValue("The harbour at dawn");
  // The rich text, in the text widget's editor, a word made bold.
  const body = form.getByRole("textbox", { name: "Body" });
  await body.click();
  await page.keyboard.type("The tide stood still at nine. ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("Bring a towel.");
  await form.getByLabel(/^Date/).fill("2026-10-15");
  await form.getByRole("textbox", { name: /^Place/ }).fill("North slipway");
  await form.getByRole("textbox", { name: /^Water temperature/ }).fill("45");
  await form.getByRole("textbox", { name: "Words" }).fill("Join us");
  await form.getByLabel("Address").fill("/join");
  await form.getByRole("switch", { name: "Members only" }).focus();
  await page.keyboard.press("Space");
  await form.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "Strong" }).click();

  // Past its bound: said at the field, the focus on it, nothing sent.
  await form.getByRole("button", { name: "Save" }).click();
  const temperature = form.getByRole("textbox", { name: /^Water temperature/ });
  await expect(temperature).toHaveAttribute("aria-invalid", "true");
  await expect(temperature).toBeFocused();
  await expect(form.locator(".co-said")).toHaveText("Not saved: one field needs a change, marked below.");
  await expect(form.locator('[data-field-key="water-temperature"] .error')).toHaveText("At most 30.");
  expect(await entries(request, collection.id)).toEqual([]);

  await temperature.fill("14.5");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.locator(".co-said")).toHaveText(/^Saved, Today, /);
  await expect(screen.getByRole("region", { name: "First swim of the season" })).toBeVisible();
  const [kept] = await entries(request, collection.id);
  expect(kept).toMatchObject({
    title: "First swim of the season",
    slug: "first-swim-of-the-season",
    published: null,
    values: {
      summary: "Cold water,\nwarm hearts.",
      image: { alt: "The harbour at dawn" },
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The tide stood still at nine. " }, { type: "text", text: "Bring a towel.", marks: [{ type: "bold" }] }] }] },
      date: "2026-10-15",
      place: "North slipway",
      "water-temperature": 14.5,
      "read-more": { label: "Join us", href: "/join" },
      "members-only": true,
      level: "Strong",
    },
  });
  expect(typeof (kept!.values.image as { mediaId: unknown }).mediaId).toBe("string");

  await form.getByRole("button", { name: "Publish" }).click();
  await expect(form.locator(".co-said")).toHaveText(`Published: visitors find it at /${prefix}/first-swim-of-the-season.`);
  expect((await entries(request, collection.id))[0]?.published?.slug).toBe("first-swim-of-the-season");

  const report = await axe(page, { include: ".dlg-collections" });
  for (const line of report.other) console.log(`Collections: ${line}`);
  expect(report.passes).toBeGreaterThan(10);
  expect(report.serious).toEqual([]);

  await form.getByRole("button", { name: "Unpublish" }).click();
  await expect(form.locator(".co-said")).toHaveText("Unpublished: visitors no longer find it. Its draft is kept.");
  expect((await entries(request, collection.id))[0]?.published).toBeNull();

  // Three more, made through the API; the list reads them, and the search
  // asks the CMS for the titles that hold a word.
  for (const title of ["Night swim", "Race day", "Second swim"]) {
    const added = await request.post(`${cms()}/api/collections/${collection.id}/entries`, { data: { title, slug: title.toLowerCase().replace(/ /g, "-"), values: {} } });
    expect(added.status(), await added.text()).toBe(201);
  }
  await form.getByRole("button", { name: "All entries" }).click();
  const table = screen.getByRole("table", { name: new RegExp(`^Entries of ${name}`) });
  await expect(table.getByRole("rowheader")).toHaveCount(4);
  await expect(screen.getByText("4 entries, none published")).toBeVisible();
  await screen.getByRole("searchbox", { name: `Search the titles of ${name}` }).fill("SWIM");
  await expect(table.getByRole("rowheader")).toHaveCount(3);
  await expect(screen.getByText("3 entries hold “SWIM”")).toBeVisible();

  // Deleted after asking: Esc keeps it; Delete takes it, the CMS too.
  await screen.getByRole("button", { name: "Delete Night swim" }).click();
  const question = screen.getByRole("group", { name: /^Delete “Night swim” for good\?/ });
  await expect(question.getByRole("button", { name: "Keep it" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(screen).toBeVisible();
  await expect(screen.getByRole("button", { name: "Delete Night swim" })).toBeFocused();
  await page.keyboard.press("Enter");
  await screen.getByRole("group", { name: /^Delete “Night swim” for good\?/ }).getByRole("button", { name: "Delete entry" }).click();
  await expect(table.getByRole("rowheader")).toHaveCount(2);
  await expect(screen.getByRole("status").filter({ hasText: "“Night swim” was deleted." })).toBeVisible();
  expect((await entries(request, collection.id)).map((e) => e.title).sort()).toEqual(["First swim of the season", "Race day", "Second swim"]);

  // Esc closes the screen, the focus back on the mark's key.
  await page.keyboard.press("Escape");
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Page Builder CMS menu" })).toBeFocused();
});

test("two tabs on one entry: the second save meets the conflict, and Keep mine saves it over the first", async ({ page, request, context, baseURL }) => {
  const made = await makePage(request, "Two tabs on an entry", story());
  const name = `Tide notes ${unique("t").slice(-6)}`;
  const collection = await makeCollection(request, name);
  const added = await request.post(`${cms()}/api/collections/${collection.id}/entries`, { data: { title: "Morning swim", slug: "morning-swim", values: { summary: "As it was." } } });
  expect(added.status()).toBe(201);
  const other = await context.newPage();
  // The browser's own line for the CMS's 409, which the second save gets.
  const errors = await watchQuietly(other, baseURL!, /status of 409 \(Conflict\)/);
  const forms: Locator[] = [];
  for (const tab of [page, other]) {
    await open(tab, made.id);
    const screen = await openCollections(tab);
    await screen.getByRole("button", { name: new RegExp(`^${name},`) }).click();
    await screen.getByRole("button", { name: "Edit Morning swim" }).click();
    forms.push(screen.getByRole("region", { name: "Morning swim" }));
  }
  const [first, second] = forms as [Locator, Locator];
  await first.getByRole("textbox", { name: /^Summary/ }).fill("The first tab's words.");
  await first.getByRole("button", { name: "Save" }).click();
  await expect(first.locator(".co-said")).toHaveText(/^Saved, /);
  await second.getByRole("textbox", { name: /^Summary/ }).fill("The second tab's words.");
  await second.getByRole("button", { name: "Save" }).click();
  const banner = second.getByRole("alert");
  await expect(banner).toContainText("Changed in another tab. This entry was saved in another tab after you opened it. Saving waits until you choose.");
  expect((await entries(request, collection.id))[0]?.values).toEqual({ summary: "The first tab's words." });
  await banner.getByRole("button", { name: "Keep mine" }).click();
  await expect(second.locator(".co-said")).toHaveText(/^Kept this tab’s entry: it is saved over the other one, /);
  const [entry] = await entries(request, collection.id);
  expect(entry?.values).toEqual({ summary: "The second tab's words." });
  expect(entry?.revision).toBe(2);
  expect(errors).toEqual([]);
});

test("Edit the template opens it on the canvas as a part opens, its Page tab saying whose it is, and leads back to the collection", async ({ page, request }) => {
  const made = await makePage(request, "Template home", story());
  const name = `Events ${unique("e").slice(-6)}`;
  const collection = await makeCollection(request, name);
  await open(page, made.id);
  const screen = await openCollections(page);
  await screen.getByRole("button", { name: new RegExp(`^${name},`) }).click();
  await screen.getByRole("tab", { name: "Settings" }).click();
  await screen.getByRole("button", { name: "Edit the template" }).click();
  await expect(screen).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Switch page. Open: ${name}` })).toBeVisible();
  await expect(page.locator(".tb-page-where")).toHaveText("every entry");
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Page" }).click();
  await expect(sidebar.locator(".ed-title")).toContainText(`Template of ${name}`);
  await expect(sidebar).toContainText(`Every entry of ${name} is drawn with this template at its own address, /${collection.prefix}/<slug>, between the site’s header and footer.`);
  expect(new URL(page.url()).searchParams.get("page")).toBe(String(collection.template.id));
  // The way back to the collection, on its settings.
  await sidebar.getByRole("button", { name: `${name} in Collections` }).click();
  const again = page.getByRole("dialog", { name: "Collections" });
  await expect(again.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  await expect(again.getByRole("button", { name: new RegExp(`^${name},`) })).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await sidebar.getByRole("button", { name: "Back to Template home" }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: Template home" })).toBeVisible();
});

test.describe("in a phone's window, with a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Collections from More: the whole window, the collections and then the one chosen, with the way back", { tag: "@a11y" }, async ({ page, request }) => {
    const made = await makePage(request, "Phone collections", story());
    const name = `Phone news ${unique("p").slice(-6)}`;
    const collection = await makeCollection(request, name);
    await request.post(`${cms()}/api/collections/${collection.id}/entries`, { data: { title: "Morning swim", slug: "morning-swim", values: { summary: "Cold." } } });
    await open(page, made.id);
    await page.locator(".phonebar").getByRole("button", { name: "More" }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Collections" }).tap();
    const screen = page.getByRole("dialog", { name: "Collections" });
    await expect(screen).toBeVisible();
    const box = (await screen.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(390 - 16 - 1);
    // The collections first, a level of their own.
    await expect(screen.getByRole("tab", { name: "Entries" })).toHaveCount(0);
    await screen.getByRole("button", { name: new RegExp(`^${name},`) }).tap();
    await expect(screen.getByRole("navigation", { name: "Collections" })).toBeHidden();
    await expect(screen.getByRole("rowheader")).toHaveText(["Morning swim/" + collection.prefix + "/morning-swim"]);
    const sideways = await screen.locator(".co-pane").evaluate((pane) => pane.scrollWidth - pane.clientWidth);
    expect(sideways, "the pane scrolls sideways").toBeLessThanOrEqual(0);
    const report = await axe(page, { include: ".dlg-collections" });
    for (const line of report.other) console.log(`Collections on a phone: ${line}`);
    expect(report.serious).toEqual([]);
    await screen.getByRole("button", { name: "Collections", exact: true }).tap();
    await expect(screen.getByRole("navigation", { name: "Collections" })).toBeVisible();
    await screen.getByRole("button", { name: "Close", exact: true }).tap();
    await expect(screen).toHaveCount(0);
  });
});
