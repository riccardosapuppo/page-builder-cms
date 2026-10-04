// The same page open in two tabs, each a browser context of its own (two
// people, or one person twice), against the run's CMS:
// - both edit, one saves first, the other's save gets the CMS's 409: its
//   conflict bar, saving and Publish paused, the server keeping the first
//   tab's words; Reload takes the server's draft, after which that tab
//   saves again with no conflict, and the reload is a step of the history
//   that tab can go back past;
// - the other choice, Keep mine, keeps the first tab's page as a version,
//   then saves the second tab's over it with the revision the conflict
//   named; the first tab, now behind, meets the conflict in turn on its
//   next edit;
// - an unknown outcome in a tab whose save the network drops: the toast,
//   the countdown, closing the tab asks first; the other tab saves
//   meanwhile; the very same save (same saveId) sent again meets the
//   conflict, which is definite, and Keep mine settles it;
// - a restore made in one tab is a change the other is told about.
import type { Browser, BrowserContext, Page, Request } from "@playwright/test";
import { asksBeforeClosing, headingText, headingWords as words, retitle, saveState } from "./helpers/heading.ts";
import { block } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { cms, column, draftOf, drawer, expect, heading, makePage, open, saved, section, test, unique } from "./helpers/site.ts";

const VIEWPORT = { width: 1440, height: 900 };
test.use({
  viewport: VIEWPORT,
  // The browser's own lines for what these tests make happen: the CMS's
  // 409 to a save from a revision another tab moved on from, and a save
  // the network drops.
  allowConsole: /status of 409 \(Conflict\)|net::ERR_INTERNET_DISCONNECTED/,
});

const fixture = () => [section("s", "Story", [column("c", [heading("h", "First words")])])];
const DRAFT = "**/api/pages/*/draft";

// The second tab: a context of its own, held to what the first tab's is
// held to by the shared fixture (helpers/site.ts): no error on the page or
// in its console but the lines this file allows, and no request outside
// the run's two servers.
async function secondTab(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await browser.newContext({ baseURL, viewport: VIEWPORT, locale: "en-US", timezoneId: "UTC" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 409 \(Conflict\)|net::ERR_INTERNET_DISCONNECTED/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(baseURL) || url.startsWith(cms())) return route.fallback();
    errors.push(`request outside the run's servers: ${url}`);
    return route.abort();
  });
  return { context, page, errors };
}

const banner = (page: Page) => page.getByRole("alert");
const publishButton = (page: Page) => page.getByRole("button", { name: "Publish", exact: true });

// The conflict as the tab that lost the race shows it.
async function inConflict(page: Page) {
  await expect(banner(page)).toContainText("Changed in another tab. This page was saved in another tab after you opened it. Saving is paused until you choose.");
  await expect(saveState(page)).toHaveText("Changed in another tab");
  await expect(publishButton(page)).toHaveAttribute("aria-disabled", "true");
}

test("two tabs edit the same page: the one that saves second gets the conflict bar, and Reload takes the server's draft", { tag: "@a11y" }, async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Two tabs, reload", fixture());
  const other = await secondTab(browser, baseURL!);
  const second = other.page;
  try {
    await open(first, id);
    await open(second, id);

    await retitle(first, "Words from the first tab");
    await saved(first);
    await retitle(second, "Words from the second tab");
    await inConflict(second);
    // Saving waits: the CMS keeps the first tab's words.
    expect(await headingText(request, id)).toBe("Words from the first tab");
    // Closing the second tab now would lose its words: it asks first.
    expect(await asksBeforeClosing(second)).toBe(true);

    await banner(second).getByRole("button", { name: "Reload" }).click();
    await expect(banner(second)).toHaveCount(0);
    await expect(words(second)).toHaveText("Words from the first tab");
    await expect(saveState(second)).toHaveText("Saved");
    expect(await asksBeforeClosing(second)).toBe(false);

    // The reloaded tab is at the server's revision: its next edit saves.
    const before = (await draftOf(request, id)).revision;
    await retitle(second, "The second tab, after reloading");
    await saved(second);
    await expect(banner(second)).toHaveCount(0);
    const draft = await draftOf(request, id);
    expect(draft.revision).toBe(before + 1);
    expect(await headingText(request, id)).toBe("The second tab, after reloading");

    // The reload is a step of this session: going back to before it brings
    // the second tab's own words back, and saves them.
    const steps = (await drawer(second, "History")).getByRole("list", { name: "This session" }).getByRole("button");
    await expect(steps.locator(".hist-what")).toHaveText(["Changed Heading in Story", "Reloaded the page saved in another tab", "Changed Heading in Story"]);
    await steps.nth(2).click();
    await expect(words(second)).toHaveText("Words from the second tab");
    await saved(second);
    expect(await headingText(request, id)).toBe("Words from the second tab");
    expect(other.errors).toEqual([]);
  } finally {
    await other.context.close();
  }
});

