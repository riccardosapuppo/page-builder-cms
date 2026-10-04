// A published page in a visitor's Chromium, with its HTTP cache on: the
// visitor keeps the page, asks again at every visit with the ETag it
// holds (If-None-Match) and gets a 304 while nothing changed; once the
// editor publishes an edit, the very next visit gets the new page.
//
// The visitor has a browser context of its own, never routed: Playwright
// turns Chromium's HTTP cache off on any page or context that routes
// requests, as the shared quiet fixture does. Its page is held to the same
// rules by listening instead: no page error, no console error, no request
// anywhere but the CMS (the published page names nothing else).
import type { Browser, Page } from "@playwright/test";
import { retitle } from "./helpers/heading.ts";
import { cms, column, expect, heading, makePage, open, saved, section, test } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface Visit {
  // The status the CMS sent over the wire. Playwright's response is the
  // one the page got, which after a 304 is the browser's kept 200.
  status: number;
  sent: string | undefined;
  etag: string | undefined;
  cacheControl: string | undefined;
}

async function visitor(browser: Browser): Promise<{ tab: Page; visit: (url: string) => Promise<Visit>; problems: string[]; close: () => Promise<void> }> {
  const context = await browser.newContext({ locale: "en-US", timezoneId: "UTC" });
  const tab = await context.newPage();
  const problems: string[] = [];
  tab.on("pageerror", (error) => problems.push(error.message));
  tab.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  tab.on("request", (request) => {
    if (!request.url().startsWith(cms())) problems.push(`request outside the CMS: ${request.url()}`);
  });
  // What crossed the network for each request, from Chromium's own
  // protocol: the status line the server answered with.
  const cdp = await context.newCDPSession(tab);
  const urls = new Map<string, string>();
  const wire: { url: string; status: number }[] = [];
  cdp.on("Network.requestWillBeSent", (event) => urls.set(event.requestId, event.request.url));
  cdp.on("Network.responseReceivedExtraInfo", (event) => wire.push({ url: urls.get(event.requestId) ?? "", status: event.statusCode }));
  await cdp.send("Network.enable");

  const visit = async (url: string): Promise<Visit> => {
    const before = wire.filter((w) => w.url === url).length;
    const response = await tab.goto(url);
    if (!response) throw new Error(`no response for ${url}`);
    await expect.poll(() => wire.filter((w) => w.url === url).length).toBe(before + 1);
    const headers = await response.allHeaders();
    return {
      status: wire.filter((w) => w.url === url).at(-1)!.status,
      sent: (await response.request().headerValue("if-none-match")) ?? undefined,
      etag: headers.etag,
      cacheControl: headers["cache-control"],
    };
  };
  return { tab, visit, problems, close: () => context.close() };
}

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
    expect(first.cacheControl?.split(",").map((d) => d.trim()).sort()).toEqual(["max-age=0", "must-revalidate", "public"]);
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
