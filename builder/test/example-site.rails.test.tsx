// @vitest-environment jsdom
//
// The example site (example-site/ at the repository's root, the one copy
// the CMS's seed and the browser demo read) in the render contract's
// agreement: each page is saved through the CMS's real API as a page's
// draft, and the page the CMS serves is compared with React's render of
// the same document, under the normalization of html-compare.ts and
// nothing else: the draft preview, then the page published. What React
// draws passes the safety check too (agreement-harness.ts).
//
// Its collections are made first through the same API, as the seed makes
// them, each at a prefix of the run's own (the run's tests share one CMS):
// the entries written and published, the template saved and published.
// React is given the collections and entries the CMS keeps, read through
// the API as the editor reads them, so a page's Collection list draws the
// same cards on both; and each entry's page, its template drawn with what
// it published, is compared too.
//
// The images are the harness's two library images: the documents' image
// ids are put in turn onto those, as the seed puts them onto its own
// uploads. The picture behind an id changes nothing in how either
// renderer draws it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, inject, test } from "vitest";
import { repoRoot } from "../build/paths.ts";
import { collectionResolver, readSiteEntries, shownEntry, type SiteEntries } from "../src/editor/collections/content.ts";
import type { EntryContent } from "../src/shared/collection.ts";
import type { PageDocument } from "../src/shared/document.ts";
// The browser demo's seed swaps the ids the same way: an id site.json does
// not list fails the test, as it fails both seeds.
import { withCollectionIds, withLibraryIds, type ExampleCollectionFile } from "../src/storage/example-site.ts";
import { startAgreement, type Agreement } from "./agreement-harness.ts";
import { checked } from "./render-arbitraries.ts";

interface Site {
  images: Array<{ id: string }>;
  collections: Array<{ id: number; file: string }>;
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

const folder = join(repoRoot, "example-site");
const read = (file: string): unknown => JSON.parse(readFileSync(join(folder, file), "utf8"));
const site = read("site.json") as Site;

const cms = inject("cmsUrl");
let cmsPage: Agreement;
// The ids of site.json, a picture's and a collection's, to the CMS's.
let images: Map<string, string>;
const collections = new Map<number, number>();
// What the CMS keeps of them, read back as the editor reads it.
let kept: SiteEntries;

const value = <T,>(outcome: { ok: true; value: T } | { ok: false; problem: unknown }, what: string): T => {
  if (!outcome.ok) throw new Error(`${what} was refused: ${JSON.stringify(outcome.problem).slice(0, 500)}`);
  return outcome.value;
};

beforeAll(async () => {
  cmsPage = await startAgreement(cms, "example-site");
  const { adapter } = cmsPage;
  images = new Map(site.images.map((image, index) => [image.id, cmsPage.library[index % cmsPage.library.length]!.id]));
  const files = site.collections.map((listed) => ({ listed, held: read(listed.file) as ExampleCollectionFile }));
  for (const { listed, held } of files) {
    const made = value(await adapter.createCollection({ ...held.collection, prefix: `${held.collection.prefix}-${cmsPage.slug}` }), `the collection of ${listed.file}`);
    collections.set(listed.id, made.id);
    for (const entry of held.entries) {
      const written = value(await adapter.createEntry(made.id, withLibraryIds(entry, images, listed.file) as EntryContent), `the entry ${entry.slug}`);
      value(await adapter.publishEntry(made.id, written.id, { revision: written.revision }), `the publish of ${entry.slug}`);
    }
  }
  for (const { listed, held } of files) {
    const template = (await adapter.getCollection(collections.get(listed.id)!)).template;
    const document = checked(withCollectionIds(withLibraryIds(held.template, images, listed.file), collections, listed.file) as Record<string, unknown>) as unknown as PageDocument;
    const saved = value(await adapter.saveDraft(template.id, { revision: template.revision, saveId: `example-template-${template.id}`, document }), `the template of ${listed.file}`);
    value(await adapter.publish(template.id, { revision: saved.revision }), `the publish of the template of ${listed.file}`);
  }
  kept = await readSiteEntries(adapter);
}, 120_000);

test.each(site.pages)("the example site's $file draws on the CMS as in React, in the preview and published", async ({ file }) => {
  const document = checked(withCollectionIds(withLibraryIds(read(file), images, file), collections, file) as Record<string, unknown>);
  const content = { collections: collectionResolver(kept) };

  await cmsPage.save(document);
  const { nodes } = await cmsPage.agree(document, undefined, undefined, content);
  const live = await cmsPage.publish();
  await cmsPage.agree(document, live, "published", content);

  // A page of the site, not an empty one that agrees trivially; a list of
  // entries, with its cards.
  expect(nodes).toBeGreaterThan(90);
  const lists = JSON.stringify(document).match(/"type":"collectionList"/g)?.length ?? 0;
  if (lists > 0) expect(cards(await cmsPage.fetchText(live)), file).toBe(5);
});

// The cards of entries a page holds.
const cards = (html: string): number => html.match(/<li class="sw-entry">/g)?.length ?? 0;

test("each entry of the example site's collections draws on the CMS as in React: its template, published, with what it published, its list of the others", async () => {
  let compared = 0;
  for (const listed of site.collections) {
    const collection = kept.collections.find((one) => one.id === collections.get(listed.id))!;
    const template = (await cmsPage.adapter.getVersion(collection.template.id, collection.template.published!.versionNumber)).document;
    const entries = kept.entries.get(collection.id) ?? [];
    expect(entries.length, listed.file).toBeGreaterThan(2);
    for (const entry of entries) {
      const live = entry.published!;
      const path = `/${collection.prefix}/${live.slug}`;
      const { nodes } = await cmsPage.agree(template, path, `the entry ${live.slug}`, {
        collections: collectionResolver(kept),
        entry: shownEntry(collection, { ...live, id: entry.id }),
      });
      expect(nodes, live.slug).toBeGreaterThan(70);
      // Its list of the others: three of them, never itself.
      const html = await cmsPage.fetchText(path);
      expect(cards(html), live.slug).toBe(3);
      expect(html, live.slug).not.toContain(`href="${path}"`);
      compared += 1;
    }
  }
  expect(compared).toBe(5);
});

test("the example site lists its four pages, one of them home, the news at its collection's prefix", () => {
  expect(site.pages.map((page) => [page.slug, page.home])).toEqual([["home", true], ["winter-series", false], ["news", false], ["notices", false]]);
  expect(site.collections.map((listed) => (read(listed.file) as ExampleCollectionFile).collection.prefix)).toEqual(["news"]);
});