test("Keep mine saves the second tab's page over the first one's at the revision the conflict named, and the first tab meets the conflict in turn", async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Two tabs, keep mine", fixture());
  const other = await secondTab(browser, baseURL!);
  const second = other.page;
  try {
    await open(first, id);
    await open(second, id);
    await retitle(first, "Words from the first tab");
    await saved(first);
    const afterFirst = (await draftOf(request, id)).revision;

    const sent: Array<{ revision: number }> = [];
    second.on("request", (r: Request) => {
      if (r.method() === "PUT" && r.url().endsWith("/draft")) sent.push(JSON.parse(r.postData() ?? "{}") as { revision: number });
    });
    await retitle(second, "Words from the second tab");
    await inConflict(second);
    await banner(second).getByRole("button", { name: "Keep mine" }).click();
    await expect(banner(second)).toHaveCount(0);
    await saved(second);
    // The first send started from the revision the second tab opened; the
    // one Keep mine sent, from the revision the conflict named.
    expect(sent.map((s) => s.revision)).toEqual([afterFirst - 1, afterFirst]);
    expect(await headingText(request, id)).toBe("Words from the second tab");
    await expect(publishButton(second)).not.toHaveAttribute("aria-disabled", "true");
    // The page saved over is kept as a version first: Restore can bring it
    // back.
    await expect(second.locator(".notice")).toHaveText("Kept this tab’s page: it is saved over the one on the server, which is kept in Versions as “Before Keep mine”.");
    const listed = ((await (await request.get(`${cms()}/api/pages/${id}/versions`)).json()) as { versions: Array<{ number: number; reason: string; name: string | null }> }).versions;
    const keptBefore = listed.find((v) => v.name === "Before Keep mine");
    expect(keptBefore).toMatchObject({ reason: "manual" });
    const keptDocument = (await (await request.get(`${cms()}/api/pages/${id}/versions/${keptBefore!.number}`)).json()) as { document: { sections: Array<{ children: Array<{ children: Array<{ props: { text: string } }> }> }> } };
    expect(keptDocument.document.sections[0]!.children[0]!.children[0]!.props.text).toBe("Words from the first tab");

    // The first tab is behind now: its next edit is the one refused.
    await retitle(first, "The first tab again");
    await inConflict(first);
    expect(await headingText(request, id)).toBe("Words from the second tab");
    await banner(first).getByRole("button", { name: "Reload" }).click();
    await expect(words(first)).toHaveText("Words from the second tab");
    expect(other.errors).toEqual([]);
  } finally {
    await other.context.close();
  }
});

test("a save the network drops in one tab while the other saves: the toast, closing asks first, and the same save sent again meets the conflict", { tag: "@a11y" }, async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Two tabs, lost save", fixture());
  const other = await secondTab(browser, baseURL!);
  const second = other.page;
  try {
    await open(first, id);
    await open(second, id);
    const saveIds: string[] = [];
    let down = true;
    await second.route(DRAFT, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      saveIds.push((JSON.parse(route.request().postData() ?? "{}") as { saveId: string }).saveId);
      if (down) return route.abort("internetdisconnected");
      return route.fallback();
    });

    await retitle(second, "Kept in the second tab");
    await expect(saveState(second)).toHaveText(/^Not saved, retrying in \d+ s$/);
    const toast = second.getByRole("group", { name: "Not saved" });
    await expect(toast.locator("p")).toHaveText("Connection lost. Your change is kept in this tab and saved when the connection is back.");
    await expect(publishButton(second)).toHaveAttribute("aria-disabled", "true");

    // Closing the tab asks first: the browser's own question, answered
    // "stay".
    const asked = second.waitForEvent("dialog");
    void second.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    expect(second.isClosed()).toBe(false);

    // Meanwhile the first tab saves.
    await retitle(first, "Saved by the first tab");
    await saved(first);

    // The connection is back: the very same save goes again, and the CMS,
    // which never had it, answers with the conflict.
    down = false;
    const tries = saveIds.length;
    await toast.getByRole("button", { name: "Retry now" }).click();
    await inConflict(second);
    await expect(toast).toHaveCount(0);
    expect(saveIds.length).toBeGreaterThan(tries);
    expect(new Set(saveIds).size).toBe(1);
    expect(await headingText(request, id)).toBe("Saved by the first tab");
    expect(await asksBeforeClosing(second)).toBe(true);

    await banner(second).getByRole("button", { name: "Keep mine" }).click();
    await saved(second);
    expect(await headingText(request, id)).toBe("Kept in the second tab");
    expect(await asksBeforeClosing(second)).toBe(false);
    expect(other.errors).toEqual([]);
  } finally {
    await other.context.close();
  }
});

