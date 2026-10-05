// A visitor of the published pages, in a browser context of its own with
// Chromium's HTTP cache on: it keeps a page, asks again at every visit
// with the ETag it holds (If-None-Match), and keeps its copy on a 304.
//
// The context is never routed: Playwright turns Chromium's HTTP cache off
// on any page or context that routes requests, as the shared quiet
// fixture (watchQuietly) does. Its page is held to the same rules by
// listening instead: no page error, no console error, no request anywhere
// but the CMS (a published page names nothing else). The test checks
// `problems` is empty at its end.
import { expect, type Browser, type Page } from "@playwright/test";
import { cms } from "./site.ts";

export interface Visit {
  // The status the CMS sent over the wire. Playwright's response is the
  // one the page got, which after a 304 is the browser's kept 200.
  status: number;
  // The ETag the browser sent back, if it sent one.
  sent: string | undefined;
  etag: string | undefined;
  cacheControl: string | undefined;
}

export interface Visitor {
  tab: Page;
  visit(url: string): Promise<Visit>;
  problems: string[];
  close(): Promise<void>;
}

// "max-age=0, public, must-revalidate" in any order, as a sorted list.
export const directives = (header: string | undefined): string[] => (header ?? "").split(",").map((d) => d.trim()).filter(Boolean).sort();

// from: the address the CMS should take this visitor's requests as coming
// from. The CMS counts the forms each address sends (its rate limit), and
// every test reaches it from 127.0.0.1, which it trusts as a proxy, so an
// X-Forwarded-For on every request gives a visitor a count of its own.
export async function visitor(browser: Browser, options: { from?: string } = {}): Promise<Visitor> {
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "UTC",
    ...(options.from ? { extraHTTPHeaders: { "X-Forwarded-For": options.from } } : {}),
  });
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
