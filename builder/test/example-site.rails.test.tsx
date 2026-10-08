// @vitest-environment jsdom
//
// The example site's pages (example-site/ at the repository's root, the one
// copy the CMS's seed and the browser demo read) in the render contract's
// agreement: each is saved through the CMS's real API as a page's draft,
// and the page the CMS serves is compared with React's render of the same
// document, under the normalization of html-compare.ts and nothing else:
// the draft preview, then the page published. What React draws passes the
// safety check too (agreement-harness.ts).
//
// The images are the harness's two library images: the pages' image ids
// are put in turn onto those, as the seed puts them onto its own uploads.
// The picture behind an id changes nothing in how either renderer draws it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, inject, test } from "vitest";
import { repoRoot } from "../build/paths.ts";
import { startAgreement, type Agreement } from "./agreement-harness.ts";
import { checked } from "./render-arbitraries.ts";

interface Site {
  images: Array<{ id: string }>;
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

const folder = join(repoRoot, "example-site");
const site = JSON.parse(readFileSync(join(folder, "site.json"), "utf8")) as Site;

// The document with each image id of site.json replaced as ids says; an id
// it does not list fails the test, as it fails the seed.
function withLibraryIds(node: unknown, ids: ReadonlyMap<string, string>, file: string): unknown {
  if (Array.isArray(node)) return node.map((value) => withLibraryIds(value, ids, file));
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (key !== "mediaId") return [key, withLibraryIds(value, ids, file)];
    const id = ids.get(value as string);
    if (id === undefined) throw new Error(`example-site/${file} names the image ${JSON.stringify(value)}, which site.json does not list`);
    return [key, id];
  }));
}

const cms = inject("cmsUrl");
let cmsPage: Agreement;

beforeAll(async () => {
  cmsPage = await startAgreement(cms, "example-site");
}, 120_000);

test.each(site.pages)("the example site's $file draws on the CMS as in React, in the preview and published", async ({ file }) => {
  const ids = new Map(site.images.map((image, index) => [image.id, cmsPage.library[index % cmsPage.library.length]!.id]));
  const document = checked(withLibraryIds(JSON.parse(readFileSync(join(folder, file), "utf8")), ids, file) as Record<string, unknown>);

  await cmsPage.save(document);
  const { nodes } = await cmsPage.agree(document);
  const live = await cmsPage.publish();
  await cmsPage.agree(document, live, "published");

  // A page of the site, not an empty one that agrees trivially.
  expect(nodes).toBeGreaterThan(100);
});

test("the example site lists its three pages, one of them home", () => {
  expect(site.pages.map((page) => [page.slug, page.home])).toEqual([["home", true], ["winter-series", false], ["notices", false]]);
});
