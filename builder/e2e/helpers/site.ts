// What the editor's browser tests share: a test that ends with no error on
// the page, none in its console and no request outside the run's two
// servers; pages made through the CMS's API as the editor would make
// them, each under an address of its own (the tests of a run share one
// CMS); and the CMS's draft read back.
import { test as base, expect, type APIRequestContext, type Locator, type Page, type Request } from "@playwright/test";

// A picture for the images these pages take "from another site": answered
// inside the browser, so nothing leaves the machine (a 1 by 1 PNG).
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const ELSEWHERE = "https://images.example.org/";

export const cms = (): string => {
  const url = process.env.E2E_CMS_URL;
  if (!url) throw new Error("E2E_CMS_URL is not set: the run's global setup starts the CMS");
  return url;
};

// What every page a test drives is held to: no error on the page, none in
// its console (but the browser's own line for a request the CMS answered
// 422, which some tests ask for, and the lines `allow` names: the failures
// a test makes the network have), and no request anywhere but the run's
// two servers, which is refused and noted; the pictures "from another
// site" are answered inside the browser. What went wrong, as it comes:
// the test checks the list is empty at its end. The fixture below holds
// each test's own page to it; a page of a context or a browser a test
// opens for itself (a second tab, a browser that draws its scrollbars) is
// not that page, and is held to it by the test with this same function.
export async function watchQuietly(page: Page, editor: string, allow: RegExp | null = null): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !/status of 422/.test(text) && !allow?.test(text)) errors.push(text);
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(ELSEWHERE)) return route.fulfill({ body: PIXEL, contentType: "image/png" });
    if ((editor !== "" && url.startsWith(editor)) || url.startsWith(cms())) return route.fallback();
    errors.push(`request outside the run's servers: ${url}`);
    return route.abort();
  });
  return errors;
}

// Every test ends with its page held to the above, allowConsole naming the
// console lines it lets through.
export const test = base.extend<{ quiet: void; allowConsole: RegExp | null }>({
  allowConsole: [null, { option: true }],
  quiet: [async ({ page, baseURL, allowConsole }, use) => {
    const errors = await watchQuietly(page, baseURL ?? "", allowConsole);
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }],
});

export { expect };

let made = 0;
export const unique = (stem: string): string => `${stem}-${process.pid}-${Date.now().toString(36)}-${++made}`;

export const widget = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, children: [], style: { base: {} } });
export const column = (id: string, children: unknown[]) => ({ id, type: "column", props: {}, children, style: { base: {} } });
export const section = (id: string, label: string, children: unknown[]) => ({ id, type: "section", props: { label }, children, style: { base: {} } });
export const heading = (id: string, text: string) => widget(id, "heading", { level: 2, text });

// The start of a page's slug, from its title: cut so that the whole, with
// unique()'s end, fits the CMS's 64 characters, then rid of a hyphen at
// either end. The CMS takes a slug only as words joined by single hyphens
// (Slug::FORMAT), and a cut that ended on a gap between words, or a title
// that ended or began with a mark, left one there, which unique() doubled.
export const slugStem = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "") || "page";

// A page with this document as its draft, made as the editor would: the
// page, then a save at the draft's revision. The save's id keeps the
// slug's unique end, cut to the 64 characters the CMS takes: a long test
// name made a longer one, and the CMS refused the setup's save.
export async function makePage(request: APIRequestContext, title: string, sections: unknown[]): Promise<{ id: number; slug: string }> {
  const slug = unique(slugStem(title));
  const created = await request.post(`${cms()}/api/pages`, { data: { title, slug } });
  expect(created.status(), await created.text()).toBe(201);
  const { page } = (await created.json()) as { page: { id: number } };
  const draft = (await (await request.get(`${cms()}/api/pages/${page.id}/draft`)).json()) as { revision: number };
  const saveId = `setup-${slug.slice(-58)}`;
  const saved = await request.put(`${cms()}/api/pages/${page.id}/draft`, { data: { revision: draft.revision, saveId, document: { schemaVersion: 1, title, sections } } });
  expect(saved.status(), await saved.text()).toBe(200);
  return { id: page.id, slug };
}

export interface DraftBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: DraftBlock[];
}

