// A collection's template, reached from the page switch, in Chromium
// against the run's CMS, on the example site its seed puts there (as
// example-site.spec.ts has it: the seed leaves what is there as it is, so
// this file can run again on the same CMS). From the home page, the page's
// title opens the site's pages, then the header and the footer, then the
// templates of its collections, each named by its collection; News's opens
// on the canvas as Edit the template opens it, its Field blocks drawn with
// the newest entry; and the same list, drawn the same, on a phone, with a
// finger.
import type { APIRequestContext, Page } from "@playwright/test";
import { seedCms } from "./harness/servers.ts";
import { block } from "./helpers/canvas.ts";
import { cms, expect, open, test } from "./helpers/site.ts";

test.beforeAll(() => {
  const folder = process.env.E2E_CMS_FOLDER;
  if (!folder) throw new Error("E2E_CMS_FOLDER is not set: the run's CMS was not started by the harness");
  expect(seedCms({ folder })).toContain("Seeding the example site, Slack Water:");
});

// The home page, and News's template, as the CMS lists them.
async function site(request: APIRequestContext): Promise<{ home: number; template: number }> {
  const { pages } = (await (await request.get(`${cms()}/api/pages`)).json()) as { pages: Array<{ id: number; title: string; home: boolean }> };
  const home = pages.find((one) => one.home);
  expect(home?.title, "the seed's home page").toBe("Slack Water");
  const { collections } = (await (await request.get(`${cms()}/api/collections`)).json()) as { collections: Array<{ name: string; prefix: string; template: { id: number } }> };
  const news = collections.find((one) => one.prefix === "news");
  expect(news?.name, "the seed's News at /news").toBe("News");
  return { home: home!.id, template: news!.template.id };
}

// News's template on the canvas: its title, its day and its summary are
// Field blocks, drawn with the newest entry.
async function drawnWithTheNewest(page: Page, template: number): Promise<void> {
  await expect(page.getByRole("button", { name: "Switch page. Open: News" })).toBeVisible();
  await expect(page.locator(".tb-page-where")).toHaveText("every entry");
  expect(new URL(page.url()).searchParams.get("page")).toBe(String(template));
  await expect(block(page, "entry-title").getByRole("heading", { level: 1 })).toHaveText("The winter series starts on 1 November");
  await expect(block(page, "entry-date").locator("time")).toHaveText("14 October 2026");
  await expect(block(page, "entry-summary")).toHaveText("Short, cold swims every Sunday from 1 November to the end of March, and very hot tea after every one.");
}

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("from the home page, the page switch lists the templates after the header and the footer, and News's opens with its Field blocks drawn with the newest entry", async ({ page, request }) => {
    const { home, template } = await site(request);
    await open(page, home);
    await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
    const pages = page.getByRole("dialog", { name: "Pages" });
    await expect(pages.getByRole("heading")).toHaveText(["On every page", "Templates"]);
    const templates = pages.getByRole("list", { name: "Templates" });
    const news = templates.getByRole("button", { name: /^News/ });
    await expect(news.locator(".page-row-name")).toHaveText("NewsEvery entry");
    await expect(news.locator(".pr-state")).toHaveText("Published");
    await news.click();
    await expect(pages).toHaveCount(0);
    await drawnWithTheNewest(page, template);
    // Its Page tab says whose it is, and leads back to the home page.
    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await sidebar.getByRole("tab", { name: "Page" }).click();
    await expect(sidebar.locator(".ed-title")).toContainText("Template of News");
    await sidebar.getByRole("button", { name: "Back to Slack Water" }).click();
    await expect(page.getByRole("button", { name: "Switch page. Open: Slack Water" })).toBeVisible();
  });
});

test.describe("on a phone, with a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the page switch draws the templates the same, the window's width, and News's opens from it", async ({ page, request }) => {
    const { home, template } = await site(request);
    await open(page, home);
    await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).tap();
    const pages = page.getByRole("dialog", { name: "Pages" });
    const box = (await pages.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(390 - 16 - 1);
    const templates = pages.getByRole("list", { name: "Templates" });
    const news = templates.getByRole("button", { name: /^News/ });
    await news.scrollIntoViewIfNeeded();
    await expect(news.locator(".page-row-name")).toHaveText("NewsEvery entry");
    await news.tap();
    await expect(pages).toHaveCount(0);
    await drawnWithTheNewest(page, template);
  });
});
