// The example site, put into the browser's storage on the demo's first
// visit as the CMS's seed puts it into the CMS (cms/db/seeds/example_site.rb):
// the same pages and pictures, from ../../../example-site/, read when the
// demo is built. Each picture goes into the media library the way an
// upload does; then each page is made, its document saved as the draft
// with its images named by the ids the library gave them, and published;
// and the home page is set.
//
// Only into an empty site, with no page and no image: a site someone has
// worked on is never added to. Two tabs opened at once on a first visit
// would each find the site empty, so the seed holds one of the browser's
// locks (Web Locks, shared by the tabs of one origin) while it looks and
// puts.
//
// It lives with the storage because it reads the pictures' bytes from the
// demo's own files: only src/storage/ sends requests.
import siteFile from "../../../example-site/site.json";
import type { PageDocument } from "../shared/document.ts";
import type { Invalid, StorageAdapter } from "./adapter.ts";

export interface ExampleSiteFile {
  name: string;
  images: Array<{ id: string; file: string; alt: string }>;
  pages: Array<{ slug: string; file: string; home: boolean }>;
}

// What the seed reads: site.json, the pages' documents by their file
// name in site.json, and a picture's bytes by its file name.
export interface ExampleSource {
  site: ExampleSiteFile;
  pages: Readonly<Record<string, unknown>>;
  image(file: string): Promise<{ bytes: Blob; width: number; height: number }>;
}

export const SEED_LOCK = "page-builder-cms:example-site";

// The ids of site.json in a document's mediaId keys, swapped for the
// library's: the twin of the seed's with_library_ids.
export function withLibraryIds(node: unknown, ids: ReadonlyMap<string, string>, file: string): unknown {
  if (Array.isArray(node)) return node.map((value) => withLibraryIds(value, ids, file));
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (key !== "mediaId") return [key, withLibraryIds(value, ids, file)];
    const id = ids.get(value as string);
    if (id === undefined) throw new Error(`example-site/${file} names the image ${JSON.stringify(value)}, which site.json does not list`);
    return [key, id];
  }));
}

const refusal = (what: string, problem: Invalid): Error =>
  new Error(`The example site's ${what} was refused: ${problem.errors[0]?.message ?? problem.message}`);

// Puts the example site in when the site is empty; says which it did.
export async function seedExampleSite(adapter: StorageAdapter, source: ExampleSource): Promise<"seeded" | "not empty"> {
  const putIn = async (): Promise<"seeded" | "not empty"> => {
    const [pages, media] = await Promise.all([adapter.listPages(), adapter.listMedia()]);
    if (pages.length > 0 || media.length > 0) return "not empty";
    // Every file read, and every image a page names found in site.json,
    // before anything is kept: a file missing from the build stops the seed
    // with nothing half done.
    const listed = new Map(source.site.images.map((image) => [image.id, image.id]));
    for (const page of source.site.pages) {
      if (!(page.file in source.pages)) throw new Error(`The example site's ${page.file} is not in this build.`);
      withLibraryIds(source.pages[page.file], listed, page.file);
    }
    const pictures = await Promise.all(source.site.images.map(async (image) => ({ image, read: await source.image(image.file) })));

    const ids = new Map<string, string>();
    for (const { image, read } of pictures) {
      const name = image.file.slice(image.file.lastIndexOf("/") + 1);
      const file = new File([read.bytes], name, { type: read.bytes.type || "image/png" });
      const added = await adapter.uploadMedia({ file, width: read.width, height: read.height, alt: image.alt });
      if (!added.ok) throw refusal(`picture ${image.file}`, added.problem);
      ids.set(image.id, added.value.id);
    }
    for (const entry of source.site.pages) {
      const document = withLibraryIds(source.pages[entry.file], ids, entry.file) as PageDocument;
      const made = await adapter.createPage({ title: document.title, slug: entry.slug });
      if (!made.ok) throw refusal(`page ${entry.file}`, made.problem);
      const id = made.value.page.id;
      const saved = await adapter.saveDraft(id, { revision: made.value.draft.revision, saveId: `example-${entry.slug}`, document });
      if (!saved.ok) throw new Error(`The example site's page ${entry.file} was not saved: ${saved.problem.message}`);
      const published = await adapter.publish(id, { revision: saved.value.revision });
      if (!published.ok) throw new Error(`The example site's page ${entry.file} was not published: ${published.problem.message}`);
      if (entry.home) {
        const home = await adapter.updatePage(id, { home: true });
        if (!home.ok) throw refusal(`home page ${entry.file}`, home.problem);
      }
    }
    return "seeded";
  };
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(SEED_LOCK, putIn) : putIn();
}

// The adapter, whose first listing of the pages waits for the seed: the
// editor lists them first, so it opens on the example site. A seed that
// failed is tried again by the next listing (the editor's Try again),
// which finds the site as the failure left it, and adds to it only if it
// is still empty.
export function withExampleSite(adapter: StorageAdapter, seed: () => Promise<unknown>): StorageAdapter {
  let seeding: Promise<unknown> | null = null;
  return {
    ...adapter,
    listPages(options) {
      seeding ??= seed().catch((error: unknown) => {
        seeding = null;
        throw error;
      });
      return seeding.then(() => adapter.listPages(options));
    },
  };
}

// The example site as the demo's build holds it: the documents bundled,
// the pictures as files of their own beside the bundle, fetched from the
// demo's own address when they are put in.
const builtPages = import.meta.glob<unknown>("../../../example-site/pages/*.json", { eager: true, import: "default" });
const builtImages = import.meta.glob<string>("../../../example-site/images/*.png", { eager: true, query: "?url", import: "default" });

// By their file name in site.json ("pages/home.json", "images/m-tea.png").
const byFile = <T>(found: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(found).map(([path, value]) => [path.slice(path.indexOf("example-site/") + "example-site/".length), value]));

// The files the build holds, which every name in site.json must be.
export function builtFiles(): { pages: string[]; images: string[] } {
  return { pages: Object.keys(byFile(builtPages)).sort(), images: Object.keys(byFile(builtImages)).sort() };
}

export function builtSource(site: ExampleSiteFile = siteFile): ExampleSource {
  const pages = byFile(builtPages);
  const images = byFile(builtImages);
  return {
    site,
    pages,
    async image(file) {
      const address = images[file];
      if (address === undefined) throw new Error(`The example site's picture ${file} is not in this build.`);
      const response = await fetch(address);
      if (!response.ok) throw new Error(`The example site's picture ${file} could not be read (${response.status}).`);
      const bytes = await response.blob();
      const bitmap = await createImageBitmap(bytes);
      try {
        return { bytes, width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    },
  };
}
