// Collections on the browser's storage (IndexedDB), as the demo keeps them,
// in Chromium with no CMS: a collection made from the Events preset, the
// other types of field added in its settings; an entry written with every
// type (an image uploaded into this browser's library, a rich text with a
// bold word), a value past its bound refused at the field with nothing
// kept, then saved, published and unpublished, each in this browser's
// words; the entries searched; one deleted after asking; everything there
// again after a reload, as the browser's storage read on its own says.
import type { Locator, Page } from "@playwright/test";
import { png } from "../helpers/images.ts";
import { column, heading, open, section } from "../helpers/site.ts";
import { expect, seedPage, test, unique } from "./fixtures.ts";
import { remoteAdapter, storagePage } from "./remote.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const story = () => [section("s", "Story", [column("c", [heading("h", "Swim when the tide stands still")])])];

async function openCollections(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Collections" }).click();
  const screen = page.getByRole("dialog", { name: "Collections" });
  await expect(screen).toBeVisible();
  return screen;
}

test("a collection, a field of every type, an entry written, refused, saved, published, unpublished, searched and deleted, all kept in this browser", async ({ page, context }) => {
  const id = await seedPage(page, "Collections here", story());
  await open(page, id);
  let screen = await openCollections(page);

  const name = `Tide events ${unique("e").slice(-6)}`;
  await screen.getByRole("button", { name: "New collection" }).first().click();
  await screen.getByRole("textbox", { name: /^Name/ }).fill(name);
  await screen.getByRole("textbox", { name: /^Name/ }).press("Tab");
  // The prefix follows the name, drawn once the name is left.
  await expect(screen.getByRole("textbox", { name: /^Prefix/ })).toHaveValue(/^tide-events-/);
  const prefix = await screen.getByRole("textbox", { name: /^Prefix/ }).inputValue();
  // No server: where the entries are is the full system's.
  await expect(screen.getByText(`Lowercase letters, digits and hyphens. In the full system, entries are at /${prefix}/<slug> once published.`)).toBeVisible();
  await screen.getByRole("radio", { name: /^Events/ }).click();
  await screen.getByRole("button", { name: "Create collection" }).click();
  await expect(screen.getByRole("button", { name: "Write the first entry" })).toBeFocused();

  await screen.getByRole("tab", { name: "Settings" }).click();
  for (const [type, label] of [["Rich text", "Body"], ["Number", "Water temperature"], ["Link", "Read more"], ["Toggle", "Members only"], ["Choice", "Level"]] as const) {
    await screen.getByRole("button", { name: "Add a field" }).click();
    await screen.getByRole("group", { name: "Add a field of the type:" }).getByRole("button", { name: new RegExp(`^${type}`) }).click();
    const card = screen.getByRole("listitem", { name: `${type}, ${type}` });
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

  await screen.getByRole("tab", { name: "Entries" }).click();
  await screen.getByRole("button", { name: "Write the first entry" }).click();
  // The form, named by its heading: "New entry", then the entry's title.
  await expect(screen.getByRole("region", { name: "New entry" })).toBeVisible();
  const form = screen.locator(".co-form");
  await form.getByRole("textbox", { name: /^Title/ }).fill("Full moon swim");
  await form.getByRole("textbox", { name: /^Title/ }).press("Tab");
  await expect(form.getByText(`Lowercase letters, digits and hyphens. In the full system, visitors find the entry at /${prefix}/full-moon-swim once it is published.`)).toBeVisible();
  await form.getByLabel(/^Date/).fill("2026-11-05");
  await form.getByRole("textbox", { name: /^Place/ }).fill("North slipway");
  await form.getByRole("textbox", { name: /^Summary/ }).fill("Under the full moon.");
  await form.getByRole("button", { name: "Choose image" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const file = `${unique("moon")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name: file, mimeType: "image/png", buffer: png(900, 600, (x) => (x < 450 ? [20, 30, 60] : [220, 220, 200])) });
  await expect(library.getByRole("radio", { name: new RegExp(`^${file.replace(/\./g, "\\.")}`) })).toBeVisible({ timeout: 30_000 });
  await library.getByRole("checkbox", { name: /This image is decorative/ }).check();
  await library.getByRole("button", { name: "Use image" }).click();
  await expect(form.getByRole("switch", { name: "Decorative" })).toBeChecked();
  const body = form.getByRole("textbox", { name: "Body" });
  await body.click();
  await page.keyboard.type("Meet at ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("ten");
  await form.getByRole("textbox", { name: /^Water temperature/ }).fill("-2");
  await form.getByRole("textbox", { name: "Words" }).fill("Sign up");
  await form.getByLabel("Address").fill("https://example.org/full-moon");
  await form.getByRole("switch", { name: "Members only" }).focus();
  await page.keyboard.press("Space");
  await form.getByRole("radiogroup", { name: "Level" }).getByRole("radio", { name: "Beginner" }).click();

  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.locator('[data-field-key="water-temperature"] .error')).toHaveText("At least 0.");
  await expect(form.getByRole("textbox", { name: /^Water temperature/ })).toBeFocused();
  await expect(screen.getByRole("button", { name: new RegExp(`^${name}, /${prefix}, no entries$`) })).toBeVisible();

  await form.getByRole("textbox", { name: /^Water temperature/ }).fill("9.5");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.locator(".co-said")).toHaveText(/^Saved, Today, /);
  await form.getByRole("button", { name: "Publish" }).click();
  await expect(form.locator(".co-said")).toHaveText(`Published in this browser. In the full system, visitors find it at /${prefix}/full-moon-swim.`);
  await form.getByRole("button", { name: "Unpublish" }).click();
  await expect(form.locator(".co-said")).toHaveText("Unpublished: it is a draft again, kept in this browser.");
  await form.getByRole("button", { name: "Publish" }).click();
  await expect(form.locator(".co-form-state")).toContainText("Published");

  // Two more, and the search.
  await form.getByRole("button", { name: "All entries" }).click();
  for (const title of ["New moon swim", "Harbour clean-up"]) {
    await screen.getByRole("button", { name: "New entry" }).click();
    const next = screen.locator(".co-form");
    await next.getByRole("textbox", { name: /^Title/ }).fill(title);
    await next.getByRole("textbox", { name: /^Title/ }).press("Tab");
    await next.getByRole("button", { name: "Save" }).click();
    await expect(next.locator(".co-said")).toHaveText(/^Saved, /);
    await next.getByRole("button", { name: "All entries" }).click();
  }
  const table = screen.getByRole("table", { name: new RegExp(`^Entries of ${name}`) });
  await expect(table.getByRole("rowheader")).toHaveCount(3);
  await screen.getByRole("searchbox", { name: `Search the titles of ${name}` }).fill("moon");
  await expect(table.getByRole("rowheader")).toHaveCount(2);
  await screen.getByRole("searchbox", { name: `Search the titles of ${name}` }).fill("");
  await expect(table.getByRole("rowheader")).toHaveCount(3);
  await screen.getByRole("button", { name: "Delete Harbour clean-up" }).click();
  await screen.getByRole("group", { name: /^Delete “Harbour clean-up” for good\?/ }).getByRole("button", { name: "Delete entry" }).click();
  await expect(table.getByRole("rowheader")).toHaveCount(2);

  // A reload: all of it is still in this browser.
  await page.reload();
  await expect(page.locator(".canvas .frame")).toBeVisible();
  screen = await openCollections(page);
  await screen.getByRole("button", { name: new RegExp(`^${name},`) }).click();
  await expect(screen.getByRole("table").getByRole("rowheader")).toHaveCount(2);
  await screen.getByRole("button", { name: "Edit Full moon swim" }).click();
  const again = screen.getByRole("region", { name: "Full moon swim" });
  await expect(again.getByRole("textbox", { name: /^Water temperature/ })).toHaveValue("9.5");
  await expect(again.locator(".co-form-state")).toContainText("Published");

  // The storage read on its own, as the demo's next visit reads it.
  const probe = await context.newPage();
  await storagePage(probe);
  const storage = remoteAdapter(probe, await probe.evaluate(() => window.storagePage!.open("probe")));
  const collection = (await storage.listCollections()).find((c) => c.prefix === prefix)!;
  expect(collection.fields.map((f) => f.type)).toEqual(["date", "text", "paragraph", "image", "richText", "number", "link", "toggle", "choice"]);
  const kept = (await storage.listEntries(collection.id)).find((e) => e.slug === "full-moon-swim")!;
  expect(kept.values).toMatchObject({
    date: "2026-11-05",
    place: "North slipway",
    summary: "Under the full moon.",
    image: { decorative: true },
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Meet at " }, { type: "text", text: "ten", marks: [{ type: "bold" }] }] }] },
    "water-temperature": 9.5,
    "read-more": { label: "Sign up", href: "https://example.org/full-moon" },
    "members-only": true,
    level: "Beginner",
  });
  expect(kept.published?.slug).toBe("full-moon-swim");
  await probe.close();
});