export async function draftOf(request: APIRequestContext, id: number): Promise<{ revision: number; document: { sections: DraftBlock[] } }> {
  return (await (await request.get(`${cms()}/api/pages/${id}/draft`)).json()) as never;
}

// The page's structure as ids, section by section and column by column:
// [["s", [["c", ["h", "q"]]]]].
export function shape(sections: readonly DraftBlock[]): unknown {
  return sections.map((s) => [s.id, s.children.map((c) => [c.id, c.children.map((w) => w.id)])]);
}

// The editor on a page, once its top bar names it. Loaded, the editor takes
// well under a second to name it (under 0.7 s with every CPU of the test
// machine busy); when it has not within the wait, the run's log says what
// the page showed, which of its requests had no answer yet, and since
// when, which failed and in what words of the browser's, and whether the
// browser took itself to be online: the run's own error context does not
// outlast the next run, and a file may let a failed request's console
// line through (two-tabs.spec.ts lets ERR_INTERNET_DISCONNECTED through).
export async function open(page: Page, id: number): Promise<void> {
  const unanswered = new Map<Request, number>();
  const failed: string[] = [];
  const started = Date.now();
  const asked = (request: Request) => unanswered.set(request, Date.now());
  const answered = (request: Request) => unanswered.delete(request);
  const lost = (request: Request) => {
    unanswered.delete(request);
    failed.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "no reason given"}, ${Date.now() - started} ms after the start`);
  };
  page.on("request", asked);
  page.on("requestfinished", answered);
  page.on("requestfailed", lost);
  try {
    await page.goto(`/?page=${id}`);
    const loaded = Date.now();
    try {
      await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();
    } catch (error) {
      const shown = await page.locator("main").first().innerText({ timeout: 1_000 }).catch((why: unknown) => `(not read: ${String(why)})`);
      const online = await Promise.race([
        page.evaluate(() => String(navigator.onLine)),
        new Promise<string>((done) => setTimeout(() => done("not read within 1 s"), 1_000)),
      ]).catch((why: unknown) => `not read: ${String(why)}`);
      const now = Date.now();
      const waiting = [...unanswered].map(([request, since]) => `${request.method()} ${request.url()} for ${now - since} ms`);
      console.log(`open(${id}): the editor did not name the page within ${now - loaded} ms of the load. The page showed: ${JSON.stringify(shown.slice(0, 400))}. Requests with no answer yet: ${waiting.join("; ") || "none"}. Requests that failed: ${failed.join("; ") || "none"}. navigator.onLine: ${online}.`);
      throw error;
    }
  } finally {
    page.off("request", asked);
    page.off("requestfinished", answered);
    page.off("requestfailed", lost);
  }
  await expect(page.locator(".canvas .frame")).toBeVisible();
}

// One of the top bar's drawers, opened from its key if it is not open yet.
export async function drawer(page: Page, name: "Insert" | "Outline" | "History"): Promise<Locator> {
  const box = page.getByRole("complementary", { name, exact: true });
  if (!(await box.isVisible())) await page.locator(".topbar").getByRole("button", { name, exact: true }).click();
  await expect(box).toBeVisible();
  return box;
}

// A row of the Outline's tree, clicked where a person clicks it: on the row
// itself, not in the middle of the item, which holds the rows under it too.
export async function outlineRow(page: Page, name: string): Promise<Locator> {
  await drawer(page, "Outline");
  return page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");
}

// The site style, from the sidebar's Page tab, a level below it.
export async function openSiteStyle(page: Page): Promise<Locator> {
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Page" }).click();
  await sidebar.getByRole("button", { name: "Site style", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Site style" });
  await expect(panel).toBeVisible();
  return panel;
}

// A group of the sidebar, opened by a click on its head if it is closed;
// its head, which the group's name alone names.
export async function openGroup(page: Page, name: string): Promise<Locator> {
  const head = page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name, exact: true });
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  return head;
}

// The device, from the bottom line.
export function device(page: Page, name: "Desktop" | "Tablet" | "Phone"): Locator {
  return page.getByRole("radiogroup", { name: "Look at the page on" }).getByRole("radio", { name: new RegExp(`^${name}`) });
}

export const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
