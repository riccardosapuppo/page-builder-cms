// The example site as a visitor gets it, once `ruby bin/rails db:seed` has
// put it into the run's CMS (example-site/, read by cms/db/seeds.rb): each
// of its four pages and the page of one of News's entries, in Chromium,
// with its heading, no serious or critical axe finding on a desktop's
// width and a phone's, and no sideways scroll down to 320 wide, the
// notices page's word longer than any line included.
//
// The tests of a run share one CMS and make pages and collections of their
// own beside these; the seed leaves an address or a prefix that is taken
// as it is, so this file can run again on the same CMS.
import type { Page } from "@playwright/test";
import { seedCms } from "./harness/servers.ts";
import { axe } from "./helpers/axe.ts";
import { cms, expect, test } from "./helpers/site.ts";

const PAGES = [
  { path: "/", heading: "Swim at slack water" },
  { path: "/winter-series", heading: "Winter series" },
  { path: "/news", heading: "News" },
  { path: "/news/winter-series-starts", heading: "The winter series starts on 1 November" },
  { path: "/notices", heading: "Notices" },
];

test.beforeAll(() => {
  const folder = process.env.E2E_CMS_FOLDER;
  if (!folder) throw new Error("E2E_CMS_FOLDER is not set: the run's CMS was not started by the harness");
  expect(seedCms({ folder })).toContain("Seeding the example site, Slack Water:");
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
