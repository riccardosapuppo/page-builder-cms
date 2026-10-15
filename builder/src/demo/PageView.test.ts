// A demo page as its tab reads it: in a browser that has no pages yet, the
// example site goes in first, then the page is read, so the preview of one
// of its pages shows that page. The site's header and footer are drawn
// around it as the CMS draws them: their drafts in a preview; published,
// what each published, or its starter while it has published nothing. A
// part's own preview is the home page's. An entry published here is drawn
// with its collection's published template and what the entry published;
// a template's preview is its draft, with the entry its address names.
import { describe, expect, test } from "vitest";
import { SITE_THEME } from "virtual:site-theme";
import { newsCollection, newsEntry, templateOf } from "../../test/site-entries.ts";
import { SAMPLE_TITLE } from "../editor/collections/content.ts";
import type { PageSummary, StorageAdapter } from "../storage/adapter.ts";
import { withExampleSite } from "../storage/example-site.ts";
import { ENTRY_NOT_PUBLISHED_LINE, entryAt, entryLine, NO_ENTRY_LINE, NO_HOME_LINE, PREVIEW_LINE, readShown, templateNotPublished } from "./PageView.tsx";

const doc = (title: string) => ({ schemaVersion: 1, title, sections: [] });
const summary = (id: number, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, title: kind, slug: kind === "page" ? "home" : null, home: kind === "page", published: null, ...extra });

// A store that is empty until the seed puts its home page in, a tick
// later; its header has published version 2, its footer nothing.
function emptyUntilSeeded(options: { pages?: boolean } = {}) {
  let seeded = false;
  const parts = [summary(4, "header", { published: { versionNumber: 2 } }), summary(5, "footer")];
  const base = {
    name: "browser",
    capabilities: { collections: false },
    listPages: async () => (seeded && options.pages !== false ? [summary(1, "page", { title: "Home", published: { versionNumber: 3 } })] : []),
    listParts: async () => parts,
    getPage: async (id: number) => {
      if (id === 4 || id === 5) return { page: { id, kind: id === 4 ? "header" : "footer", title: "Part", slug: null, home: false }, draft: { document: doc("Part") }, published: null };
      if (!seeded || id !== 1) throw new Error("There is nothing at this address.");
      return { page: { id: 1, kind: "page", title: "Home", slug: "home", home: true }, draft: { document: doc("Home") }, published: { versionNumber: 3 } };
    },
    getDraft: async (id: number) => ({ document: doc(`Draft of ${id}`) }),
    getVersion: async (id: number, number: number) => ({ document: doc(`Version ${number} of ${id}`) }),
    getSiteStyle: async () => ({}),
    listMedia: async () => [],
  } as unknown as StorageAdapter;
  return withExampleSite(base, async () => {
    await new Promise((done) => setTimeout(done, 0));
    seeded = true;
  });
}

describe("a demo page read in a browser", () => {
  test("the preview of a page of the example site shows it once the seed is in, inside the parts' drafts", async () => {
    const shown = await readShown(emptyUntilSeeded(), { kind: "preview", pageId: 1 });
    expect(shown).toMatchObject({ kind: "ready", title: "Home", line: PREVIEW_LINE, parts: { header: doc("Draft of 4"), footer: doc("Draft of 5") } });
  });

  test("published, a page is drawn inside what each part published, or its starter while it has published nothing", async () => {
    const shown = await readShown(emptyUntilSeeded(), { kind: "published", pageId: 1 });
    expect(shown).toMatchObject({ kind: "ready", title: "Version 3 of 1", parts: { header: doc("Version 2 of 4"), footer: SITE_THEME.parts.footer } });
  });

  test("a part's own preview is the home page's, inside the parts' drafts; with no page, it says so", async () => {
    expect(await readShown(emptyUntilSeeded(), { kind: "preview", pageId: 4 })).toMatchObject({ kind: "ready", title: "Home", parts: { header: doc("Draft of 4") } });
    expect(await readShown(emptyUntilSeeded({ pages: false }), { kind: "preview", pageId: 5 })).toEqual({ kind: "failed", message: NO_HOME_LINE });
  });
});

