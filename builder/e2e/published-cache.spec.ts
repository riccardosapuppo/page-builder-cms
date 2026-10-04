// A published page in a visitor's Chromium, with its HTTP cache on: the
// visitor keeps the page, asks again at every visit with the ETag it
// holds (If-None-Match) and gets a 304 while nothing changed; once the
// editor publishes an edit, the very next visit gets the new page. The
// visitor's browser is helpers/visitor.ts: never routed, so its cache
// works, and held to the quiet checks by listening.
import { retitle } from "./helpers/heading.ts";
import { cms, column, expect, heading, makePage, open, saved, section, test } from "./helpers/site.ts";
import { directives, visitor } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

test("a visitor keeps the published page, revalidates it with a 304, and sees the next publish at the next visit", async ({ page, request, browser }) => {
  const { id, slug } = await makePage(request, "Kept by the browser", [section("s", "Story", [column("c", [heading("h", "First words")])])]);
  const live = `${cms()}/${slug}`;
  await open(page, id);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");

  const reader = await visitor(browser);
  try {
    const first = await reader.visit(live);
    expect(first.status).toBe(200);
    expect(first.sent).toBeUndefined();
    expect(directives(first.cacheControl)).toEqual(["max-age=0", "must-revalidate", "public"]);
    expect(first.etag).toMatch(/^W\/"[0-9a-f]+"$/);
    await expect(reader.tab.getByRole("heading", { name: "First words" })).toBeVisible();

    // Nothing changed: the browser asks with its ETag and keeps its copy.
    const again = await reader.visit(live);
    expect(again.sent).toBe(first.etag);
    expect(again.status).toBe(304);
    await expect(reader.tab.getByRole("heading", { name: "First words" })).toBeVisible();

    // The editor publishes an edit; the visitor's next visit, still
    // sending the ETag of the old page, gets the new one.
    await retitle(page, "Second words");
    await saved(page);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.locator(".topbar .tb-status")).toHaveText("Published");

    const after = await reader.visit(live);
    expect(after.sent).toBe(first.etag);
    expect(after.status).toBe(200);
    expect(after.etag).not.toBe(first.etag);
    await expect(reader.tab.getByRole("heading", { name: "Second words" })).toBeVisible();
    await expect(reader.tab.getByRole("heading", { name: "First words" })).toHaveCount(0);

    const kept = await reader.visit(live);
    expect([kept.sent, kept.status]).toEqual([after.etag, 304]);
    await expect(reader.tab.getByRole("heading", { name: "Second words" })).toBeVisible();
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
});
