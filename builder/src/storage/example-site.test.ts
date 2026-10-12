// The demo's seed on a storage that records what it is asked: the example
// site goes into an empty site the way the CMS's seed puts it in, pictures
// first, then each page saved, published, and the home page set; never into
// a site that has a page or a picture; and nothing is kept when a file is
// missing or a page names a picture site.json does not list.
import { describe, expect, test } from "vitest";
import site from "../../../example-site/site.json";
import type { Invalid, MediaItem, StorageAdapter } from "./adapter.ts";
import { builtFiles, seedExampleSite, withExampleSite, withLibraryIds, type ExampleSource, type SeedMarks } from "./example-site.ts";

const pages: Record<string, unknown> = {
  "pages/a.json": { schemaVersion: 1, title: "Home", sections: [{ type: "section", children: [{ type: "image", props: { mediaId: "pic-1" } }] }] },
  "pages/b.json": { schemaVersion: 1, title: "Second", sections: [{ type: "gallery", props: { items: [{ mediaId: "pic-2" }, { mediaId: "pic-1" }] } }] },
};
const source = (changes: Partial<ExampleSource> = {}): ExampleSource => ({
  site: {
    name: "Test site",
    images: [{ id: "pic-1", file: "images/one.png", alt: "The first" }, { id: "pic-2", file: "images/two.png", alt: "The second" }],
    pages: [{ slug: "home", file: "pages/a.json", home: true }, { slug: "second", file: "pages/b.json", home: false }],
  },
  pages,
  image: async (file) => ({ bytes: new Blob([file], { type: "image/png" }), width: file.length * 10, height: 7 }),
  ...changes,
});

// The seed's mark, kept here instead of in localStorage.
function marks(start: string | null = null): SeedMarks & { state: string | null } {
  const held = { state: start, read: () => held.state, write: (state: string) => { held.state = state; } };
  return held;
}

const refused: Invalid = { kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [{ pointer: "/alt", blockPointer: null, keyword: "maxLength", message: "is too long" }] };

// What the seed asked, in order, and a storage that holds `existing`.
function recorder(existing: { pages?: number; media?: number } = {}, refuse: string | null = null) {
  const calls: string[] = [];
  let pageId = 0;
  let mediaId = 0;
  const adapter = {
    name: "recorder",
    listPages: async () => Array.from({ length: existing.pages ?? 0 }, () => ({})),
    listMedia: async () => Array.from({ length: existing.media ?? 0 }, () => ({})),
    // The header and footer as a new store makes them, nothing published.
    listParts: async () => [{ id: 101, kind: "header", revision: 0, published: null }, { id: 102, kind: "footer", revision: 0, published: null }],
    uploadMedia: async (upload: { file: File; width: number; height: number; alt?: string }) => {
      calls.push(`upload ${upload.file.name} ${upload.width}x${upload.height} "${upload.alt}"`);
      if (refuse === upload.file.name) return { ok: false, problem: refused };
      return { ok: true, value: { id: `lib${++mediaId}` } as MediaItem };
    },
    createPage: async (page: { title: string; slug: string }) => {
      calls.push(`create ${page.slug} "${page.title}"`);
      return { ok: true, value: { page: { id: ++pageId }, draft: { revision: 0 } } };
    },
    saveDraft: async (id: number, save: { revision: number; saveId: string; document: unknown }) => {
      calls.push(`save ${id} at ${save.revision} as ${save.saveId}: ${JSON.stringify(save.document).match(/lib\d/g)?.join(",") ?? "no images"}`);
      return { ok: true, value: { revision: save.revision + 1 } };
    },
    publish: async (id: number, request: { revision?: number }) => {
      calls.push(`publish ${id} at ${request.revision}`);
      return { ok: true, value: {} };
    },
    updatePage: async (id: number, changes: { home?: boolean }) => {
      calls.push(`page ${id} ${JSON.stringify(changes)}`);
      return { ok: true, value: {} };
    },
  };
  return { adapter: adapter as unknown as StorageAdapter, calls };
}