// News, its template published as version 2 (or never), with Dawn swims
// published and redrafted since, and Winter series a draft only.
function withNews(options: { template?: "published" | "draft" } = {}) {
  const published = options.template === "draft" ? null : { versionNumber: 2 };
  const news = newsCollection({ template: { ...templateOf(90, "News"), published } as unknown as PageSummary });
  const dawn = { ...newsEntry(1, "Dawn swims", "2026-05-02"), title: "Dawn swims, redrafted" };
  const winter = newsEntry(2, "Winter series", "2026-11-01", { live: false });
  return {
    name: "browser",
    capabilities: { collections: true },
    listPages: async () => [summary(1, "page", { title: "Home" })],
    listParts: async () => [],
    getPage: async (id: number) => {
      if (id !== 90) throw new Error("There is nothing at this address.");
      return { page: { id, kind: "template", title: "News", slug: null, home: false }, draft: { document: doc("The template's draft") }, published };
    },
    getDraft: async (id: number) => ({ document: doc(`Draft of ${id}`) }),
    getVersion: async (id: number, number: number) => ({ document: doc(`Version ${number} of ${id}`) }),
    getSiteStyle: async () => ({}),
    listMedia: async () => [],
    listCollections: async () => [news],
    listEntries: async () => [dawn, winter],
  } as unknown as StorageAdapter;
}

describe("an entry, and a template's preview, read in a browser", () => {
  test("an entry published here is drawn with its collection's published template and what the entry published, the line naming its address in the full system", async () => {
    const shown = await readShown(withNews(), { kind: "entry", entryId: 1 });
    expect(shown).toMatchObject({ kind: "ready", document: doc("Version 2 of 90"), title: "Dawn swims", line: entryLine("news", "dawn-swims") });
    expect(shown.kind === "ready" && shown.entry).toMatchObject({ title: "Dawn swims", slug: "dawn-swims", values: { day: "2026-05-02" } });
  });

  test("an entry not published here, one this browser has not, and one whose template is not published say so", async () => {
    expect(await readShown(withNews(), { kind: "entry", entryId: 2 })).toEqual({ kind: "failed", message: ENTRY_NOT_PUBLISHED_LINE });
    expect(await readShown(withNews(), { kind: "entry", entryId: 9 })).toEqual({ kind: "failed", message: NO_ENTRY_LINE });
    expect(await readShown(withNews({ template: "draft" }), { kind: "entry", entryId: 1 })).toEqual({ kind: "failed", message: templateNotPublished("News") });
  });

  test("a template's preview is its draft with the entry its address names, else the first published one's draft, else made-up values", async () => {
    const titled = async (entry?: number | "sample") => {
      const shown = await readShown(withNews(), { kind: "preview", pageId: 90, ...(entry === undefined ? {} : { entry }) });
      return shown.kind === "ready" ? [shown.document, shown.title, shown.line, shown.entry?.title] : shown;
    };
    expect(await titled()).toEqual([doc("The template's draft"), "Preview: Dawn swims, redrafted", PREVIEW_LINE, "Dawn swims, redrafted"]);
    expect(await titled(2)).toEqual([doc("The template's draft"), "Preview: Winter series", PREVIEW_LINE, "Winter series"]);
    expect(await titled("sample")).toEqual([doc("The template's draft"), `Preview: ${SAMPLE_TITLE}`, PREVIEW_LINE, SAMPLE_TITLE]);
  });

  test("a link of the site to an entry finds it by its live address, never a draft's", async () => {
    const shown = await readShown(withNews(), { kind: "entry", entryId: 1 });
    const site = shown.kind === "ready" ? shown.site : null;
    expect(["/news/dawn-swims", "/news/dawn-swims/?from=list#top", "/news/winter-series", "/events/dawn-swims", "/dawn-swims"].map((href) => entryAt(site, href)?.id ?? null))
      .toEqual([1, 1, null, null, null]);
  });
});