test("a version restored in one tab is a change the other tab is told about, and Reload shows the restored page", async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Two tabs, restore", fixture());
  const other = await secondTab(browser, baseURL!);
  const second = other.page;
  try {
    await open(first, id);
    await open(second, id);
    await retitle(first, "Later words");
    await saved(first);
    // The page's first version: the save that made it, with its first words.
    await (await drawer(first, "History")).getByRole("button", { name: /^Restore: Autosaved, / }).click();
    await expect(words(first)).toHaveText("First words");
    expect(await headingText(request, id)).toBe("First words");

    // The second tab opened before the restore: its edit is refused.
    await retitle(second, "The second tab, unaware");
    await inConflict(second);
    await banner(second).getByRole("button", { name: "Reload" }).click();
    await expect(words(second)).toHaveText("First words");
    expect(other.errors).toEqual([]);
  } finally {
    await other.context.close();
  }
});

test("three tabs: A saves, B and C both meet the conflict; B's Keep mine and then C's each save over the page on the server, each kept once", async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Three tabs, keep mine", fixture());
  const b = await secondTab(browser, baseURL!);
  const c = await secondTab(browser, baseURL!);
  try {
    await open(first, id);
    await open(b.page, id);
    await open(c.page, id);
    await retitle(first, "From A");
    await saved(first);
    await retitle(b.page, "From B");
    await inConflict(b.page);
    await retitle(c.page, "From C");
    await inConflict(c.page);
    const sent: number[] = [];
    c.page.on("request", (r: Request) => {
      if (r.method() === "PUT" && r.url().endsWith("/draft")) sent.push((JSON.parse(r.postData() ?? "{}") as { revision: number }).revision);
    });

    await banner(b.page).getByRole("button", { name: "Keep mine" }).click();
    await saved(b.page);
    expect(await headingText(request, id)).toBe("From B");
    const afterB = (await draftOf(request, id)).revision;

    // C's conflict named A's revision; B has saved since. Keep mine reads
    // the page on the server first, keeps B's, and saves over it at once.
    await banner(c.page).getByRole("button", { name: "Keep mine" }).click();
    await expect(c.page.locator(".notice")).toHaveText("Kept this tab’s page: it is saved over the one on the server, which is kept in Versions as “Before Keep mine”.");
    await expect(banner(c.page)).toHaveCount(0);
    await saved(c.page);
    expect(sent).toEqual([afterB]);
    expect(await headingText(request, id)).toBe("From C");
    const versions = ((await (await request.get(`${cms()}/api/pages/${id}/versions`)).json()) as { versions: Array<{ number: number; name: string | null }> }).versions;
    const kept = versions.filter((v) => v.name === "Before Keep mine");
    const keptWords = await Promise.all(kept.map(async (v) => ((await (await request.get(`${cms()}/api/pages/${id}/versions/${v.number}`)).json()) as { document: { sections: Array<{ children: Array<{ children: Array<{ props: { text: string } }> }> }> } }).document.sections[0]!.children[0]!.children[0]!.props.text));
    expect(keptWords).toEqual(["From B", "From A"]);
    expect(b.errors).toEqual([]);
    expect(c.errors).toEqual([]);
  } finally {
    await b.context.close();
    await c.context.close();
  }
});

test("an image uploaded and placed in one tab is drawn in the other once it reloads the page", async ({ page: first, browser, baseURL, request }) => {
  const { id } = await makePage(request, "Two tabs, an image", fixture());
  const other = await secondTab(browser, baseURL!);
  const second = other.page;
  try {
    await open(first, id);
    await open(second, id);
    // The first tab places an image it uploads.
    await block(first, "h").click();
    await drawer(first, "Insert");
    await first.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }).click();
    const library = first.getByRole("dialog", { name: "Media library" });
    const name = `${unique("across")}.png`;
    await library.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(400, 300, () => [230, 140, 40]) });
    await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await library.getByRole("textbox", { name: /^Alt text/ }).fill("An orange block");
    await library.getByRole("button", { name: "Add image" }).click();
    await saved(first);

    // The second tab, which read the library before that image was in it.
    await retitle(second, "Words from the second tab");
    await inConflict(second);
    await banner(second).getByRole("button", { name: "Reload" }).click();
    const image = second.locator('.canvas [data-block-type="image"]');
    await expect(image.getByRole("img", { name: "An orange block" })).toBeVisible();
    await image.click();
    await expect(second.locator(".sidebar img.thumb-wide")).toBeVisible();
    await expect(second.getByText("The image is not in the media library any more.")).toHaveCount(0);
    expect(other.errors).toEqual([]);
  } finally {
    await other.context.close();
  }
});