describe("the demo's seed", () => {
  test("puts the example site into an empty site: pictures, then each page saved and published, and the home page; then the header and footer published as they are", async () => {
    const { adapter, calls } = recorder();
    expect(await seedExampleSite(adapter, source(), marks())).toBe("seeded");
    expect(calls).toEqual([
      'upload one.png 140x7 "The first"',
      'upload two.png 140x7 "The second"',
      'create home "Home"',
      "save 1 at 0 as example-home: lib1",
      "publish 1 at 1",
      'page 1 {"home":true}',
      'create second "Second"',
      "save 2 at 0 as example-second: lib2,lib1",
      "publish 2 at 1",
      "publish 101 at 0",
      "publish 102 at 0",
    ]);
  });

  test("leaves a site with a page, or with a picture, as it is", async () => {
    for (const existing of [{ pages: 1 }, { media: 1 }]) {
      const { adapter, calls } = recorder(existing);
      expect(await seedExampleSite(adapter, source(), marks())).toBe("not empty");
      expect(calls).toEqual([]);
    }
  });

  test("keeps nothing when a page is not in the build, or names a picture site.json does not list", async () => {
    const missing = recorder();
    await expect(seedExampleSite(missing.adapter, source({ pages: { "pages/a.json": pages["pages/a.json"] } }), marks())).rejects.toThrow("The example site's pages/b.json is not in this build.");
    expect(missing.calls).toEqual([]);
    const unlisted = recorder();
    const stray = { ...pages, "pages/b.json": { schemaVersion: 1, title: "Second", sections: [{ type: "image", props: { mediaId: "pic-9" } }] } };
    await expect(seedExampleSite(unlisted.adapter, source({ pages: stray }), marks())).rejects.toThrow('example-site/pages/b.json names the image "pic-9", which site.json does not list');
    expect(unlisted.calls).toEqual([]);
  });

  test("stops at a refused picture, naming it", async () => {
    const { adapter, calls } = recorder({}, "two.png");
    await expect(seedExampleSite(adapter, source(), marks())).rejects.toThrow("The example site's picture images/two.png was refused: is too long");
    expect(calls).toEqual(['upload one.png 140x7 "The first"', 'upload two.png 140x7 "The second"']);
  });

  test("swaps each mediaId for the library's, at any depth, and nothing else", () => {
    const ids = new Map([["a", "LIB_A"]]);
    expect(withLibraryIds({ mediaId: "a", alt: "a", items: [{ mediaId: "a", id: "a" }] }, ids, "x.json")).toEqual({ mediaId: "LIB_A", alt: "a", items: [{ mediaId: "LIB_A", id: "a" }] });
  });

  test("the build holds every page and picture site.json lists", () => {
    const built = builtFiles();
    expect(built.pages).toEqual(site.pages.map((page) => page.file).sort());
    expect(built.images).toEqual(site.images.map((image) => image.file).sort());
  });
});

// A storage that keeps what it is given, as the browser's does, and can be
// cut short once: an upload of the named file, or a publish of the page or
// part with that id, throws as a closed tab or a full storage would.
function store(cut: { upload?: string; publish?: number } = {}) {
  const media: Array<{ id: string; filename: string; alt: string }> = [];
  const pages: Array<{ id: number; slug: string; title: string; home: boolean; revision: number; published: object | null }> = [];
  // The header and footer, made as a new store makes them.
  const parts = [{ id: 101, kind: "header", revision: 0, published: null as object | null }, { id: 102, kind: "footer", revision: 0, published: null as object | null }];
  const adapter = {
    name: "store",
    listPages: async () => pages.map((page) => ({ ...page })),
    listParts: async () => parts.map((part) => ({ ...part })),
    listMedia: async () => media.map((item) => ({ ...item })),
    uploadMedia: async ({ file, alt }: { file: File; alt?: string }) => {
      if (cut.upload === file.name) {
        delete cut.upload;
        throw new Error("The storage is full.");
      }
      const item = { id: `lib${media.length + 1}`, filename: file.name, alt: alt ?? "" };
      media.push(item);
      return { ok: true, value: item };
    },
    createPage: async ({ title, slug }: { title: string; slug: string }) => {
      if (pages.some((page) => page.slug === slug)) return { ok: false, problem: refused };
      const page = { id: pages.length + 1, slug, title, home: false, revision: 0, published: null };
      pages.push(page);
      return { ok: true, value: { page: { id: page.id }, draft: { revision: 0 } } };
    },
    saveDraft: async (id: number, save: { revision: number }) => {
      const page = pages.find((each) => each.id === id)!;
      if (save.revision !== page.revision) return { ok: false, problem: { kind: "conflict", message: "Another save came first." } };
      page.revision += 1;
      return { ok: true, value: { revision: page.revision } };
    },
    publish: async (id: number) => {
      if (cut.publish === id) {
        delete cut.publish;
        throw new Error("The tab was closed.");
      }
      [...pages, ...parts].find((each) => each.id === id)!.published = {};
      return { ok: true, value: {} };
    },
    updatePage: async (id: number, changes: { home?: boolean }) => {
      pages.find((each) => each.id === id)!.home = changes.home === true;
      return { ok: true, value: {} };
    },
  };
  return { adapter: adapter as unknown as StorageAdapter, media, pages, parts };
}

