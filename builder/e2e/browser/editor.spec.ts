// The editor itself on the browser's storage, in Chromium, with no CMS:
// - an edit is saved in this browser and is there after a reload;
// - two tabs of one browser on one page: the tab that saves second gets
//   the conflict bar the CMS's 409 gives, unchanged, and Reload takes the
//   other tab's words;
// - an image goes into the library from this browser, drawn again at
//   2400 px on its long side first as for the CMS, and shows from its own
//   blob; one larger than 10 MB even then is refused in this browser's words,
//   with no CMS to blame;
// - what this storage cannot do has no control: no Schedule, no Form
//   responses.
import type { Page } from "@playwright/test";
import { block } from "../helpers/canvas.ts";
import { headingWords, retitle, saveState } from "../helpers/heading.ts";
import { png } from "../helpers/images.ts";
import { column, heading, open, saved, section } from "../helpers/site.ts";
import { expect, seedPage, test, unique, watchQuietly } from "./fixtures.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const story = (words: string) => [section("s", "Story", [column("c", [heading("h", words)])])];

const banner = (page: Page) => page.getByRole("alert");

test("an edit is kept in this browser, and the page is as it was left after a reload", async ({ page }) => {
  const id = await seedPage(page, "Kept here", story("First words"));
  await open(page, id);
  await expect(headingWords(page)).toHaveText("First words");
  await retitle(page, "Words kept in this browser");
  await saved(page);
  await page.reload();
  await expect(page.locator(".canvas .frame")).toBeVisible();
  await expect(headingWords(page)).toHaveText("Words kept in this browser");
  await expect(saveState(page)).toHaveText("Saved");
});

test("two tabs of one browser: the one that saves second gets the conflict bar, and Reload takes the other's words", async ({ page: first, context, baseURL }) => {
  const id = await seedPage(first, "Two tabs here", story("First words"));
  const second = await context.newPage();
  const errors = await watchQuietly(second, baseURL!);
  await open(first, id);
  await open(second, id);

  await retitle(first, "Words from the first tab");
  await saved(first);
  await retitle(second, "Words from the second tab");
  await expect(banner(second)).toContainText("Changed in another tab. This page was saved in another tab after you opened it. Saving is paused until you choose.");
  await expect(saveState(second)).toHaveText("Changed in another tab");

  await banner(second).getByRole("button", { name: "Reload" }).click();
  await expect(banner(second)).toHaveCount(0);
  await expect(headingWords(second)).toHaveText("Words from the first tab");
  await expect(saveState(second)).toHaveText("Saved");
  // At the revision the first tab's save made, its next edit saves.
  await retitle(second, "The second tab, after reloading");
  await saved(second);
  await first.reload();
  await expect(headingWords(first)).toHaveText("The second tab, after reloading");
  expect(errors).toEqual([]);
});

test("an image goes into the library from this browser, drawn again at 2400 px first, and shows from its own blob", async ({ page }) => {
  const id = await seedPage(page, "With a picture", story("At the harbour"));
  await open(page, id);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  await expect(dialog).toBeVisible();
  const name = `${unique("harbour")}.png`;
  await dialog.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(3000, 1500, (x) => (x < 1500 ? [30, 110, 90] : [230, 200, 140])) });
  const tile = dialog.getByRole("radio", { name: `${name}, no alt text` });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  const shown = tile.locator("img");
  await expect.poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(2400);
  expect(await shown.getAttribute("src")).toMatch(/^blob:http:\/\/127\.0\.0\.1:\d+\//);
  // Still there, from the database, in a tab opened afresh.
  await page.reload();
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const again = page.getByRole("dialog", { name: "Media library" }).getByRole("radio", { name: `${name}, no alt text` }).locator("img");
  await expect.poll(() => again.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(2400);
});

test("a large image is refused in this browser's words: it keeps images up to 10 MB, and no CMS is named", async ({ page }) => {
  const id = await seedPage(page, "Too large", story("At the harbour"));
  await open(page, id);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  // 4000 by 3000 of noise, the high bits of a 32-bit generator: it does not
  // compress, and after the editor draws it again at 2400 pixels it is
  // still larger than the 10 MB the storage keeps.
  let seed = 11;
  const noise = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
  const name = `${unique("noise")}.png`;
  await dialog.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(4000, 3000, () => [noise(), noise(), noise()]) });
  const said = dialog.getByText(/This browser keeps images up to 10 MB: ready to go up it is [\d.]+ MB\. Save it as JPEG or WebP, or crop it, and upload it again\./);
  await expect(said).toBeVisible({ timeout: 60_000 });
  expect(await dialog.innerText()).not.toMatch(/\bCMS\b/);
  await expect(dialog.getByRole("radio", { name: new RegExp(`^${name}`) })).toHaveCount(0);
});

test("what the browser's storage cannot do has no control: no Schedule, no Form responses", async ({ page }) => {
  const id = await seedPage(page, "Nothing dead", story("Plain"));
  await open(page, id);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  const menu = page.getByRole("menu", { name: "Page Builder CMS" });
  await expect(menu.getByRole("menuitem", { name: "Media library" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Form responses" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More publish options" }).click();
  const options = page.getByRole("menu", { name: "Publish options" });
  await expect(options.getByRole("menuitem").first()).toBeVisible();
  await expect(options.getByRole("menuitem", { name: /Schedule/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(block(page, "h")).toBeVisible();
});
