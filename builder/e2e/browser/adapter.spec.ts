// What the battery cannot see of the browser's storage, since it looks
// through the interface alone: an image's bytes go with its item and its
// address is let go; two tabs saving from one revision at the same moment;
// a refusal that undoes what its transaction had written; and a stored
// document no upgrade can bring to the current schemaVersion, refused in
// the words of the editor's twin of the CMS's upgrades.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Capabilities, StorageAdapter } from "../../src/storage/adapter.ts";
import { PNG_BYTES } from "../../src/storage/contract.ts";
import { remoteAdapter, storagePage } from "./remote.ts";

let context: BrowserContext;
let first: Page;
let second: Page;
let capabilities: Capabilities;
let names = 0;
const run = Date.now().toString(36);
const unique = (prefix: string) => `${prefix}-${run}-${++names}`;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  first = await storagePage(await context.newPage());
  second = await storagePage(await context.newPage());
  capabilities = await first.evaluate(() => window.storagePage!.open("capabilities"));
});

test.afterAll(async () => {
  await context.close();
});

const png = (name: string) => new File([PNG_BYTES], name, { type: "image/png" });
const fetches = (page: Page, url: string) => page.evaluate((address) => window.storagePage!.bytes(address).then(() => true, () => false), url);

async function page(adapter: StorageAdapter): Promise<{ id: number; revision: number }> {
  const made = await adapter.createPage({ title: "A page", slug: unique("page") });
  if (!made.ok) throw new Error(JSON.stringify(made.problem));
  return { id: made.value.page.id, revision: made.value.draft.revision };
}

test("a deleted image's bytes leave the database with it, and its address stops giving them", async () => {
  const tab = remoteAdapter(first, capabilities);
  const item = await tab.uploadMedia({ file: png(`${unique("gone")}.png`), width: 3, height: 2 });
  if (!item.ok) throw new Error(JSON.stringify(item.problem));
  expect(await first.evaluate(() => window.storagePage!.keys("blobs"))).toContain(item.value.id);
  expect(await fetches(first, item.value.url)).toBe(true);

  expect(await tab.deleteMedia(item.value.id)).toEqual({ ok: true, value: null });
  expect(await first.evaluate(() => window.storagePage!.keys("blobs"))).not.toContain(item.value.id);
  expect(await fetches(first, item.value.url), "the object URL is revoked").toBe(false);
});

test("an image deleted in another tab lets go of its address here when the library is read again", async () => {
  const here = remoteAdapter(first, capabilities);
  const there = remoteAdapter(second, capabilities);
  const item = await here.uploadMedia({ file: png(`${unique("elsewhere")}.png`), width: 3, height: 2 });
  if (!item.ok) throw new Error(JSON.stringify(item.problem));
  expect((await there.deleteMedia(item.value.id)).ok).toBe(true);
  expect(await fetches(first, item.value.url), "until this tab reads the library").toBe(true);
  expect((await here.listMedia()).map((m) => m.id)).not.toContain(item.value.id);
  expect(await fetches(first, item.value.url)).toBe(false);
});

test("two tabs saving from one revision at the same moment: one is saved, the other gets the conflict naming it", async () => {
  const mine = remoteAdapter(first, capabilities);
  const theirs = remoteAdapter(second, capabilities);
  const made = await page(mine);
  const save = (title: string, saveId: string) => ({ revision: made.revision, document: { schemaVersion: 1 as const, title, sections: [] }, saveId });
  for (let round = 0; round < 5; round += 1) {
    const draft = await mine.getDraft(made.id);
    const [a, b] = await Promise.all([
      mine.saveDraft(made.id, { ...save(`Mine ${round}`, `mine-${round}`), revision: draft.revision }),
      theirs.saveDraft(made.id, { ...save(`Theirs ${round}`, `theirs-${round}`), revision: draft.revision }),
    ]);
    const outcomes = [a, b];
    const saved = outcomes.filter((o) => o.ok);
    const refused = outcomes.filter((o) => !o.ok);
    expect(saved, `round ${round}`).toHaveLength(1);
    const winner = saved[0]!.ok ? saved[0]!.value : null;
    expect(refused[0], `round ${round}`).toMatchObject({ ok: false, problem: { kind: "conflict", currentRevision: draft.revision + 1, lastSaveId: winner?.lastSaveId } });
    expect((await mine.getDraft(made.id)).revision).toBe(draft.revision + 1);
  }
});

test("a refusal undoes what its transaction wrote: a restore of a version no document check passes keeps no copy of the draft", async () => {
  const tab = remoteAdapter(first, capabilities);
  const made = await page(tab);
  const saved = await tab.saveDraft(made.id, { revision: made.revision, document: { schemaVersion: 1, title: "Kept as it is", sections: [] }, saveId: "kept-1" });
  if (!saved.ok) throw new Error(JSON.stringify(saved.problem));
  // A version as a broken build might have stored it: a title of no
  // visible character, which no check lets through.
  await first.evaluate((pageId) => window.storagePage!.put("versions", {
    pageId, number: 50, reason: "manual", name: null, restoredFrom: null, createdAt: "2026-10-08T09:00:00.000Z", document: { schemaVersion: 1, title: " ", sections: [] },
  }), made.id);
  const before = await tab.listVersions(made.id);
  const restored = await tab.restoreVersion(made.id, 50);
  expect(restored.ok).toBe(false);
  if (restored.ok) return;
  expect(restored.problem).toMatchObject({ kind: "invalid", code: "invalid_document" });
  expect(restored.problem.errors.map((e) => e.pointer)).toEqual(["/document/title"]);
  // The copy of the draft a restore keeps first was written, then undone.
  expect(await tab.listVersions(made.id)).toEqual(before);
  expect(await tab.getDraft(made.id)).toMatchObject({ revision: saved.value.revision, document: { title: "Kept as it is" } });
});

test("a stored document no upgrade brings to the current schemaVersion is refused in the upgrade's words: read, and restored", async () => {
  const tab = remoteAdapter(first, capabilities);
  const made = await page(tab);
  await first.evaluate((pageId) => window.storagePage!.put("versions", {
    pageId, number: 60, reason: "manual", name: null, restoredFrom: null, createdAt: "2026-10-08T09:00:00.000Z", document: { schemaVersion: 7, title: "From a later build", sections: [] },
  }), made.id);
  await expect(tab.getVersion(made.id, 60)).rejects.toMatchObject({ failure: { kind: "refused", code: "unsupported_document", message: "The document is of schemaVersion 7, newer than this server's 1." } });
  const restored = await tab.restoreVersion(made.id, 60);
  expect(restored).toMatchObject({ ok: false, problem: { kind: "invalid", errors: [{ pointer: "/document/schemaVersion", keyword: "upgrade" }] } });
});
