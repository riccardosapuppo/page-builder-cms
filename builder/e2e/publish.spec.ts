// Preview and Publish in Chromium, against the run's CMS: the preview is
// the draft as the CMS serves it, on the CMS's own origin, never indexed;
// Publish puts it live and the Publish menu's link opens the page the CMS
// serves, which holds the published words and no script; an edit after
// that is saved but not live, and the chip counts it, until the next
// publish.
import type { Page } from "@playwright/test";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, expect, heading, makePage, open, saved, section, test } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [section("s", "Story", [column("c", [heading("h", "First words")])])];

async function retitle(page: Page, words: string) {
  await block(page, "h").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill(words);
  await text.blur();
}

// A tab the editor opens, once it has reached the address it is sent to.
async function tabOpenedBy(page: Page, action: () => Promise<void>, url: string) {
  const opening = page.context().waitForEvent("page");
  await action();
  const tab = await opening;
  await tab.waitForURL(url);
  await tab.waitForLoadState("load");
  return tab;
}

test("the preview shows the draft on the CMS; Publish puts it live; the live page is the published version, not the draft", { tag: "@a11y" }, async ({ page, request }) => {
  const { id, slug } = await makePage(request, "Going live", fixture());
  const live = `${cms()}/${slug}`;
  await open(page, id);
  await expect(page.locator(".topbar .chip")).toHaveText("Not published yet");
  expect((await request.get(live)).status()).toBe(404);

  // The edit is still waiting when Preview is pressed: it is sent first.
  await retitle(page, "Draft words");
  const preview = await tabOpenedBy(page, () => page.getByRole("link", { name: "Preview" }).click(), `${cms()}/preview/${id}`);
  await expect(preview.getByRole("heading", { name: "Draft words" })).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await preview.close();

  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await publish.click();
  await expect(page.locator(".topbar .chip")).toHaveText("Published");
  await expect(page.locator(".notice")).toContainText(`Published: visitors see this page at ${new URL(cms()).host}/${slug}.`);

  await page.getByRole("button", { name: "More publish options" }).click();
  const menu = page.getByRole("menu", { name: "Publish options" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Publish now/, /^View live page/]);
  const view = menu.getByRole("menuitem", { name: /View live page/ });
  await expect(view).toHaveAttribute("href", live);
  const served = await tabOpenedBy(page, () => view.click(), live);
  await expect(served.getByRole("heading", { name: "Draft words" })).toBeVisible();
  expect(await served.locator("script").count()).toBe(0);
  await served.close();

  // Saved but not live: the chip counts it, the live page keeps its words.
  await retitle(page, "Newer words");
  await saved(page);
  await expect(page.locator(".topbar .chip")).toHaveText("Published, 1 change not live");
  expect(await (await request.get(live)).text()).toContain("Draft words");

  await page.getByRole("button", { name: "More publish options" }).click();
  await expect(menu.getByRole("menuitem", { name: /Publish now/ })).toContainText("Visitors see your 1 change right away.");
  await menu.getByRole("menuitem", { name: /Publish now/ }).click();
  await expect(page.locator(".topbar .chip")).toHaveText("Published");
  const after = await (await request.get(live)).text();
  expect(after).toContain("Newer words");
  expect(after).not.toContain("Draft words");
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.props.text).toBe("Newer words");
});

test("an empty page cannot be published, and says why", async ({ page, request }) => {
  const { id } = await makePage(request, "Nothing yet", []);
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  await expect(publish).toHaveAccessibleDescription("Add a section first. An empty page has nothing to publish.");
  await expect(page.getByText("Publish turns on once the page has a section.")).toBeVisible();
  await publish.click({ force: true });
  await expect(page.locator(".topbar .chip")).toHaveText("Not published yet");
});