// The example site as a whole: each picture once, each page once,
// published, the home page set, and the header and footer published.
function whole(kept: ReturnType<typeof store>) {
  expect(kept.media.map((item) => item.filename)).toEqual(["one.png", "two.png"]);
  expect(kept.pages.map((page) => [page.slug, page.home, page.published !== null])).toEqual([["home", true, true], ["second", false, true]]);
  expect(kept.parts.map((part) => [part.kind, part.published !== null])).toEqual([["header", true], ["footer", true]]);
}

describe("a seed cut short", () => {
  test("is finished by the next visit, after a picture: nothing put in twice", async () => {
    const kept = store({ upload: "two.png" });
    const mark = marks();
    await expect(seedExampleSite(kept.adapter, source(), mark)).rejects.toThrow("The storage is full.");
    expect(mark.state).toBe("seeding");
    expect(kept.media).toHaveLength(1);
    expect(await seedExampleSite(kept.adapter, source(), mark)).toBe("seeded");
    whole(kept);
    expect(mark.state).toBe("seeded");
  });

  test("is finished by the next visit, after a page was made and saved: the same page goes on", async () => {
    const kept = store({ publish: 1 });
    const mark = marks();
    await expect(seedExampleSite(kept.adapter, source(), mark)).rejects.toThrow("The tab was closed.");
    expect(kept.pages).toHaveLength(1);
    expect(await seedExampleSite(kept.adapter, source(), mark)).toBe("seeded");
    whole(kept);
  });

  test("is finished by the next visit, after the header was published: the footer goes on, the header left as it is", async () => {
    const kept = store({ publish: 102 });
    const mark = marks();
    await expect(seedExampleSite(kept.adapter, source(), mark)).rejects.toThrow("The tab was closed.");
    const header = kept.parts[0]!.published;
    expect(header).not.toBeNull();
    expect(await seedExampleSite(kept.adapter, source(), mark)).toBe("seeded");
    whole(kept);
    expect(kept.parts[0]!.published, "the same publish, not a second").toBe(header);
  });

  test("a whole seed is never put in again, even into a site that looks empty", async () => {
    const kept = store();
    expect(await seedExampleSite(kept.adapter, source(), marks("seeded"))).toBe("not empty");
    expect(kept.media).toEqual([]);
    expect(kept.pages).toEqual([]);
  });

  test("with no mark, a site with a page or a picture is still left as it is", async () => {
    const kept = store();
    await kept.adapter.uploadMedia({ file: new File(["x"], "mine.png"), width: 1, height: 1, alt: "Mine" });
    const mark = marks();
    expect(await seedExampleSite(kept.adapter, source(), mark)).toBe("not empty");
    expect(kept.media.map((item) => item.filename)).toEqual(["mine.png"]);
    expect(mark.state).toBeNull();
  });
});

describe("the adapter that waits for the seed", () => {
  test("lists the header and footer once the seed is done too, the seed run once for both", async () => {
    const said: string[] = [];
    const base = {
      name: "base",
      listPages: async () => { said.push("pages"); return []; },
      listParts: async () => { said.push("parts"); return []; },
    } as unknown as StorageAdapter;
    const adapter = withExampleSite(base, async () => {
      said.push("seed");
      await new Promise((done) => setTimeout(done, 0));
      said.push("seeded");
    });
    await Promise.all([adapter.listParts(), adapter.listPages()]);
    expect(said.slice(0, 2)).toEqual(["seed", "seeded"]);
    expect(said.slice(2).sort()).toEqual(["pages", "parts"]);
  });

  test("lists the pages once the seed is done, seeds once, and seeds again after a failure", async () => {
    const said: string[] = [];
    let fail = true;
    const base = { name: "base", listPages: async () => { said.push("listed"); return []; } } as unknown as StorageAdapter;
    const adapter = withExampleSite(base, async () => {
      said.push("seed");
      if (fail) throw new Error("the storage is full");
    });
    await expect(adapter.listPages()).rejects.toThrow("the storage is full");
    fail = false;
    await adapter.listPages();
    await adapter.listPages();
    expect(said).toEqual(["seed", "seed", "listed", "listed"]);
    expect(adapter.name).toBe("base");
  });
});
