// A demo page opened straight from its address in a browser that has no
// pages yet: the example site goes in first, then the page is read, so the
// preview of one of its pages shows that page.
import { describe, expect, test } from "vitest";
import type { StorageAdapter } from "../storage/adapter.ts";
import { withExampleSite } from "../storage/example-site.ts";
import { PREVIEW_LINE, readShown } from "./PageView.tsx";

// A store that is empty until the seed puts page 1 in, a tick later.
function emptyUntilSeeded() {
  let seeded = false;
  const base = {
    name: "browser",
    listPages: async () => (seeded ? [{ id: 1, title: "Home", slug: "home", home: true, published: null }] : []),
    getPage: async (id: number) => {
      if (!seeded || id !== 1) throw new Error("There is nothing at this address.");
      return { id: 1, draft: { document: { schemaVersion: 1, title: "Home", sections: [] } }, published: null };
    },
    getSite: async () => ({ name: "Example" }),
    getSiteStyle: async () => ({}),
    listMedia: async () => [],
  } as unknown as StorageAdapter;
  const adapter = withExampleSite(base, async () => {
    await new Promise((done) => setTimeout(done, 0));
    seeded = true;
  });
  return adapter;
}

describe("a demo page read in a browser with no pages yet", () => {
  test("the preview of a page of the example site shows it once the seed is in", async () => {
    const shown = await readShown(emptyUntilSeeded(), { kind: "preview", pageId: 1 });
    expect(shown).toMatchObject({ kind: "ready", title: "Home", line: PREVIEW_LINE });
  });
});
