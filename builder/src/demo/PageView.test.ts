// A demo page as its tab reads it: in a browser that has no pages yet, the
// example site goes in first, then the page is read, so the preview of one
// of its pages shows that page. The site's header and footer are drawn
// around it as the CMS draws them: their drafts in a preview; published,
// what each published, or its starter while it has published nothing. A
// part's own preview is the home page's.
import { describe, expect, test } from "vitest";
import { SITE_THEME } from "virtual:site-theme";
import type { StorageAdapter } from "../storage/adapter.ts";
import { withExampleSite } from "../storage/example-site.ts";
import { NO_HOME_LINE, PREVIEW_LINE, readShown } from "./PageView.tsx";

const doc = (title: string) => ({ schemaVersion: 1, title, sections: [] });
const summary = (id: number, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, title: kind, slug: kind === "page" ? "home" : null, home: kind === "page", published: null, ...extra });

// A store that is empty until the seed puts its home page in, a tick
// later; its header has published version 2, its footer nothing.
function emptyUntilSeeded(options: { pages?: boolean } = {}) {
  let seeded = false;
  const parts = [summary(4, "header", { published: { versionNumber: 2 } }), summary(5, "footer")];
  const base = {
    name: "browser",
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
