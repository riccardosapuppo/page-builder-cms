// What the editor's browser tests share: a test that ends with no error on
// the page, none in its console and no request outside the run's two
// servers; pages made through the CMS's API as the editor would make
// them, each under an address of its own (the tests of a run share one
// CMS); and the CMS's draft read back.
import { test as base, expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// A picture for the images these pages take "from another site": answered
// inside the browser, so nothing leaves the machine (a 1 by 1 PNG).
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const ELSEWHERE = "https://images.example.org/";

export const cms = (): string => {
  const url = process.env.E2E_CMS_URL;
  if (!url) throw new Error("E2E_CMS_URL is not set: the run's global setup starts the CMS");
  return url;
};

// Every test ends with no error on the page, none in its console (but the
// browser's own line for a request the CMS answered 422, which some tests
// ask for, and the lines a test names in allowConsole: the failures it
// makes the network have) and no request that went anywhere but the run's
// two servers.
export const test = base.extend<{ quiet: void; allowConsole: RegExp | null }>({
  allowConsole: [null, { option: true }],
  quiet: [async ({ page, baseURL, allowConsole }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && !/status of 422/.test(text) && !allowConsole?.test(text)) errors.push(text);
    });
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith(ELSEWHERE)) return route.fulfill({ body: PIXEL, contentType: "image/png" });
      if (url.startsWith(baseURL ?? "") || url.startsWith(cms())) return route.fallback();
      errors.push(`request outside the run's servers: ${url}`);
      return route.abort();
    });
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

// A page with this document as its draft, made as the editor would: the
// page, then a save at the draft's revision.
export async function makePage(request: APIRequestContext, title: string, sections: unknown[]): Promise<{ id: number; slug: string }> {
  const slug = unique(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const created = await request.post(`${cms()}/api/pages`, { data: { title, slug } });
  expect(created.status(), await created.text()).toBe(201);
  const { page } = (await created.json()) as { page: { id: number } };
  const draft = (await (await request.get(`${cms()}/api/pages/${page.id}/draft`)).json()) as { revision: number };
  const saved = await request.put(`${cms()}/api/pages/${page.id}/draft`, { data: { revision: draft.revision, saveId: `setup-${slug}`, document: { schemaVersion: 1, title, sections } } });
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

export async function open(page: Page, id: number): Promise<void> {
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();
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

// The device, from the bottom line.
export function device(page: Page, name: "Desktop" | "Tablet" | "Phone"): Locator {
  return page.getByRole("radiogroup", { name: "Look at the page on" }).getByRole("radio", { name: new RegExp(`^${name}`) });
}

export const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
