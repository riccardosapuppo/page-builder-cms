// What the tests of the editor on the browser's storage share: every page
// held to no error on it or in its console (but the lines a test names)
// and to no request off the editor's own server, since on this storage the
// editor asks no server anything; and a page put in the browser's storage
// the way the editor would make it, before the editor opens on it.
import { test as base, expect, type Page } from "@playwright/test";
import type { Capabilities } from "../../src/storage/adapter.ts";
import { remoteAdapter, storagePage } from "./remote.ts";

export async function watchQuietly(page: Page, editor: string, allow: RegExp | null = null): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !allow?.test(message.text())) errors.push(message.text());
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(editor)) return route.fallback();
    errors.push(`request off the editor's server: ${url}`);
    return route.abort();
  });
  return errors;
}

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
export const unique = (stem: string): string => `${stem}-${Date.now().toString(36)}-${++made}`;

// A page with this document as its draft, made through the browser's
// storage on the editor's own origin (so in the same database the editor
// then opens): the page, then a save at its revision. Leaves `page` on the
// storage's test page.
export async function seedPage(page: Page, title: string, sections: unknown[]): Promise<number> {
  await storagePage(page);
  const capabilities: Capabilities = await page.evaluate(() => window.storagePage!.open("seed"));
  const storage = remoteAdapter(page, capabilities);
  const created = await storage.createPage({ title, slug: unique("seeded") });
  if (!created.ok) throw new Error(JSON.stringify(created.problem));
  const saved = await storage.saveDraft(created.value.page.id, { revision: created.value.draft.revision, saveId: `seed-${made}`, document: { schemaVersion: 1, title, sections } as never });
  if (!saved.ok) throw new Error(JSON.stringify(saved.problem));
  return created.value.page.id;
}
